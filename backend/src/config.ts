function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
  port: parseInt(optional('PORT', '3000'), 10),
  host: optional('HOST', '0.0.0.0'),
  allowedOrigins: optional('ALLOWED_ORIGINS', ''),

  databaseUrl: required('DATABASE_URL'),

  adminPasswordHash: required('ADMIN_PASSWORD_HASH'),
  jwtSecret: required('JWT_SECRET'),

  cfApiToken: optional('CF_API_TOKEN', ''),
  cfZoneId: optional('CF_ZONE_ID', ''),
  cfDomain: optional('CF_DOMAIN', ''),
  cfTunnelId: optional('CF_TUNNEL_ID', ''),

  sandboxImage: optional('SANDBOX_IMAGE', 'localhost/sandboxie:latest'),
  sshPortStart: parseInt(optional('SSH_PORT_START', '2200'), 10),
  sshPortEnd: parseInt(optional('SSH_PORT_END', '2299'), 10),
  agentPortStart: parseInt(optional('AGENT_PORT_START', '4200'), 10),
  agentPortEnd: parseInt(optional('AGENT_PORT_END', '4299'), 10),

  encryptionKey: optional('ENCRYPTION_KEY', ''),
  vapidPublicKey: optional('VAPID_PUBLIC_KEY', ''),
  vapidPrivateKey: optional('VAPID_PRIVATE_KEY', ''),
  vapidSubject: optional('VAPID_SUBJECT', 'mailto:admin@example.com'),
} as const;
