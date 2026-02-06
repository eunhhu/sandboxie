import { Elysia, t } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { config } from '../config';
import { verifyPassword } from '../utils/password';

// Rate limiting state
interface LoginAttempt {
  count: number;
  lockedUntil: number;
  lastAttempt: number;
}

const loginAttempts = new Map<string, LoginAttempt>();

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const STALE_ENTRY_MS = 60 * 60 * 1000; // 1 hour — remove unlocked stale entries

// Cleanup expired and stale entries periodically
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    // Remove expired locks
    if (entry.lockedUntil > 0 && entry.lockedUntil < now) {
      loginAttempts.delete(ip);
      continue;
    }
    // Remove stale entries that never reached lock threshold
    if (entry.lockedUntil === 0 && now - entry.lastAttempt > STALE_ENTRY_MS) {
      loginAttempts.delete(ip);
    }
  }
}, CLEANUP_INTERVAL_MS);

// Allow clean shutdown
if (typeof process !== 'undefined') {
  process.on('beforeExit', () => clearInterval(cleanupTimer));
}

// Cloudflare IPv4 ranges (https://www.cloudflare.com/ips-v4/)
const CF_IPV4_RANGES = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
];

function ipToLong(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

function isInCidr(ip: string, cidr: string): boolean {
  const [rangeIp, bits] = cidr.split('/');
  const mask = ~((1 << (32 - parseInt(bits))) - 1) >>> 0;
  return (ipToLong(ip) & mask) === (ipToLong(rangeIp) & mask);
}

function isCloudflareIp(ip: string): boolean {
  // Skip IPv6 — trust cf headers only for known IPv4 ranges
  if (ip.includes(':')) return false;
  return CF_IPV4_RANGES.some((range) => isInCidr(ip, range));
}

function getClientIp(request: Request, server: any): string {
  const directIp = server?.requestIP?.(request)?.address ?? 'unknown';

  // Only trust proxy headers if request comes from Cloudflare
  if (isCloudflareIp(directIp)) {
    return (
      request.headers.get('cf-connecting-ip') ??
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      directIp
    );
  }

  return directIp;
}

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  .use(
    jwt({
      name: 'jwt',
      secret: config.jwtSecret,
    })
  )
  .post('/login', async ({ body, jwt, set, request, server }) => {
    const { password } = body;
    const ip = getClientIp(request, server);

    // Check rate limit
    const attempt = loginAttempts.get(ip);
    if (attempt && attempt.lockedUntil > Date.now()) {
      set.status = 429;
      const retryAfter = Math.ceil((attempt.lockedUntil - Date.now()) / 1000);
      set.headers['retry-after'] = String(retryAfter);
      return { error: 'Too many login attempts. Try again later.' };
    }

    const valid = await verifyPassword(password, config.adminPasswordHash);

    if (!valid) {
      // Track failed attempt
      const current = loginAttempts.get(ip) ?? { count: 0, lockedUntil: 0, lastAttempt: 0 };
      current.count += 1;
      current.lastAttempt = Date.now();
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

    const now = Math.floor(Date.now() / 1000);
    const token = await jwt.sign({
      sub: 'admin',
      role: 'admin',
      exp: now + 86400, // 24 hours
    });
    return { token };
  }, {
    body: t.Object({
      password: t.String({ minLength: 1 }),
    }),
  });
