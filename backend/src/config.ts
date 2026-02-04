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

  databaseUrl: required('DATABASE_URL'),

  adminPassword: required('ADMIN_PASSWORD'),
  jwtSecret: required('JWT_SECRET'),

  cfApiToken: optional('CF_API_TOKEN', ''),
  cfZoneId: optional('CF_ZONE_ID', ''),
  cfDomain: optional('CF_DOMAIN', 'sandbox.domain.com'),

  sandboxImage: optional('SANDBOX_IMAGE', 'localhost/sandboxie:latest'),
  sshPortStart: parseInt(optional('SSH_PORT_START', '2200'), 10),
  sshPortEnd: parseInt(optional('SSH_PORT_END', '2299'), 10),
} as const;
