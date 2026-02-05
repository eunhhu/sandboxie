import { config } from '../config';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

async function cfFetch(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${CF_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${config.cfApiToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
  }

  return data;
}

export async function createDnsRecord(username: string, prefix: 'ssh' | 'web' = 'ssh'): Promise<string> {
  if (!config.cfApiToken || !config.cfZoneId || !config.cfDomain || !config.cfTunnelId) {
    console.warn('Cloudflare not configured, skipping DNS record creation');
    return 'skipped';
  }

  // Cloudflare 무료 플랜: 1단계 서브도메인만 지원
  // username-ssh-sandbox.qucord.com (O)
  // username.ssh.sandbox.qucord.com (X)
  const domain = config.cfDomain.split('.').slice(-2).join('.'); // qucord.com
  const recordName = `${username}-${prefix}-${config.cfDomain.split('.')[0]}.${domain}`;

  console.log(`Creating DNS record: ${recordName} → ${config.cfTunnelId}.cfargotunnel.com`);

  const data = await cfFetch(`/zones/${config.cfZoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'CNAME',
      name: recordName,
      content: `${config.cfTunnelId}.cfargotunnel.com`,
      proxied: true,
    }),
  });

  console.log(`DNS record created: ${recordName} (ID: ${data.result.id})`);
  return data.result.id;
}


export async function deleteDnsRecord(recordId: string): Promise<void> {
  if (!config.cfApiToken || !config.cfZoneId) {
    console.warn('Cloudflare not configured, skipping DNS record deletion');
    return;
  }

  await cfFetch(`/zones/${config.cfZoneId}/dns_records/${recordId}`, {
    method: 'DELETE',
  });
}

export async function findDnsRecord(username: string, prefix: 'ssh' | 'web' = 'ssh'): Promise<string | null> {
  if (!config.cfApiToken || !config.cfZoneId) {
    return null;
  }

  const domain = config.cfDomain.split('.').slice(-2).join('.');
  const recordName = `${username}-${prefix}-${config.cfDomain.split('.')[0]}.${domain}`;
  const data = await cfFetch(
    `/zones/${config.cfZoneId}/dns_records?name=${recordName}`
  );

  return data.result?.[0]?.id ?? null;
}
