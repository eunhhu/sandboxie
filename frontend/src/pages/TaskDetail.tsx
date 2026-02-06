import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { getTaskDetail, cancelTask, createTaskStream, type AgentTask } from '../api';

interface Props {
  username: string;
  taskId: string;
  onBack: () => void;
}

export default function TaskDetail(props: Props) {
  const [task, setTask] = createSignal<AgentTask | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [liveOutput, setLiveOutput] = createSignal('');
  const [error, setError] = createSignal('');

  let outputRef: HTMLPreElement | undefined;
  let eventSource: EventSource | null = null;

  const scrollToBottom = () => {
    if (outputRef) {
      outputRef.scrollTop = outputRef.scrollHeight;
    }
  };

  const loadTask = async () => {
    try {
      const data = await getTaskDetail(props.username, props.taskId);
      setTask(data.task);

      // If task is running, connect to SSE stream
      if (data.task.status === 'running') {
        connectStream();
      } else if (data.task.output) {
        setLiveOutput(data.task.output);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load task');
    } finally {
      setLoading(false);
    }
  };

  const connectStream = () => {
    if (eventSource) eventSource.close();
    eventSource = createTaskStream(props.username, props.taskId);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'output') {
          setLiveOutput((prev) => prev + data.data);
          requestAnimationFrame(scrollToBottom);
        } else if (data.type === 'done') {
          eventSource?.close();
          eventSource = null;
          // Reload task to get final state
          loadTask();
        }
      } catch {}
    };

    eventSource.onerror = () => {
      eventSource?.close();
      eventSource = null;
      // Fallback: poll for updates
      setTimeout(loadTask, 2000);
    };
  };

  onMount(() => {
    loadTask();
    // Poll for updates if not streaming
    const interval = setInterval(async () => {
      if (!eventSource) {
        try {
          const data = await getTaskDetail(props.username, props.taskId);
          setTask(data.task);
          if (data.task.status === 'running' && !eventSource) {
            connectStream();
          } else if (data.task.output && !liveOutput()) {
            setLiveOutput(data.task.output);
          }
        } catch {}
      }
    }, 5000);
    onCleanup(() => {
      clearInterval(interval);
      eventSource?.close();
    });
  });

  const handleCancel = async () => {
    try {
      await cancelTask(props.username, props.taskId);
      await loadTask();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel');
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

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start) return '-';
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    const diff = Math.floor((e - s) / 1000);
    if (diff < 60) return `${diff}초`;
    if (diff < 3600) return `${Math.floor(diff / 60)}분 ${diff % 60}초`;
    return `${Math.floor(diff / 3600)}시간 ${Math.floor((diff % 3600) / 60)}분`;
  };

  return (
    <div class="flex flex-col" style={{ height: '100dvh' }}>
      {/* Header */}
      <div class="shrink-0 border-b bg-background px-4 py-3">
        <div class="flex items-center justify-between max-w-4xl mx-auto">
          <div class="flex items-center gap-3">
            <button onClick={props.onBack} class="text-sm text-primary hover:underline">← 작업 목록</button>
            <Show when={task()}>
              <span class={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor(task()!.status)}`}>
                {task()!.status}
              </span>
              <span class="text-xs text-muted-foreground uppercase font-medium">
                {task()!.agent === 'claude' ? 'Claude Code' : 'Codex'}
              </span>
            </Show>
          </div>
          <Show when={task() && (task()!.status === 'running' || task()!.status === 'queued')}>
            <button
              onClick={handleCancel}
              class="text-xs px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              작업 취소
            </button>
          </Show>
        </div>
      </div>

      <Show when={loading()}>
        <div class="flex-1 flex items-center justify-center text-muted-foreground">로딩 중...</div>
      </Show>

      <Show when={error()}>
        <div class="flex-1 flex items-center justify-center text-destructive">{error()}</div>
      </Show>

      <Show when={!loading() && task()}>
        <div class="flex-1 overflow-y-auto">
          <div class="max-w-4xl mx-auto p-4 space-y-4">
            {/* Prompt */}
            <div class="rounded-lg border bg-card p-4">
              <h3 class="text-sm font-medium text-muted-foreground mb-2">프롬프트</h3>
              <p class="text-sm whitespace-pre-wrap">{task()!.prompt}</p>
              <div class="flex gap-4 mt-3 text-xs text-muted-foreground">
                <span>디렉토리: <code class="bg-muted px-1 py-0.5 rounded">{task()!.workingDir}</code></span>
                <span>실행 시간: {formatDuration(task()!.startedAt, task()!.completedAt)}</span>
                <Show when={task()!.exitCode !== null}>
                  <span>Exit code: <code class="bg-muted px-1 py-0.5 rounded">{task()!.exitCode}</code></span>
                </Show>
              </div>
            </div>

            {/* Error */}
            <Show when={task()!.error}>
              <div class="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
                <h3 class="text-sm font-medium text-destructive mb-1">에러</h3>
                <p class="text-sm text-destructive">{task()!.error}</p>
              </div>
            </Show>

            {/* Output */}
            <div class="rounded-lg border bg-card">
              <div class="flex items-center justify-between px-4 py-2 border-b">
                <h3 class="text-sm font-medium text-muted-foreground">출력</h3>
                <Show when={task()!.status === 'running'}>
                  <span class="text-xs text-blue-600 animate-pulse">● 실시간 스트리밍</span>
                </Show>
              </div>
              <pre
                ref={outputRef}
                class="p-4 text-xs leading-relaxed overflow-auto font-mono whitespace-pre-wrap break-all"
                style={{ 'max-height': '60vh', 'min-height': '200px', background: '#1a1b26', color: '#a9b1d6' }}
              >
                {liveOutput() || task()!.output || '(출력 없음)'}
              </pre>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
