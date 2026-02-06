import { createSignal, onMount, For, Show, createEffect } from 'solid-js';
import {
  getTasks, submitTask, cancelTask, enableAgent, disableAgent,
  updateApiKeys, getApiKeyStatus,
  type AgentTask,
} from '../api';

type Tab = 'tasks' | 'new' | 'settings';

interface Props {
  username: string;
  onBack: () => void;
  onOpenTask: (taskId: string) => void;
}

export default function AgentDashboard(props: Props) {
  const [tab, setTab] = createSignal<Tab>('tasks');
  const [tasks, setTasks] = createSignal<AgentTask[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [agentEnabled, setAgentEnabled] = createSignal(false);
  const [keyStatus, setKeyStatus] = createSignal<{ anthropic: boolean; openai: boolean }>({ anthropic: false, openai: false });

  // New task form
  const [agent, setAgent] = createSignal<'claude' | 'codex'>('claude');
  const [prompt, setPrompt] = createSignal('');
  const [workingDir, setWorkingDir] = createSignal('~/');
  const [submitting, setSubmitting] = createSignal(false);
  const [submitError, setSubmitError] = createSignal('');

  // Settings form
  const [anthropicKey, setAnthropicKey] = createSignal('');
  const [openaiKey, setOpenaiKey] = createSignal('');
  const [savingKeys, setSavingKeys] = createSignal(false);
  const [keysMessage, setKeysMessage] = createSignal('');
  const [togglingAgent, setTogglingAgent] = createSignal(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tasksData, keys] = await Promise.all([
        getTasks(props.username),
        getApiKeyStatus(props.username),
      ]);
      setTasks(tasksData.tasks);
      setKeyStatus(keys);
    } catch (err) {
      console.error('Failed to load agent data:', err);
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    loadData();
    // Poll tasks every 5 seconds
    const interval = setInterval(async () => {
      try {
        const data = await getTasks(props.username);
        setTasks(data.tasks);
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  });

  const handleSubmitTask = async (e: Event) => {
    e.preventDefault();
    if (!prompt().trim()) return;
    setSubmitError('');
    setSubmitting(true);
    try {
      await submitTask(props.username, {
        agent: agent(),
        prompt: prompt(),
        workingDir: workingDir() || '~/',
      });
      setPrompt('');
      setTab('tasks');
      await loadData();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit task');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (taskId: string) => {
    try {
      await cancelTask(props.username, taskId);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel');
    }
  };

  const handleToggleAgent = async () => {
    setTogglingAgent(true);
    try {
      if (agentEnabled()) {
        await disableAgent(props.username);
        setAgentEnabled(false);
      } else {
        await enableAgent(props.username);
        setAgentEnabled(true);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setTogglingAgent(false);
    }
  };

  const handleSaveKeys = async (e: Event) => {
    e.preventDefault();
    setSavingKeys(true);
    setKeysMessage('');
    try {
      const update: { anthropicApiKey?: string | null; openaiApiKey?: string | null } = {};
      if (anthropicKey()) update.anthropicApiKey = anthropicKey();
      if (openaiKey()) update.openaiApiKey = openaiKey();
      if (Object.keys(update).length === 0) {
        setKeysMessage('변경할 키를 입력해주세요.');
        return;
      }
      await updateApiKeys(props.username, update);
      setAnthropicKey('');
      setOpenaiKey('');
      setKeysMessage('저장 완료');
      const keys = await getApiKeyStatus(props.username);
      setKeyStatus(keys);
    } catch (err) {
      setKeysMessage(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSavingKeys(false);
    }
  };

  const handleRemoveKey = async (type: 'anthropic' | 'openai') => {
    if (!confirm(`${type === 'anthropic' ? 'Anthropic' : 'OpenAI'} API 키를 삭제하시겠습니까?`)) return;
    try {
      const update = type === 'anthropic' ? { anthropicApiKey: null } : { openaiApiKey: null };
      await updateApiKeys(props.username, update as any);
      const keys = await getApiKeyStatus(props.username);
      setKeyStatus(keys);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-blue-500/15 text-blue-700';
      case 'queued': return 'bg-yellow-500/15 text-yellow-700';
      case 'completed': return 'bg-green-500/15 text-green-700';
      case 'failed': return 'bg-red-500/15 text-red-700';
      case 'cancelled': return 'bg-gray-500/15 text-gray-700';
      default: return 'bg-gray-500/15 text-gray-700';
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'running': return '⏳';
      case 'queued': return '📋';
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'cancelled': return '🚫';
      default: return '•';
    }
  };

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '방금 전';
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    return `${Math.floor(hours / 24)}일 전`;
  };

  return (
    <div class="container mx-auto px-4 py-4 sm:p-6 max-w-4xl">
      {/* Header */}
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <button onClick={props.onBack} class="text-sm text-primary hover:underline">← 대시보드</button>
          <h1 class="text-xl font-bold">{props.username} — Agent</h1>
        </div>
      </div>

      {/* Tabs */}
      <div class="flex border-b mb-6">
        <For each={[
          { id: 'tasks' as Tab, label: '작업 목록' },
          { id: 'new' as Tab, label: '새 작업' },
          { id: 'settings' as Tab, label: '설정' },
        ]}>
          {(t) => (
            <button
              onClick={() => setTab(t.id)}
              class={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab() === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          )}
        </For>
      </div>

      {/* Tasks Tab */}
      <Show when={tab() === 'tasks'}>
        <Show when={loading()}>
          <div class="text-center py-12 text-muted-foreground">로딩 중...</div>
        </Show>
        <Show when={!loading() && tasks().length === 0}>
          <div class="text-center py-12">
            <p class="text-muted-foreground mb-4">아직 작업이 없습니다.</p>
            <button
              onClick={() => setTab('new')}
              class="inline-flex items-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4"
            >
              첫 작업 시작하기
            </button>
          </div>
        </Show>
        <Show when={!loading() && tasks().length > 0}>
          <div class="space-y-3">
            <For each={tasks()}>
              {(task) => (
                <div
                  class="rounded-lg border bg-card p-4 cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => props.onOpenTask(task.id)}
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <span class={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor(task.status)}`}>
                          {statusIcon(task.status)} {task.status}
                        </span>
                        <span class="text-xs text-muted-foreground uppercase font-medium">
                          {task.agent === 'claude' ? 'Claude' : 'Codex'}
                        </span>
                        <span class="text-xs text-muted-foreground">{timeAgo(task.createdAt)}</span>
                      </div>
                      <p class="text-sm truncate">{task.prompt}</p>
                    </div>
                    <Show when={task.status === 'running' || task.status === 'queued'}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCancel(task.id); }}
                        class="shrink-0 text-xs text-destructive hover:underline"
                      >
                        취소
                      </button>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>

      {/* New Task Tab */}
      <Show when={tab() === 'new'}>
        <div class="rounded-lg border bg-card p-4 sm:p-6">
          <h2 class="text-lg font-semibold mb-4">새 에이전트 작업</h2>
          <form onSubmit={handleSubmitTask} class="space-y-4">
            <div class="space-y-2">
              <label class="text-sm font-medium">에이전트 선택</label>
              <div class="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAgent('claude')}
                  disabled={!keyStatus().anthropic}
                  class={`flex-1 h-10 rounded-md text-sm font-medium border transition-colors ${
                    agent() === 'claude'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input bg-background text-muted-foreground hover:bg-accent'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  Claude Code {!keyStatus().anthropic && '(키 필요)'}
                </button>
                <button
                  type="button"
                  onClick={() => setAgent('codex')}
                  disabled={!keyStatus().openai}
                  class={`flex-1 h-10 rounded-md text-sm font-medium border transition-colors ${
                    agent() === 'codex'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input bg-background text-muted-foreground hover:bg-accent'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  Codex {!keyStatus().openai && '(키 필요)'}
                </button>
              </div>
            </div>

            <div class="space-y-2">
              <label for="prompt" class="text-sm font-medium">프롬프트</label>
              <textarea
                id="prompt"
                value={prompt()}
                onInput={(e) => setPrompt(e.currentTarget.value)}
                placeholder="에이전트에게 지시할 작업을 입력하세요..."
                rows={6}
                required
                class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y min-h-[120px]"
              />
            </div>

            <div class="space-y-2">
              <label for="workdir" class="text-sm font-medium">작업 디렉토리</label>
              <input
                id="workdir"
                type="text"
                value={workingDir()}
                onInput={(e) => setWorkingDir(e.currentTarget.value)}
                placeholder="~/"
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <Show when={submitError()}>
              <p class="text-sm text-destructive">{submitError()}</p>
            </Show>

            <button
              type="submit"
              disabled={submitting() || !prompt().trim() || (!keyStatus().anthropic && agent() === 'claude') || (!keyStatus().openai && agent() === 'codex')}
              class="w-full h-10 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting() ? '제출 중...' : '작업 시작'}
            </button>
          </form>
        </div>
      </Show>

      {/* Settings Tab */}
      <Show when={tab() === 'settings'}>
        <div class="space-y-6">
          {/* Agent Toggle */}
          <div class="rounded-lg border bg-card p-4 sm:p-6">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-base font-semibold">에이전트 활성화</h3>
                <p class="text-sm text-muted-foreground">이 세션에서 AI 에이전트 기능을 사용합니다.</p>
              </div>
              <button
                onClick={handleToggleAgent}
                disabled={togglingAgent()}
                class={`relative w-12 h-6 rounded-full transition-colors ${
                  agentEnabled() ? 'bg-primary' : 'bg-input'
                } disabled:opacity-50`}
              >
                <span class={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  agentEnabled() ? 'translate-x-6' : ''
                }`} />
              </button>
            </div>
          </div>

          {/* API Keys */}
          <div class="rounded-lg border bg-card p-4 sm:p-6">
            <h3 class="text-base font-semibold mb-4">API 키 관리</h3>
            <p class="text-sm text-muted-foreground mb-4">
              본인의 Claude/OpenAI 구독 API 키를 등록하세요. 키는 암호화되어 저장됩니다.
            </p>

            <div class="space-y-4">
              {/* Anthropic */}
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-medium">Anthropic API Key</label>
                  <Show when={keyStatus().anthropic}>
                    <div class="flex items-center gap-2">
                      <span class="text-xs text-green-600 font-medium">✓ 등록됨</span>
                      <button onClick={() => handleRemoveKey('anthropic')} class="text-xs text-destructive hover:underline">삭제</button>
                    </div>
                  </Show>
                  <Show when={!keyStatus().anthropic}>
                    <span class="text-xs text-muted-foreground">미등록</span>
                  </Show>
                </div>
                <input
                  type="password"
                  value={anthropicKey()}
                  onInput={(e) => setAnthropicKey(e.currentTarget.value)}
                  placeholder={keyStatus().anthropic ? '새 키로 변경...' : 'sk-ant-...'}
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              {/* OpenAI */}
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-medium">OpenAI API Key</label>
                  <Show when={keyStatus().openai}>
                    <div class="flex items-center gap-2">
                      <span class="text-xs text-green-600 font-medium">✓ 등록됨</span>
                      <button onClick={() => handleRemoveKey('openai')} class="text-xs text-destructive hover:underline">삭제</button>
                    </div>
                  </Show>
                  <Show when={!keyStatus().openai}>
                    <span class="text-xs text-muted-foreground">미등록</span>
                  </Show>
                </div>
                <input
                  type="password"
                  value={openaiKey()}
                  onInput={(e) => setOpenaiKey(e.currentTarget.value)}
                  placeholder={keyStatus().openai ? '새 키로 변경...' : 'sk-...'}
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <Show when={keysMessage()}>
                <p class={`text-sm ${keysMessage() === '저장 완료' ? 'text-green-600' : 'text-destructive'}`}>{keysMessage()}</p>
              </Show>

              <button
                onClick={handleSaveKeys}
                disabled={savingKeys() || (!anthropicKey() && !openaiKey())}
                class="w-full h-10 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {savingKeys() ? '저장 중...' : '키 저장'}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
