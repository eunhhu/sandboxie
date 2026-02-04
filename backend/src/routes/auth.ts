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

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  .use(
    jwt({
      name: 'jwt',
      secret: config.jwtSecret,
    })
  )
  .post('/login', async ({ body, jwt, set }) => {
    const { password } = body as { password: string };

    if (password !== config.adminPassword) {
      set.status = 401;
      return { error: 'Invalid password' };
    }

    const token = await jwt.sign({ role: 'admin' });
    return { token };
  });
