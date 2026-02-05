import { config } from '../config';

let _cgroupMemory: boolean | null = null;

async function isCgroupMemoryAvailable(): Promise<boolean> {
  if (_cgroupMemory !== null) return _cgroupMemory;
  try {
    const file = Bun.file('/sys/fs/cgroup/cgroup.controllers');
    const content = await file.text();
    _cgroupMemory = content.includes('memory');
  } catch {
    _cgroupMemory = false;
  }
  return _cgroupMemory;
}

interface ContainerStats {
  memoryUsage: number;
  cpuUsage: number;
  uptime: number;
}

async function run(args: string[]): Promise<string> {
  const proc = Bun.spawn(['podman', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  if (exitCode !== 0) {
    throw new Error(`podman ${args[0]} failed: ${stderr.trim()}`);
  }

  return stdout.trim();
}

export async function createContainer(opts: {
  name: string;
  username: string;
  password: string;
  sshPort: number;
  httpPort: number;
  memoryLimit: number;
  cpuLimit: number;
}): Promise<string> {
  const args = [
    'run',
    '-d',
    '--name', opts.name,
    '--hostname', opts.username,
    '--restart', 'always',
    '-p', `${opts.sshPort}:22`,
    '-p', `${opts.httpPort}:8080`,
    '--cpus', `${opts.cpuLimit}`,
    '-e', `SANDBOX_USER=${opts.username}`,
    '-e', `SANDBOX_PASSWORD=${opts.password}`,
  ];

  if (await isCgroupMemoryAvailable()) {
    args.push('--memory', `${opts.memoryLimit}m`);
    args.push('--memory-swap', `${opts.memoryLimit}m`);
  }

  args.push(config.sandboxImage);
  const containerId = await run(args);

  return containerId;
}

export async function removeContainer(name: string): Promise<void> {
  await run(['rm', '-f', name]);
}

export async function restartContainer(name: string): Promise<void> {
  await run(['stop', name]);
  await new Promise((r) => setTimeout(r, 1000));
  await run(['start', name]);
}

export async function stopContainer(name: string): Promise<void> {
  await run(['stop', name]);
}

export async function startContainer(name: string): Promise<void> {
  await run(['start', name]);
}

export async function getContainerStats(name: string): Promise<ContainerStats> {
  const output = await run([
    'stats', name,
    '--no-stream',
    '--format', '{{.MemUsage}}|{{.CPUPerc}}|{{.UpTime}}',
  ]);

  const [memStr, cpuStr, uptimeStr] = output.split('|');

  const memMatch = memStr?.match(/([\d.]+)/);
  const cpuMatch = cpuStr?.match(/([\d.]+)/);

  return {
    memoryUsage: memMatch ? parseFloat(memMatch[1]) : 0,
    cpuUsage: cpuMatch ? parseFloat(cpuMatch[1]) : 0,
    uptime: parseUptimeToSeconds(uptimeStr ?? '0s'),
  };
}

function parseUptimeToSeconds(uptime: string): number {
  let total = 0;
  const hours = uptime.match(/(\d+)\s*h/);
  const minutes = uptime.match(/(\d+)\s*m/);
  const seconds = uptime.match(/(\d+)\s*s/);
  if (hours) total += parseInt(hours[1]) * 3600;
  if (minutes) total += parseInt(minutes[1]) * 60;
  if (seconds) total += parseInt(seconds[1]);
  return total;
}

export async function getContainerStatus(name: string): Promise<string> {
  try {
    const output = await run(['inspect', name, '--format', '{{.State.Status}}']);
    return output;
  } catch {
    return 'stopped';
  }
}
