import { db, sql } from '../db';
import { sessions } from '../db/schema';
import { config } from '../config';

const PORT_LOCK_ID = 100001; // Advisory lock ID for port allocation

export async function allocatePort(): Promise<{ sshPort: number; httpPort: number }> {
  // Acquire advisory lock to prevent race conditions
  await sql`SELECT pg_advisory_lock(${PORT_LOCK_ID})`;

  try {
    const usedPorts = await sql`SELECT ssh_port, http_port FROM sessions`;
    const usedSshSet = new Set(usedPorts.map((r: any) => r.ssh_port as number));
    const usedHttpSet = new Set(usedPorts.map((r: any) => r.http_port as number));

    const available: { sshPort: number; httpPort: number }[] = [];
    for (let port = config.sshPortStart; port <= config.sshPortEnd; port++) {
      const httpPort = port + 1000;
      if (!usedSshSet.has(port) && !usedHttpSet.has(httpPort)) {
        available.push({ sshPort: port, httpPort });
      }
    }

    if (available.length === 0) {
      throw new Error('No available ports');
    }

    return available[Math.floor(Math.random() * available.length)];
  } finally {
    // Always release the advisory lock
    await sql`SELECT pg_advisory_unlock(${PORT_LOCK_ID})`;
  }
}
