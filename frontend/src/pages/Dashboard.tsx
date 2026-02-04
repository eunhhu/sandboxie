import { createSignal, onMount, For, Show } from 'solid-js';
import { getSessions, createSession, deleteSession, restartSession, type Session } from '../api';

interface Props {
  onLogout: () => void;
  onOpenTerminal: (username: string) => void;
}

export default function Dashboard(props: Props) {
  const [sessions, setSessions] = createSignal<Session[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [showForm, setShowForm] = createSignal(false);

  const [newUsername, setNewUsername] = createSignal('');
  const [newPassword, setNewPassword] = createSignal('');
  const [newMemory, setNewMemory] = createSignal(256);
  const [newCpu, setNewCpu] = createSignal(0.5);
  const [newTtl, setNewTtl] = createSignal(0);
  const [createError, setCreateError] = createSignal('');
  const [creating, setCreating] = createSignal(false);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const data = await getSessions();
      setSessions(data.sessions);
    } catch {
      localStorage.removeItem('token');
      props.onLogout();
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    if (!localStorage.getItem('token')) {
      props.onLogout();
      return;
    }
    loadSessions();
  });

  const handleCreate = async (e: Event) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);

    try {
      await createSession({
        username: newUsername(),
        password: newPassword(),
        memoryLimit: newMemory(),
        cpuLimit: newCpu(),
        ttl: newTtl() > 0 ? newTtl() * 3600 : undefined,
      });
      setShowForm(false);
      setNewUsername('');
      setNewPassword('');
      setNewMemory(256);
      setNewCpu(0.5);
      setNewTtl(0);
      await loadSessions();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (username: string) => {
    if (!confirm(`${username} 세션을 삭제하시겠습니까?`)) return;
    try {
      await deleteSession(username);
      await loadSessions();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete session');
    }
  };

  const handleRestart = async (username: string) => {
    try {
      await restartSession(username);
      await loadSessions();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to restart session');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    props.onLogout();
  };

  const [showGuide, setShowGuide] = createSignal(false);

  const getDomain = () => {
    const s = sessions();
    if (s.length === 0) return null;
    const parts = s[0].subdomain.split('-');
    parts.shift();
    return parts.join('-');
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-500/15 text-green-700';
      case 'stopped': return 'bg-red-500/15 text-red-700';
      case 'paused': return 'bg-yellow-500/15 text-yellow-700';
      default: return 'bg-gray-500/15 text-gray-700';
    }
  };

  return (
    <div class="container mx-auto px-4 py-4 sm:p-6 max-w-6xl">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 sm:mb-8">
        <h1 class="text-xl sm:text-2xl font-bold">Sandbox Manager</h1>
        <div class="flex gap-2">
          <button
            onClick={() => setShowGuide(!showGuide())}
            class="inline-flex items-center justify-center rounded-md text-xs sm:text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 sm:h-10 px-3 sm:px-4 py-2"
          >
            접속 가이드
          </button>
          <button
            onClick={() => setShowForm(!showForm())}
            class="inline-flex items-center justify-center rounded-md text-xs sm:text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-9 sm:h-10 px-3 sm:px-4 py-2"
          >
            + 세션 생성
          </button>
          <button
            onClick={handleLogout}
            class="inline-flex items-center justify-center rounded-md text-xs sm:text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 sm:h-10 px-3 sm:px-4 py-2"
          >
            로그아웃
          </button>
        </div>
      </div>

      <Show when={showGuide()}>
        <div class="rounded-lg border bg-card p-4 sm:p-6 mb-6">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-base sm:text-lg font-semibold">SSH 접속 설정</h2>
            <button onClick={() => setShowGuide(false)} class="text-muted-foreground hover:text-foreground text-sm">닫기</button>
          </div>
          <p class="text-sm text-muted-foreground mb-3">
            아래 내용을 <code class="bg-muted px-1.5 py-0.5 rounded">~/.ssh/config</code> 파일에 추가하면
            {getDomain()
              ? <><code class="bg-muted px-1.5 py-0.5 rounded">ssh user@user-{getDomain()}</code>으로 간단히 접속할 수 있습니다.</>
              : <>SSH 접속 시 ProxyCommand가 자동으로 적용됩니다.</>
            }
          </p>
          <pre class="bg-muted p-4 rounded-md text-sm overflow-x-auto"><code>{getDomain()
            ? `Host *-${getDomain()}\n    ProxyCommand cloudflared access ssh --hostname %h\n`
            : `Host *-your.domain.com\n    ProxyCommand cloudflared access ssh --hostname %h\n`
          }</code></pre>
          <p class="text-xs text-muted-foreground mt-3">
            cloudflared 설치: <code class="bg-muted px-1 py-0.5 rounded">brew install cloudflared</code> (macOS)
            | <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" target="_blank" class="underline">다운로드</a> (Linux/Windows)
          </p>
        </div>
      </Show>

      <Show when={showForm()}>
        <div class="rounded-lg border bg-card p-4 sm:p-6 mb-6">
          <h2 class="text-base sm:text-lg font-semibold mb-4">새 세션 생성</h2>
          <form onSubmit={handleCreate} class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <label for="username" class="text-sm font-medium">사용자명</label>
              <input
                id="username"
                type="text"
                value={newUsername()}
                onInput={(e) => setNewUsername(e.currentTarget.value)}
                placeholder="영문/숫자만"
                required
                pattern="[a-zA-Z0-9]+"
                minLength={2}
                maxLength={30}
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div class="space-y-2">
              <label for="new-password" class="text-sm font-medium">비밀번호</label>
              <input
                id="new-password"
                type="password"
                value={newPassword()}
                onInput={(e) => setNewPassword(e.currentTarget.value)}
                placeholder="SSH 접속 비밀번호"
                required
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div class="space-y-2">
              <label for="memory" class="text-sm font-medium">메모리 제한 (MB)</label>
              <input
                id="memory"
                type="number"
                value={newMemory()}
                onInput={(e) => setNewMemory(Number(e.currentTarget.value))}
                min={64}
                max={512}
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div class="space-y-2">
              <label for="cpu" class="text-sm font-medium">CPU 제한 (코어)</label>
              <input
                id="cpu"
                type="number"
                value={newCpu()}
                onInput={(e) => setNewCpu(Number(e.currentTarget.value))}
                min={0.1}
                max={2}
                step={0.1}
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div class="space-y-2">
              <label for="ttl" class="text-sm font-medium">TTL (시간, 0=무제한)</label>
              <input
                id="ttl"
                type="number"
                value={newTtl()}
                onInput={(e) => setNewTtl(Number(e.currentTarget.value))}
                min={0}
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div class="flex items-end">
              <button
                type="submit"
                disabled={creating()}
                class="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-6 disabled:opacity-50"
              >
                {creating() ? '생성 중...' : '생성'}
              </button>
            </div>
          </form>
          {createError() && <p class="text-sm text-destructive mt-2">{createError()}</p>}
        </div>
      </Show>

      <Show when={loading()}>
        <div class="text-center py-12 text-muted-foreground">로딩 중...</div>
      </Show>

      <Show when={!loading() && sessions().length === 0}>
        <div class="text-center py-12">
          <p class="text-muted-foreground">세션이 없습니다. 새 세션을 생성해주세요.</p>
        </div>
      </Show>

      <Show when={!loading() && sessions().length > 0}>
        {/* Mobile: card layout */}
        <div class="space-y-3 md:hidden">
          <For each={sessions()}>
            {(session) => (
              <div class="rounded-lg border bg-card p-4">
                <div class="flex items-center justify-between mb-3">
                  <span class="font-medium">{session.username}</span>
                  <span class={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(session.status)}`}>
                    {session.status}
                  </span>
                </div>
                <div class="space-y-2 text-sm">
                  <div>
                    <span class="text-muted-foreground">SSH: </span>
                    <code class="text-xs bg-muted px-1.5 py-0.5 rounded break-all">
                      ssh {session.username}@{session.subdomain}
                    </code>
                  </div>
                  <div class="flex gap-4 text-muted-foreground">
                    <span>{session.memoryLimit}MB / {session.cpuLimit} CPU</span>
                    <span>{new Date(session.createdAt).toLocaleDateString('ko-KR')}</span>
                  </div>
                </div>
                <div class="flex gap-2 mt-3 pt-3 border-t">
                  <button
                    onClick={() => props.onOpenTerminal(session.username)}
                    disabled={session.status !== 'running'}
                    class="flex-1 inline-flex items-center justify-center rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 disabled:opacity-40"
                  >
                    터미널
                  </button>
                  <button
                    onClick={() => handleRestart(session.username)}
                    class="flex-1 inline-flex items-center justify-center rounded-md text-xs border border-input bg-background hover:bg-accent h-8 px-3"
                  >
                    재시작
                  </button>
                  <button
                    onClick={() => handleDelete(session.username)}
                    class="flex-1 inline-flex items-center justify-center rounded-md text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 h-8 px-3"
                  >
                    삭제
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>

        {/* Desktop: table layout */}
        <div class="hidden md:block rounded-lg border">
          <table class="w-full">
            <thead>
              <tr class="border-b bg-muted/50">
                <th class="h-12 px-4 text-left align-middle text-sm font-medium text-muted-foreground">사용자명</th>
                <th class="h-12 px-4 text-left align-middle text-sm font-medium text-muted-foreground">상태</th>
                <th class="h-12 px-4 text-left align-middle text-sm font-medium text-muted-foreground">SSH 접속</th>
                <th class="h-12 px-4 text-left align-middle text-sm font-medium text-muted-foreground">리소스</th>
                <th class="h-12 px-4 text-left align-middle text-sm font-medium text-muted-foreground">생성일</th>
                <th class="h-12 px-4 text-right align-middle text-sm font-medium text-muted-foreground">액션</th>
              </tr>
            </thead>
            <tbody>
              <For each={sessions()}>
                {(session) => (
                  <tr class="border-b">
                    <td class="p-4 align-middle font-medium">{session.username}</td>
                    <td class="p-4 align-middle">
                      <span class={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(session.status)}`}>
                        {session.status}
                      </span>
                    </td>
                    <td class="p-4 align-middle">
                      <code class="text-xs bg-muted px-2 py-1 rounded">
                        ssh {session.username}@{session.subdomain}
                      </code>
                    </td>
                    <td class="p-4 align-middle text-sm text-muted-foreground">
                      {session.memoryLimit}MB / {session.cpuLimit} CPU
                    </td>
                    <td class="p-4 align-middle text-sm text-muted-foreground">
                      {new Date(session.createdAt).toLocaleDateString('ko-KR')}
                    </td>
                    <td class="p-4 align-middle text-right">
                      <div class="flex justify-end gap-2">
                        <button
                          onClick={() => props.onOpenTerminal(session.username)}
                          disabled={session.status !== 'running'}
                          class="inline-flex items-center justify-center rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 disabled:opacity-40"
                        >
                          터미널
                        </button>
                        <button
                          onClick={() => handleRestart(session.username)}
                          class="inline-flex items-center justify-center rounded-md text-xs border border-input bg-background hover:bg-accent h-8 px-3"
                        >
                          재시작
                        </button>
                        <button
                          onClick={() => handleDelete(session.username)}
                          class="inline-flex items-center justify-center rounded-md text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 h-8 px-3"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
}
