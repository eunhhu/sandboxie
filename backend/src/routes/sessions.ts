import { Elysia, t } from 'elysia';
import { jwtPlugin, verifyAuth } from '../middleware/auth';
import * as sessionService from '../services/session';

export const sessionRoutes = new Elysia({ prefix: '/api/sessions' })
  .use(jwtPlugin)
  .guard({
    beforeHandle: verifyAuth,
  })
  .get('/', async () => {
    const sessions = await sessionService.listSessions();
    return { sessions };
  })
  .post('/', async ({ body, set }) => {
    try {
      const session = await sessionService.createSession({
        username: body.username,
        password: body.password,
        memoryLimit: body.memoryLimit,
        cpuLimit: body.cpuLimit,
        ttl: body.ttl,
      });

      const { password: _, ...sessionData } = session;
      return {
        session: sessionData,
        sshCommand: `ssh ${session.username}@${session.subdomain}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create session';

      // Distinguish client vs server errors
      if (message.includes('already exists') || message.includes('duplicate')) {
        set.status = 409;
        return { error: 'Session already exists for this username' };
      }

      set.status = 500;
      console.error('[sessions] Create failed:', message);
      return { error: 'Failed to create session' };
    }
  }, {
    body: t.Object({
      username: t.String({ minLength: 2, maxLength: 30, pattern: '^[a-zA-Z0-9]+$' }),
      password: t.String({ minLength: 4, maxLength: 128 }),
      memoryLimit: t.Optional(t.Number({ minimum: 64, maximum: 1024 })),
      cpuLimit: t.Optional(t.Number({ minimum: 0.1, maximum: 2 })),
      ttl: t.Optional(t.Number({ minimum: 0, maximum: 8760 })), // max 1 year in hours
    }),
  })
  .delete('/:username', async ({ params, set }) => {
    try {
      await sessionService.deleteSession(params.username);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Session not found';
      if (message.includes('not found')) {
        set.status = 404;
        return { error: 'Session not found' };
      }
      set.status = 500;
      console.error('[sessions] Delete failed:', message);
      return { error: 'Failed to delete session' };
    }
  })
  .post('/:username/restart', async ({ params, set }) => {
    try {
      await sessionService.restartSession(params.username);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Session not found';
      if (message.includes('not found')) {
        set.status = 404;
        return { error: 'Session not found' };
      }
      set.status = 500;
      console.error('[sessions] Restart failed:', message);
      return { error: 'Failed to restart session' };
    }
  })
  .get('/:username/stats', async ({ params, set }) => {
    try {
      return await sessionService.getSessionStats(params.username);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Session not found';
      if (message.includes('not found')) {
        set.status = 404;
        return { error: 'Session not found' };
      }
      set.status = 500;
      console.error('[sessions] Stats failed:', message);
      return { error: 'Failed to get session stats' };
    }
  });
