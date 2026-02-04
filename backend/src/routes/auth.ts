import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { config } from '../config';
import { verifyPassword, hashPassword } from '../utils/password';

let adminPasswordHash: string | null = null;

async function getAdminHash(): Promise<string> {
  if (!adminPasswordHash) {
    adminPasswordHash = await hashPassword(config.adminPassword);
  }
  return adminPasswordHash;
}

// Rate limiting state
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Cleanup expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (entry.lockedUntil > 0 && entry.lockedUntil < now) {
      loginAttempts.delete(ip);
    }
  }
}, CLEANUP_INTERVAL_MS);

function getClientIp(request: Request, server: any): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    server?.requestIP?.(request)?.address ??
    'unknown'
  );
}

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  .use(
    jwt({
      name: 'jwt',
      secret: config.jwtSecret,
    })
  )
  .post('/login', async ({ body, jwt, set, request, server }) => {
    const { password } = body as { password: string };
    const ip = getClientIp(request, server);

    // Check rate limit
    const attempt = loginAttempts.get(ip);
    if (attempt && attempt.lockedUntil > Date.now()) {
      set.status = 429;
      const retryAfter = Math.ceil((attempt.lockedUntil - Date.now()) / 1000);
      set.headers['retry-after'] = String(retryAfter);
      return { error: 'Too many login attempts. Try again later.' };
    }

    const hash = await getAdminHash();
    const valid = await verifyPassword(password, hash);

    if (!valid) {
      // Track failed attempt
      const current = loginAttempts.get(ip) ?? { count: 0, lockedUntil: 0 };
      current.count += 1;
      if (current.count >= MAX_ATTEMPTS) {
        current.lockedUntil = Date.now() + LOCK_DURATION_MS;
        current.count = 0;
      }
      loginAttempts.set(ip, current);

      set.status = 401;
      return { error: 'Invalid password' };
    }

    // Reset on successful login
    loginAttempts.delete(ip);

    const token = await jwt.sign({
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours
    });
    return { token };
  });
