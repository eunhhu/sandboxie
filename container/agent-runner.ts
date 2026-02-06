#!/usr/bin/env bun

/**
 * Agent Runner — lightweight HTTP server inside each sandbox container.
 * Manages Claude Code and Codex CLI processes.
 * Listens on 127.0.0.1:9090 (mapped to host via Podman).
 */

interface Task {
  id: string;
  agent: 'claude' | 'codex';
  prompt: string;
  workingDir: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  output: string;
  exitCode: number | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  process: ReturnType<typeof Bun.spawn> | null;
  sseClients: Set<WritableStreamDefaultWriter>;
}

const tasks = new Map<string, Task>();
let taskIdCounter = 0;

function generateId(): string {
  return `task-${++taskIdCounter}-${Date.now().toString(36)}`;
}

function getAgentCommand(agent: 'claude' | 'codex', prompt: string): { cmd: string[]; env: Record<string, string> } {
  if (agent === 'claude') {
    return {
      cmd: ['claude', '-p', prompt, '--verbose'],
      env: {},
    };
  } else {
    return {
      cmd: ['codex', '--quiet', '--full-auto', prompt],
      env: {},
    };
  }
}

function startTask(task: Task, apiKey: string): void {
  const { cmd, env: extraEnv } = getAgentCommand(task.agent, task.prompt);

  const envVars: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...extraEnv,
    HOME: `/home/${process.env.SANDBOX_USER || 'sandbox'}`,
    TERM: 'xterm-256color',
  };

  if (task.agent === 'claude') {
    envVars.ANTHROPIC_API_KEY = apiKey;
  } else {
    envVars.OPENAI_API_KEY = apiKey;
  }

  const user = process.env.SANDBOX_USER || 'sandbox';

  try {
    const proc = Bun.spawn(['su', '-', user, '-c', cmd.join(' ')], {
      cwd: task.workingDir.replace('~', `/home/${user}`),
      env: envVars,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    task.process = proc;

    const readStream = async (stream: ReadableStream<Uint8Array> | null, label: string) => {
      if (!stream) return;
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          task.output += chunk;

          // Notify SSE clients
          const sseData = JSON.stringify({ type: 'output', data: chunk });
          for (const writer of task.sseClients) {
            try {
              writer.write(new TextEncoder().encode(`data: ${sseData}\n\n`));
            } catch {
              task.sseClients.delete(writer);
            }
          }
        }
      } catch {}
    };

    readStream(proc.stdout as ReadableStream<Uint8Array>, 'stdout');
    readStream(proc.stderr as ReadableStream<Uint8Array>, 'stderr');

    proc.exited.then((exitCode) => {
      task.exitCode = exitCode;
      task.status = exitCode === 0 ? 'completed' : 'failed';
      task.completedAt = new Date().toISOString();
      task.process = null;

      // Notify SSE clients of completion
      const sseData = JSON.stringify({
        type: 'done',
        status: task.status,
        exitCode,
      });
      for (const writer of task.sseClients) {
        try {
          writer.write(new TextEncoder().encode(`data: ${sseData}\n\n`));
          writer.close();
        } catch {}
      }
      task.sseClients.clear();
    });
  } catch (err) {
    task.status = 'failed';
    task.error = err instanceof Error ? err.message : String(err);
    task.completedAt = new Date().toISOString();
  }
}

function taskToJSON(task: Task) {
  return {
    id: task.id,
    agent: task.agent,
    prompt: task.prompt,
    workingDir: task.workingDir,
    status: task.status,
    output: task.output,
    exitCode: task.exitCode,
    error: task.error,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
  };
}

const server = Bun.serve({
  port: 9090,
  hostname: '0.0.0.0',

  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS headers for internal use
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    };

    // Health check
    if (path === '/health' && req.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok', tasks: tasks.size }), { headers });
    }

    // Create task
    if (path === '/tasks' && req.method === 'POST') {
      try {
        const body = await req.json() as {
          agent: 'claude' | 'codex';
          prompt: string;
          workingDir?: string;
          apiKey: string;
        };

        if (!body.agent || !body.prompt || !body.apiKey) {
          return new Response(JSON.stringify({ error: 'Missing required fields: agent, prompt, apiKey' }), {
            status: 400, headers,
          });
        }

        const id = generateId();
        const task: Task = {
          id,
          agent: body.agent,
          prompt: body.prompt,
          workingDir: body.workingDir || '~/',
          status: 'running',
          output: '',
          exitCode: null,
          error: null,
          startedAt: new Date().toISOString(),
          completedAt: null,
          process: null,
          sseClients: new Set(),
        };

        tasks.set(id, task);
        startTask(task, body.apiKey);

        return new Response(JSON.stringify({ task: taskToJSON(task) }), {
          status: 201, headers,
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Invalid request body' }), {
          status: 400, headers,
        });
      }
    }

    // Get task
    const taskMatch = path.match(/^\/tasks\/([^/]+)$/);
    if (taskMatch && req.method === 'GET') {
      const task = tasks.get(taskMatch[1]);
      if (!task) {
        return new Response(JSON.stringify({ error: 'Task not found' }), { status: 404, headers });
      }
      return new Response(JSON.stringify({ task: taskToJSON(task) }), { headers });
    }

    // Stream task output (SSE)
    const streamMatch = path.match(/^\/tasks\/([^/]+)\/stream$/);
    if (streamMatch && req.method === 'GET') {
      const task = tasks.get(streamMatch[1]);
      if (!task) {
        return new Response(JSON.stringify({ error: 'Task not found' }), { status: 404, headers });
      }

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();

          // Send existing output first
          if (task.output) {
            const data = JSON.stringify({ type: 'output', data: task.output });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }

          // If already done, close
          if (task.status !== 'running') {
            const data = JSON.stringify({ type: 'done', status: task.status, exitCode: task.exitCode });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            controller.close();
            return;
          }

          // Register for future updates
          const writer = {
            write(chunk: Uint8Array) { controller.enqueue(chunk); },
            close() { try { controller.close(); } catch {} },
          } as any;
          task.sseClients.add(writer);
        },
        cancel() {
          // Client disconnected
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Cancel task
    const cancelMatch = path.match(/^\/tasks\/([^/]+)$/);
    if (cancelMatch && req.method === 'DELETE') {
      const task = tasks.get(cancelMatch[1]);
      if (!task) {
        return new Response(JSON.stringify({ error: 'Task not found' }), { status: 404, headers });
      }

      if (task.status === 'running' && task.process) {
        try {
          task.process.kill('SIGTERM');
          // Give it 5 seconds, then SIGKILL
          setTimeout(() => {
            if (task.status === 'running' && task.process) {
              task.process.kill('SIGKILL');
            }
          }, 5000);
        } catch {}
        task.status = 'cancelled';
        task.completedAt = new Date().toISOString();
      }

      return new Response(JSON.stringify({ task: taskToJSON(task) }), { headers });
    }

    // List tasks
    if (path === '/tasks' && req.method === 'GET') {
      const allTasks = Array.from(tasks.values()).map(taskToJSON);
      return new Response(JSON.stringify({ tasks: allTasks }), { headers });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
  },
});

console.log(`[agent-runner] Listening on ${server.hostname}:${server.port}`);
