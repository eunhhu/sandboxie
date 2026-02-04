import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { resolve } from 'path';
import { config } from './config';
import { authRoutes } from './routes/auth';
import { sessionRoutes } from './routes/sessions';

const STATIC_DIR = resolve(import.meta.dir, '../../frontend/build');

const app = new Elysia()
  .use(cors())
  .get('/api/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }))
  .use(authRoutes)
  .use(sessionRoutes)
  .get('/*', async ({ path }) => {
    const indexFile = resolve(STATIC_DIR, 'index.html');

    if (path === '/') {
      return new Response(Bun.file(indexFile), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const filePath = resolve(STATIC_DIR, `.${path}`);

    if (!filePath.startsWith(STATIC_DIR)) {
      return new Response('Forbidden', { status: 403 });
    }

    const file = Bun.file(filePath);
    if (await file.exists() && file.size > 0) {
      return new Response(file);
    }

    return new Response(Bun.file(indexFile), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  })
  .listen({
    port: config.port,
    hostname: config.host,
  });

console.log(`Server running at http://${app.server?.hostname}:${app.server?.port}`);
