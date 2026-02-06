import { eq, desc, and } from 'drizzle-orm';
import { db } from '../db';
import { sessions, agentTasks, type AgentTask } from '../db/schema';
import { decrypt } from '../utils/crypto';
import * as pushService from './push';

const TASK_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes default

export async function enableAgent(username: string): Promise<void> {
  const result = await db
    .update(sessions)
    .set({ agentEnabled: true })
    .where(eq(sessions.username, username))
    .returning();
  if (result.length === 0) throw new Error('Session not found');
}

export async function disableAgent(username: string): Promise<void> {
  const result = await db
    .update(sessions)
    .set({ agentEnabled: false })
    .where(eq(sessions.username, username))
    .returning();
  if (result.length === 0) throw new Error('Session not found');
}

export async function updateApiKeys(username: string, keys: {
  anthropicApiKey?: string | null;
  openaiApiKey?: string | null;
}): Promise<void> {
  const { encrypt } = await import('../utils/crypto');
  const update: Record<string, string | null> = {};

  if (keys.anthropicApiKey !== undefined) {
    update.anthropicApiKey = keys.anthropicApiKey ? encrypt(keys.anthropicApiKey) : null;
  }
  if (keys.openaiApiKey !== undefined) {
    update.openaiApiKey = keys.openaiApiKey ? encrypt(keys.openaiApiKey) : null;
  }

  const result = await db
    .update(sessions)
    .set(update)
    .where(eq(sessions.username, username))
    .returning();
  if (result.length === 0) throw new Error('Session not found');
}

export async function getApiKeyStatus(username: string): Promise<{
  anthropic: boolean;
  openai: boolean;
}> {
  const result = await db
    .select({
      anthropicApiKey: sessions.anthropicApiKey,
      openaiApiKey: sessions.openaiApiKey,
    })
    .from(sessions)
    .where(eq(sessions.username, username));
  if (result.length === 0) throw new Error('Session not found');

  return {
    anthropic: !!result[0].anthropicApiKey,
    openai: !!result[0].openaiApiKey,
  };
}

export async function submitTask(username: string, opts: {
  agent: 'claude' | 'codex';
  prompt: string;
  workingDir?: string;
}): Promise<AgentTask> {
  // Get session
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.username, username));
  if (!session) throw new Error('Session not found');
  if (!session.agentEnabled) throw new Error('Agent is not enabled for this session');
  if (session.status !== 'running') throw new Error('Session is not running');

  // Check API key
  const encryptedKey = opts.agent === 'claude' ? session.anthropicApiKey : session.openaiApiKey;
  if (!encryptedKey) {
    throw new Error(`No ${opts.agent === 'claude' ? 'Anthropic' : 'OpenAI'} API key configured for this session`);
  }

  const apiKey = decrypt(encryptedKey);

  // Insert task into DB
  const [task] = await db
    .insert(agentTasks)
    .values({
      sessionId: session.id,
      agent: opts.agent,
      prompt: opts.prompt,
      workingDir: opts.workingDir || '~/',
      status: 'queued',
    })
    .returning();

  // Send task to container's agent-runner
  try {
    const agentUrl = `http://127.0.0.1:${session.agentPort}`;
    const res = await fetch(`${agentUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: opts.agent,
        prompt: opts.prompt,
        workingDir: opts.workingDir || '~/',
        apiKey,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error((errData as any).error || `Agent runner returned ${res.status}`);
    }

    const data = await res.json() as { task: { id: string } };

    // Update task to running
    const [updated] = await db
      .update(agentTasks)
      .set({
        status: 'running',
        startedAt: new Date(),
      })
      .where(eq(agentTasks.id, task.id))
      .returning();

    // Start polling for task completion
    pollTaskCompletion(username, task.id, session.agentPort, data.task.id);

    return updated;
  } catch (err) {
    // Mark task as failed
    const [failed] = await db
      .update(agentTasks)
      .set({
        status: 'failed',
        error: err instanceof Error ? err.message : 'Failed to start task',
        completedAt: new Date(),
      })
      .where(eq(agentTasks.id, task.id))
      .returning();
    throw err;
  }
}

// Poll agent-runner for task completion and update DB
function pollTaskCompletion(username: string, dbTaskId: string, agentPort: number, runnerTaskId: string): void {
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${agentPort}/tasks/${runnerTaskId}`);
      if (!res.ok) {
        clearInterval(interval);
        return;
      }

      const data = await res.json() as { task: { status: string; output: string; exitCode: number | null; error: string | null } };
      const runnerTask = data.task;

      if (runnerTask.status === 'running') return; // Still running

      clearInterval(interval);

      // Update DB
      await db
        .update(agentTasks)
        .set({
          status: runnerTask.status as any,
          output: runnerTask.output,
          exitCode: runnerTask.exitCode,
          error: runnerTask.error,
          completedAt: new Date(),
        })
        .where(eq(agentTasks.id, dbTaskId));

      // Send push notification
      try {
        const statusText = runnerTask.status === 'completed' ? '완료' : '실패';
        await pushService.sendNotificationToAll({
          title: `에이전트 작업 ${statusText}`,
          body: `[${username}] ${runnerTask.status === 'completed' ? '✅' : '❌'} 작업이 ${statusText}되었습니다.`,
          url: `/a/${username}/task/${dbTaskId}`,
        });
      } catch (pushErr) {
        console.warn('[agent] Push notification failed:', pushErr instanceof Error ? pushErr.message : pushErr);
      }
    } catch (err) {
      // Network error — agent-runner might be down
      console.warn(`[agent] Poll failed for ${dbTaskId}:`, err instanceof Error ? err.message : err);
    }
  }, 3000); // Poll every 3 seconds

  // Timeout: cancel after TASK_TIMEOUT_MS
  setTimeout(async () => {
    clearInterval(interval);
    // Check if still running
    const [task] = await db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.id, dbTaskId));
    if (task && task.status === 'running') {
      // Try to cancel in runner
      try {
        await fetch(`http://127.0.0.1:${agentPort}/tasks/${runnerTaskId}`, { method: 'DELETE' });
      } catch {}
      await db
        .update(agentTasks)
        .set({
          status: 'failed',
          error: 'Task timed out',
          completedAt: new Date(),
        })
        .where(eq(agentTasks.id, dbTaskId));
    }
  }, TASK_TIMEOUT_MS);
}

