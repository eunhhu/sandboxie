const BASE_URL = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem('token');
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

export async function login(password: string): Promise<string> {
  const data = await request<{ token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
  localStorage.setItem('token', data.token);
  return data.token;
}

export async function getSessions() {
  return request<{ sessions: Session[] }>('/sessions');
}

export async function createSession(opts: {
  username: string;
  password: string;
  memoryLimit?: number;
  cpuLimit?: number;
  ttl?: number;
}) {
  return request<{ session: Session; sshCommand: string }>('/sessions', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export async function deleteSession(username: string) {
  return request<{ success: boolean }>(`/sessions/${username}`, {
    method: 'DELETE',
  });
}

export async function restartSession(username: string) {
  return request<{ success: boolean }>(`/sessions/${username}/restart`, {
    method: 'POST',
  });
}

export interface Session {
  id: string;
  username: string;
  subdomain: string;
  sshPort: number;
  memoryLimit: number;
  cpuLimit: number;
  status: string;
  createdAt: string;
  expiresAt: string | null;
}
