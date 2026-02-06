import { Elysia, t } from 'elysia';
import { jwtPlugin, verifyAuth } from '../middleware/auth';
import * as pushService from '../services/push';

export const pushRoutes = new Elysia({ prefix: '/api/push' })
  .get('/vapid-key', () => {
    return { key: pushService.getVapidPublicKey() };
  })
  .use(jwtPlugin)
  .guard({
    beforeHandle: verifyAuth,
  })
  .post('/subscribe', async ({ body, set }) => {
    try {
      await pushService.subscribe({
        endpoint: body.endpoint,
        keys: { p256dh: body.p256dh, auth: body.auth },
      });
      return { success: true };
    } catch (err) {
      set.status = 500;
      return { error: 'Failed to subscribe' };
    }
  }, {
    body: t.Object({
      endpoint: t.String(),
      p256dh: t.String(),
      auth: t.String(),
    }),
  })
  .delete('/subscribe', async ({ body, set }) => {
    try {
      await pushService.unsubscribe(body.endpoint);
      return { success: true };
    } catch (err) {
      set.status = 500;
      return { error: 'Failed to unsubscribe' };
    }
  }, {
    body: t.Object({
      endpoint: t.String(),
    }),
  });
