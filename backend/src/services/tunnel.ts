import { config } from '../config';

const CONFIG_PATH = '/etc/cloudflared/config.yml';

interface IngressRule {
  hostname?: string;
  service: string;
  originRequest?: Record<string, unknown>;
}

interface TunnelConfig {
  tunnel: string;
  'credentials-file': string;
  ingress: IngressRule[];
}

function parseConfig(content: string): TunnelConfig {
  const lines = content.split('\n');
  const result: TunnelConfig = {
    tunnel: '',
    'credentials-file': '',
    ingress: [],
  };

  let currentRule: Partial<IngressRule> | null = null;
  let currentOriginRequest: Record<string, unknown> | null = null;
  let inIngress = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('tunnel:')) {
      result.tunnel = trimmed.split(':').slice(1).join(':').trim();
    } else if (trimmed.startsWith('credentials-file:')) {
      result['credentials-file'] = trimmed.split(':').slice(1).join(':').trim();
    } else if (trimmed === 'ingress:') {
      inIngress = true;
    } else if (inIngress && trimmed.startsWith('- hostname:')) {
      if (currentRule) {
        if (currentOriginRequest) currentRule.originRequest = currentOriginRequest;
        result.ingress.push(currentRule as IngressRule);
      }
      currentRule = { hostname: trimmed.replace('- hostname:', '').trim().replace(/"/g, '') };
      currentOriginRequest = null;
    } else if (inIngress && trimmed.startsWith('- service:')) {
      if (currentRule) {
        if (currentOriginRequest) currentRule.originRequest = currentOriginRequest;
        result.ingress.push(currentRule as IngressRule);
      }
      currentRule = { service: trimmed.replace('- service:', '').trim() };
      currentOriginRequest = null;
    } else if (inIngress && trimmed.startsWith('service:')) {
      if (currentRule) currentRule.service = trimmed.replace('service:', '').trim();
    } else if (inIngress && trimmed === 'originRequest:') {
      currentOriginRequest = {};
    } else if (inIngress && currentOriginRequest !== null && trimmed.includes(':')) {
      const [key, ...valParts] = trimmed.split(':');
      const val = valParts.join(':').trim();
      if (val === 'true') currentOriginRequest[key.trim()] = true;
      else if (val === 'false') currentOriginRequest[key.trim()] = false;
      else currentOriginRequest[key.trim()] = val;
    }
  }

  if (currentRule) {
    if (currentOriginRequest) currentRule.originRequest = currentOriginRequest;
    result.ingress.push(currentRule as IngressRule);
  }

  return result;
}

function serializeConfig(cfg: TunnelConfig): string {
  let out = '';
  out += `tunnel: ${cfg.tunnel}\n`;
  out += `credentials-file: ${cfg['credentials-file']}\n`;
  out += '\ningress:\n';

  for (const rule of cfg.ingress) {
    if (rule.hostname) {
      const needsQuote = rule.hostname.includes('*');
      const hn = needsQuote ? `"${rule.hostname}"` : rule.hostname;
      out += `  - hostname: ${hn}\n`;
      out += `    service: ${rule.service}\n`;
    } else {
      out += `  - service: ${rule.service}\n`;
    }
    if (rule.originRequest) {
      out += `    originRequest:\n`;
      for (const [k, v] of Object.entries(rule.originRequest)) {
        out += `      ${k}: ${v}\n`;
      }
    }
  }

  return out;
}

async function readConfig(): Promise<TunnelConfig> {
  const proc = Bun.spawn(['sudo', 'cat', CONFIG_PATH], { stdout: 'pipe', stderr: 'pipe' });
  await proc.exited;
  const content = await new Response(proc.stdout).text();
  return parseConfig(content);
}

async function writeConfig(cfg: TunnelConfig): Promise<void> {
  const content = serializeConfig(cfg);
  const proc = Bun.spawn(['sudo', 'tee', CONFIG_PATH], {
    stdin: new Blob([content]),
    stdout: 'ignore',
    stderr: 'pipe',
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Failed to write tunnel config: ${stderr}`);
  }
}

async function restartTunnel(): Promise<void> {
  const proc = Bun.spawn(['sudo', 'systemctl', 'restart', 'cloudflared'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Failed to restart cloudflared: ${stderr}`);
  }
}


export async function addSshIngress(username: string, sshPort: number): Promise<void> {
  if (!config.cfDomain) {
    console.warn('CF_DOMAIN not configured, skipping tunnel ingress');
    return;
  }

  const hostname = `${username}-${config.cfDomain}`;

  const cfg = await readConfig();

  // 이미 존재하면 스킵
  if (cfg.ingress.some(r => r.hostname === hostname)) {
    console.log(`Ingress already exists for ${hostname}`);
    return;
  }

  // catch-all 규칙 앞에 삽입 (와일드카드, catch-all 앞)
  const catchAllIdx = cfg.ingress.findIndex(r => !r.hostname);
  const wildcardIdx = cfg.ingress.findIndex(r => r.hostname?.startsWith('*'));

  // 와일드카드 앞에 삽입 (더 구체적인 규칙이 먼저)
  let insertIdx = catchAllIdx >= 0 ? catchAllIdx : cfg.ingress.length;
  if (wildcardIdx >= 0 && wildcardIdx < insertIdx) {
    insertIdx = wildcardIdx;
  }

  const newRule: IngressRule = {
    hostname,
    service: `ssh://127.0.0.1:${sshPort}`,
  };

  cfg.ingress.splice(insertIdx, 0, newRule);

  await writeConfig(cfg);
  await restartTunnel();

  console.log(`Tunnel ingress added: ${hostname} → ssh://localhost:${sshPort}`);
}

export async function removeSshIngress(username: string): Promise<void> {
  if (!config.cfDomain) {
    console.warn('CF_DOMAIN not configured, skipping tunnel ingress removal');
    return;
  }

  const hostname = `${username}-${config.cfDomain}`;

  const cfg = await readConfig();
  const before = cfg.ingress.length;
  cfg.ingress = cfg.ingress.filter(r => r.hostname !== hostname);

  if (cfg.ingress.length === before) {
    console.log(`No ingress found for ${hostname}`);
    return;
  }

  await writeConfig(cfg);
  await restartTunnel();

  console.log(`Tunnel ingress removed: ${hostname}`);
}
