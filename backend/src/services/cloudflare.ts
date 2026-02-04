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

export async function createDnsRecord(username: string): Promise<string> {
  if (!config.cfApiToken || !config.cfZoneId) {
    console.warn('Cloudflare not configured, skipping DNS record creation');
    return 'skipped';
  }

  const serverIp = await getPublicIp();
  const recordName = `${username}.${config.cfDomain}`;

  const data = await cfFetch(`/zones/${config.cfZoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'A',
      name: recordName,
      content: serverIp,
      proxied: false,
      ttl: 300,
    }),
  });

  return data.result.id;
}

let _publicIp: string | null = null;

async function getPublicIp(): Promise<string> {
  if (_publicIp) return _publicIp;
  try {
    const res = await fetch('https://api.ipify.org');
    _publicIp = (await res.text()).trim();
  } catch {
    const res = await fetch('https://ifconfig.me/ip', { headers: { 'User-Agent': 'curl/8.0' } });
    _publicIp = (await res.text()).trim();
  }
  return _publicIp!;
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

export async function findDnsRecord(subdomain: string): Promise<string | null> {
  if (!config.cfApiToken || !config.cfZoneId) {
    return null;
  }

  const data = await cfFetch(
    `/zones/${config.cfZoneId}/dns_records?name=${subdomain}.${config.cfDomain}`
  );

  return data.result?.[0]?.id ?? null;
}
