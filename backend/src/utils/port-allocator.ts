import { db } from '../db';
import { sessions } from '../db/schema';
import { config } from '../config';

export async function allocatePort(): Promise<number> {
  const usedPorts = await db
    .select({ sshPort: sessions.sshPort })
    .from(sessions);

  const usedSet = new Set(usedPorts.map((r) => r.sshPort));

  const available: number[] = [];
  for (let port = config.sshPortStart; port <= config.sshPortEnd; port++) {
    if (!usedSet.has(port)) {
      available.push(port);
    }
  }

  if (available.length === 0) {
    throw new Error('No available SSH ports');
  }

  return available[Math.floor(Math.random() * available.length)];
}
