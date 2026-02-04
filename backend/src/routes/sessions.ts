import { Elysia } from 'elysia';
import { jwtPlugin, verifyAuth } from '../middleware/auth';
import * as sessionService from '../services/session';
import { config } from '../config';

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
    const { username, password, memoryLimit, cpuLimit, ttl } = body as {
      username: string;
      password: string;
      memoryLimit?: number;
      cpuLimit?: number;
      ttl?: number;
    };

    if (!/^[a-zA-Z0-9]+$/.test(username)) {
      set.status = 400;
      return { error: 'Username must contain only letters and numbers' };
    }

    if (username.length < 2 || username.length > 30) {
      set.status = 400;
      return { error: 'Username must be 2-30 characters' };
    }

    try {
      const session = await sessionService.createSession({
        username,
        password,
        memoryLimit,
        cpuLimit,
        ttl,
      });

      const { password: _, ...sessionData } = session;
      return {
        session: sessionData,
        sshCommand: `ssh ${username}@${session.subdomain}`,
      };
    } catch (err) {
      set.status = 500;
      return { error: err instanceof Error ? err.message : 'Failed to create session' };
    }
  })
  .delete('/:username', async ({ params, set }) => {
    try {
      await sessionService.deleteSession(params.username);
      return { success: true };
    } catch (err) {
      set.status = 404;
      return { error: err instanceof Error ? err.message : 'Session not found' };
    }
  })
  .post('/:username/restart', async ({ params, set }) => {
    try {
      await sessionService.restartSession(params.username);
      return { success: true };
    } catch (err) {
      set.status = 404;
      return { error: err instanceof Error ? err.message : 'Session not found' };
    }
  })
  .get('/:username/stats', async ({ params, set }) => {
    try {
      return await sessionService.getSessionStats(params.username);
    } catch (err) {
      set.status = 404;
      return { error: err instanceof Error ? err.message : 'Session not found' };
    }
  });
