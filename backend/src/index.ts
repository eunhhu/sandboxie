import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { resolve, dirname } from 'path';
import { config } from './config';
import { authRoutes } from './routes/auth';
import { sessionRoutes } from './routes/sessions';
import { terminalRoutes } from './routes/terminal';
import { agentRoutes } from './routes/agent';
import { pushRoutes } from './routes/push';

function resolveStaticDir(): string {
  if (process.env.STATIC_DIR) return resolve(process.env.STATIC_DIR);
  // dev: relative to source
  const devPath = resolve(import.meta.dir, '../../frontend/build');
  try {
    const f = Bun.file(resolve(devPath, 'index.html'));
    if (f.size > 0) return devPath;
  } catch {}
  // compiled binary: relative to executable
  const binDir = dirname(process.execPath);
  return resolve(binDir, 'frontend/build');
}

const STATIC_DIR = resolveStaticDir();

const app = new Elysia()
  .use(cors({
    origin: config.allowedOrigins
      ? config.allowedOrigins.split(',').map((o) => o.trim())
      : true, // dev: allow all; production: set ALLOWED_ORIGINS
    credentials: true,
  }))
  .get('/api/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }))
  .use(authRoutes)
  .use(sessionRoutes)
  .use(terminalRoutes)
  .use(agentRoutes)
  .use(pushRoutes)
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
