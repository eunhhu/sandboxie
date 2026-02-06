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
  httpPort: number;
  agentPort: number;
  memoryLimit: number;
  cpuLimit: number;
  status: string;
  agentEnabled: boolean;
  createdAt: string;
  expiresAt: string | null;
}

export interface AgentTask {
  id: string;
  sessionId: string;
  agent: 'claude' | 'codex';
  prompt: string;
  workingDir: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  output: string | null;
  exitCode: number | null;
  tokenUsage: { input?: number; output?: number } | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

// --- Agent API ---

export async function enableAgent(username: string) {
  return request<{ success: boolean }>(`/sessions/${username}/agent/enable`, { method: 'POST' });
}

export async function disableAgent(username: string) {
  return request<{ success: boolean }>(`/sessions/${username}/agent/disable`, { method: 'POST' });
}

export async function updateApiKeys(username: string, keys: {
  anthropicApiKey?: string | null;
  openaiApiKey?: string | null;
}) {
  return request<{ success: boolean }>(`/sessions/${username}/agent/keys`, {
    method: 'PUT',
    body: JSON.stringify(keys),
  });
}

export async function getApiKeyStatus(username: string) {
  return request<{ anthropic: boolean; openai: boolean }>(`/sessions/${username}/agent/keys`);
}

export async function getTasks(username: string) {
  return request<{ tasks: AgentTask[] }>(`/sessions/${username}/agent/tasks`);
}

export async function submitTask(username: string, opts: {
  agent: 'claude' | 'codex';
  prompt: string;
  workingDir?: string;
}) {
  return request<{ task: AgentTask }>(`/sessions/${username}/agent/tasks`, {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export async function getTaskDetail(username: string, taskId: string) {
  return request<{ task: AgentTask }>(`/sessions/${username}/agent/tasks/${taskId}`);
}

export async function cancelTask(username: string, taskId: string) {
  return request<{ task: AgentTask }>(`/sessions/${username}/agent/tasks/${taskId}`, {
    method: 'DELETE',
  });
}

export function createTaskStream(username: string, taskId: string): EventSource {
  const token = localStorage.getItem('token');
  return new EventSource(
    `${BASE_URL}/sessions/${username}/agent/tasks/${taskId}/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`,
  );
}

// --- Push API ---

export async function getVapidKey() {
  return request<{ key: string }>('/push/vapid-key');
}

export async function subscribePush(subscription: {
  endpoint: string;
  p256dh: string;
  auth: string;
}) {
  return request<{ success: boolean }>('/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(subscription),
  });
}

export async function unsubscribePush(endpoint: string) {
  return request<{ success: boolean }>('/push/subscribe', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  });
}
