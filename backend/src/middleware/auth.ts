import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { bearer } from '@elysiajs/bearer';
import { config } from '../config';

export const jwtPlugin = new Elysia({ name: 'jwt-plugin' })
  .use(bearer())
  .use(
    jwt({
      name: 'jwt',
      secret: config.jwtSecret,
    })
  );

export async function verifyAuth({ jwt, bearer, set }: any) {
  if (!bearer) {
    set.status = 401;
    return { error: 'Unauthorized' };
  }

  const payload = await jwt.verify(bearer);
  if (!payload) {
    set.status = 401;
    return { error: 'Invalid token' };
  }
}
