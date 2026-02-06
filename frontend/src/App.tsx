import { createSignal, Show, lazy, Suspense, onCleanup } from 'solid-js';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
const Terminal = lazy(() => import('./pages/Terminal'));
const AgentDashboard = lazy(() => import('./pages/AgentDashboard'));
const TaskDetail = lazy(() => import('./pages/TaskDetail'));

type Page =
  | { type: 'login' }
  | { type: 'dashboard' }
  | { type: 'terminal'; username: string }
  | { type: 'agent'; username: string }
  | { type: 'task'; username: string; taskId: string };

function getInitialPage(): Page {
  const path = window.location.pathname;
  const termMatch = path.match(/^\/t\/([a-zA-Z0-9]+)$/);
  if (termMatch) {
    return { type: 'terminal', username: termMatch[1] };
  }
  const taskMatch = path.match(/^\/a\/([a-zA-Z0-9]+)\/task\/([a-f0-9-]+)$/);
  if (taskMatch) {
    return { type: 'task', username: taskMatch[1], taskId: taskMatch[2] };
  }
  const agentMatch = path.match(/^\/a\/([a-zA-Z0-9]+)$/);
  if (agentMatch) {
    return { type: 'agent', username: agentMatch[1] };
  }
  return localStorage.getItem('token') ? { type: 'dashboard' } : { type: 'login' };
}

export default function App() {
  const [page, setPage] = createSignal<Page>(getInitialPage());

  const navigate = (p: Page) => {
    if (p.type === 'terminal') {
      history.pushState(null, '', `/t/${p.username}`);
    } else if (p.type === 'agent') {
      history.pushState(null, '', `/a/${p.username}`);
    } else if (p.type === 'task') {
      history.pushState(null, '', `/a/${p.username}/task/${p.taskId}`);
    } else if (p.type === 'dashboard') {
      history.pushState(null, '', '/');
    } else {
      history.pushState(null, '', '/');
    }
    setPage(p);
  };

  const handlePopstate = () => setPage(getInitialPage());
  window.addEventListener('popstate', handlePopstate);
  onCleanup(() => window.removeEventListener('popstate', handlePopstate));

  return (
    <div class="min-h-screen bg-background">
      <Show when={page().type === 'login'}>
        <Login onLogin={() => navigate({ type: 'dashboard' })} />
      </Show>
      <Show when={page().type === 'dashboard'}>
        <Dashboard
          onLogout={() => navigate({ type: 'login' })}
          onOpenTerminal={(username: string) => navigate({ type: 'terminal', username })}
          onOpenAgent={(username: string) => navigate({ type: 'agent', username })}
        />
      </Show>
      <Show when={page().type === 'terminal'}>
        <Suspense fallback={<div class="flex items-center justify-center min-h-screen text-muted-foreground">Loading terminal...</div>}>
          <Terminal
            username={(page() as { type: 'terminal'; username: string }).username}
            onBack={() => navigate({ type: 'dashboard' })}
          />
        </Suspense>
      </Show>
      <Show when={page().type === 'agent'}>
        <Suspense fallback={<div class="flex items-center justify-center min-h-screen text-muted-foreground">Loading agent...</div>}>
          <AgentDashboard
            username={(page() as { type: 'agent'; username: string }).username}
            onBack={() => navigate({ type: 'dashboard' })}
            onOpenTask={(taskId: string) => navigate({ type: 'task', username: (page() as { type: 'agent'; username: string }).username, taskId })}
          />
        </Suspense>
      </Show>
      <Show when={page().type === 'task'}>
        <Suspense fallback={<div class="flex items-center justify-center min-h-screen text-muted-foreground">Loading task...</div>}>
          <TaskDetail
            username={(page() as { type: 'task'; username: string; taskId: string }).username}
            taskId={(page() as { type: 'task'; username: string; taskId: string }).taskId}
            onBack={() => navigate({ type: 'agent', username: (page() as { type: 'task'; username: string; taskId: string }).username })}
          />
        </Suspense>
      </Show>
    </div>
  );
}
