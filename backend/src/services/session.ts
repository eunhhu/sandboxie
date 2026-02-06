import { eq } from 'drizzle-orm';
import { db } from '../db';
import { sessions, type Session } from '../db/schema';
import { config } from '../config';
import { hashPassword } from '../utils/password';
import { allocatePort } from '../utils/port-allocator';
import * as podman from './podman';
import * as cloudflare from './cloudflare';
import * as tunnel from './tunnel';

export async function listSessions() {
  return db.select({
    id: sessions.id,
    username: sessions.username,
    subdomain: sessions.subdomain,
    sshPort: sessions.sshPort,
    httpPort: sessions.httpPort,
    containerName: sessions.containerName,
    memoryLimit: sessions.memoryLimit,
    cpuLimit: sessions.cpuLimit,
    status: sessions.status,
    createdAt: sessions.createdAt,
    expiresAt: sessions.expiresAt,
    lastAccessedAt: sessions.lastAccessedAt,
  }).from(sessions);
}

export async function getSession(username: string): Promise<Session | undefined> {
  const result = await db
    .select()
    .from(sessions)
    .where(eq(sessions.username, username));
  return result[0];
}

export async function createSession(opts: {
  username: string;
  password: string;
  memoryLimit?: number;
  cpuLimit?: number;
  ttl?: number;
}): Promise<Session> {
  const { sshPort, httpPort } = await allocatePort();
  const containerName = `sandbox-${opts.username}`;
  const subdomain = config.cfDomain
    ? `${opts.username}-${config.cfDomain}`
    : opts.username;
  const hashedPassword = await hashPassword(opts.password);

  // Track created resources for rollback
  let containerCreated = false;
  let dnsCreated = false;
  let tunnelCreated = false;

  try {
    await podman.createContainer({
      name: containerName,
      username: opts.username,
      password: opts.password,
      sshPort,
      httpPort,
      memoryLimit: opts.memoryLimit ?? 256,
      cpuLimit: opts.cpuLimit ?? 0.5,
    });
    containerCreated = true;

    try {
      await cloudflare.createDnsRecord(opts.username, 'ssh');
      await cloudflare.createDnsRecord(opts.username, 'web');
      dnsCreated = true;
    } catch (err) {
      console.warn(`DNS record creation failed for ${opts.username}:`, err instanceof Error ? err.message : err);
    }

    try {
      await tunnel.addSshIngress(opts.username, sshPort);
      await tunnel.addHttpIngress(opts.username, httpPort);
      tunnelCreated = true;
    } catch (err) {
      console.warn(`Tunnel ingress creation failed for ${opts.username}:`, err instanceof Error ? err.message : err);
    }

    const expiresAt = opts.ttl
      ? new Date(Date.now() + opts.ttl * 1000)
      : null;

    const [session] = await db
      .insert(sessions)
      .values({
        username: opts.username,
        password: hashedPassword,
        subdomain,
        sshPort,
        httpPort,
        containerName,
        memoryLimit: opts.memoryLimit ?? 256,
        cpuLimit: opts.cpuLimit ?? 0.5,
        status: 'running',
        expiresAt,
      })
      .returning();

    return session;
  } catch (err) {
    // Rollback: clean up all created resources
    console.error(`[session] createSession failed, rolling back for ${opts.username}:`, err instanceof Error ? err.message : err);

    if (tunnelCreated) {
      try {
        await tunnel.removeSshIngress(opts.username);
        await tunnel.removeHttpIngress(opts.username);
      } catch (rollbackErr) {
        console.error(`[session] Rollback tunnel failed:`, rollbackErr instanceof Error ? rollbackErr.message : rollbackErr);
      }
    }

    if (dnsCreated) {
      try {
        const sshRecordId = await cloudflare.findDnsRecord(opts.username, 'ssh');
        if (sshRecordId) await cloudflare.deleteDnsRecord(sshRecordId);
        const webRecordId = await cloudflare.findDnsRecord(opts.username, 'web');
        if (webRecordId) await cloudflare.deleteDnsRecord(webRecordId);
      } catch (rollbackErr) {
        console.error(`[session] Rollback DNS failed:`, rollbackErr instanceof Error ? rollbackErr.message : rollbackErr);
      }
    }

    if (containerCreated) {
      try {
        await podman.removeContainer(containerName);
      } catch (rollbackErr) {
        console.error(`[session] Rollback container failed:`, rollbackErr instanceof Error ? rollbackErr.message : rollbackErr);
      }
    }

    throw err;
  }
}

export async function deleteSession(username: string): Promise<void> {
  const session = await getSession(username);
  if (!session) {
    throw new Error(`Session not found: ${username}`);
  }

  // Remove container first (critical)
  await podman.removeContainer(session.containerName);

  // Clean up tunnel and DNS (best-effort, but tracked)
  const errors: string[] = [];

  try {
    await tunnel.removeSshIngress(username);
    await tunnel.removeHttpIngress(username);
  } catch (err) {
    const msg = `Tunnel ingress removal failed for ${username}: ${err instanceof Error ? err.message : err}`;
    console.warn(msg);
    errors.push(msg);
  }

  try {
    const sshRecordId = await cloudflare.findDnsRecord(username, 'ssh');
    if (sshRecordId) {
      await cloudflare.deleteDnsRecord(sshRecordId);
    }
    const webRecordId = await cloudflare.findDnsRecord(username, 'web');
    if (webRecordId) {
      await cloudflare.deleteDnsRecord(webRecordId);
    }
  } catch (err) {
    const msg = `DNS record deletion failed for ${username}: ${err instanceof Error ? err.message : err}`;
    console.warn(msg);
    errors.push(msg);
  }

  // Always delete DB record since container is already removed
  await db.delete(sessions).where(eq(sessions.username, username));

  if (errors.length > 0) {
    console.warn(`[session] deleteSession completed with warnings for ${username}:`, errors);
  }
}

export async function restartSession(username: string): Promise<void> {
  const session = await getSession(username);
  if (!session) {
    throw new Error(`Session not found: ${username}`);
  }

  await podman.restartContainer(session.containerName);

  await db
    .update(sessions)
    .set({ status: 'running', lastAccessedAt: new Date() })
    .where(eq(sessions.username, username));
}

export async function getSessionStats(username: string) {
  const session = await getSession(username);
  if (!session) {
    throw new Error(`Session not found: ${username}`);
  }

  return podman.getContainerStats(session.containerName);
}
