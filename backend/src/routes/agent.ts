import { Elysia, t } from 'elysia';
import { jwtPlugin, verifyAuth } from '../middleware/auth';
import * as agentService from '../services/agent';

export const agentRoutes = new Elysia({ prefix: '/api/sessions/:username/agent' })
  .use(jwtPlugin)
  .guard({
    beforeHandle: verifyAuth,
  })
  .post('/enable', async ({ params, set }) => {
    try {
      await agentService.enableAgent(params.username);
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      if (msg.includes('not found')) { set.status = 404; return { error: msg }; }
      set.status = 500;
      return { error: msg };
    }
  })
  .post('/disable', async ({ params, set }) => {
    try {
      await agentService.disableAgent(params.username);
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      if (msg.includes('not found')) { set.status = 404; return { error: msg }; }
      set.status = 500;
      return { error: msg };
    }
  })
  .put('/keys', async ({ params, body, set }) => {
    try {
      await agentService.updateApiKeys(params.username, {
        anthropicApiKey: body.anthropicApiKey,
        openaiApiKey: body.openaiApiKey,
      });
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      if (msg.includes('not found')) { set.status = 404; return { error: msg }; }
      set.status = 500;
      return { error: msg };
    }
  }, {
    body: t.Object({
      anthropicApiKey: t.Optional(t.Union([t.String(), t.Null()])),
      openaiApiKey: t.Optional(t.Union([t.String(), t.Null()])),
    }),
  })
  .get('/keys', async ({ params, set }) => {
    try {
      const status = await agentService.getApiKeyStatus(params.username);
      return status;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      if (msg.includes('not found')) { set.status = 404; return { error: msg }; }
      set.status = 500;
      return { error: msg };
    }
  })
  .get('/tasks', async ({ params, set }) => {
    try {
      const tasks = await agentService.listTasks(params.username);
      return { tasks };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      if (msg.includes('not found')) { set.status = 404; return { error: msg }; }
      set.status = 500;
      return { error: msg };
    }
  })
  .post('/tasks', async ({ params, body, set }) => {
    try {
      const task = await agentService.submitTask(params.username, {
        agent: body.agent,
        prompt: body.prompt,
        workingDir: body.workingDir,
      });
      return { task };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      if (msg.includes('not found')) { set.status = 404; return { error: msg }; }
      if (msg.includes('not enabled') || msg.includes('No ')) { set.status = 400; return { error: msg }; }
      set.status = 500;
      console.error('[agent] Task submit failed:', msg);
      return { error: msg };
    }
  }, {
    body: t.Object({
      agent: t.Union([t.Literal('claude'), t.Literal('codex')]),
      prompt: t.String({ minLength: 1 }),
      workingDir: t.Optional(t.String()),
    }),
  })
  .get('/tasks/:taskId', async ({ params, set }) => {
    try {
      const task = await agentService.getTask(params.username, params.taskId);
      return { task };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      if (msg.includes('not found')) { set.status = 404; return { error: msg }; }
      set.status = 500;
      return { error: msg };
    }
  })
  .get('/tasks/:taskId/stream', async ({ params, set }) => {
    try {
      const { agentPort } = await agentService.getTaskStream(params.username, params.taskId);
      // Proxy SSE from agent-runner
      const res = await fetch(`http://127.0.0.1:${agentPort}/tasks/${params.taskId}/stream`);
      if (!res.ok || !res.body) {
        set.status = 502;
        return { error: 'Agent runner stream unavailable' };
      }
      return new Response(res.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      if (msg.includes('not found')) { set.status = 404; return { error: msg }; }
      set.status = 502;
      return { error: 'Agent runner unavailable' };
    }
  })
  .delete('/tasks/:taskId', async ({ params, set }) => {
    try {
      const task = await agentService.cancelTask(params.username, params.taskId);
      return { task };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      if (msg.includes('not found')) { set.status = 404; return { error: msg }; }
      set.status = 500;
      return { error: msg };
    }
  });