export async function cancelTask(username: string, taskId: string): Promise<AgentTask> {
  const [session] = await db.select().from(sessions).where(eq(sessions.username, username));
  if (!session) throw new Error('Session not found');

  const [task] = await db.select().from(agentTasks).where(eq(agentTasks.id, taskId));
  if (!task) throw new Error('Task not found');
  if (task.sessionId !== session.id) throw new Error('Task does not belong to this session');

  if (task.status === 'running' || task.status === 'queued') {
    // Try to cancel in runner (best-effort)
    try {
      await fetch(`http://127.0.0.1:${session.agentPort}/tasks/${taskId}`, { method: 'DELETE' });
    } catch {}

    const [updated] = await db
      .update(agentTasks)
      .set({
        status: 'cancelled',
        completedAt: new Date(),
      })
      .where(eq(agentTasks.id, taskId))
      .returning();
    return updated;
  }

  return task;
}

export async function listTasks(username: string): Promise<AgentTask[]> {
  const [session] = await db.select().from(sessions).where(eq(sessions.username, username));
  if (!session) throw new Error('Session not found');

  return db
    .select()
    .from(agentTasks)
    .where(eq(agentTasks.sessionId, session.id))
    .orderBy(desc(agentTasks.createdAt));
}

export async function getTask(username: string, taskId: string): Promise<AgentTask> {
  const [session] = await db.select().from(sessions).where(eq(sessions.username, username));
  if (!session) throw new Error('Session not found');

  const [task] = await db.select().from(agentTasks).where(eq(agentTasks.id, taskId));
  if (!task) throw new Error('Task not found');
  if (task.sessionId !== session.id) throw new Error('Task does not belong to this session');

  return task;
}

export async function getTaskStream(username: string, taskId: string): Promise<{ agentPort: number; session: any }> {
  const [session] = await db.select().from(sessions).where(eq(sessions.username, username));
  if (!session) throw new Error('Session not found');

  const [task] = await db.select().from(agentTasks).where(eq(agentTasks.id, taskId));
  if (!task) throw new Error('Task not found');
  if (task.sessionId !== session.id) throw new Error('Task does not belong to this session');

  return { agentPort: session.agentPort, session };
}
