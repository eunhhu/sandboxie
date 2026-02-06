import { db, sql } from '../db';
import { sessions } from '../db/schema';
import { config } from '../config';

const PORT_LOCK_ID = 100001; // Advisory lock ID for port allocation

export async function allocatePort(): Promise<{ sshPort: number; httpPort: number; agentPort: number }> {
  // Acquire advisory lock to prevent race conditions
  await sql`SELECT pg_advisory_lock(${PORT_LOCK_ID})`;

  try {
    const usedPorts = await sql`SELECT ssh_port, http_port, agent_port FROM sessions`;
    const usedSshSet = new Set(usedPorts.map((r: any) => r.ssh_port as number));
    const usedHttpSet = new Set(usedPorts.map((r: any) => r.http_port as number));
    const usedAgentSet = new Set(usedPorts.map((r: any) => r.agent_port as number));

    const available: { sshPort: number; httpPort: number; agentPort: number }[] = [];
    for (let i = 0; i <= config.sshPortEnd - config.sshPortStart; i++) {
      const sshPort = config.sshPortStart + i;
      const httpPort = sshPort + 1000;
      const agentPort = config.agentPortStart + i;
      if (!usedSshSet.has(sshPort) && !usedHttpSet.has(httpPort) && !usedAgentSet.has(agentPort)) {
        available.push({ sshPort, httpPort, agentPort });
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
