import { createSignal, Show } from 'solid-js';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Terminal from './pages/Terminal';

type Page =
  | { type: 'login' }
  | { type: 'dashboard' }
  | { type: 'terminal'; username: string };

function getInitialPage(): Page {
  const path = window.location.pathname;
  const match = path.match(/^\/t\/([a-zA-Z0-9]+)$/);
  if (match) {
    return { type: 'terminal', username: match[1] };
  }
  return localStorage.getItem('token') ? { type: 'dashboard' } : { type: 'login' };
}

export default function App() {
  const [page, setPage] = createSignal<Page>(getInitialPage());

  const navigate = (p: Page) => {
    if (p.type === 'terminal') {
      history.pushState(null, '', `/t/${p.username}`);
    } else if (p.type === 'dashboard') {
      history.pushState(null, '', '/');
    } else {
      history.pushState(null, '', '/');
    }
    setPage(p);
  };

  window.addEventListener('popstate', () => {
    setPage(getInitialPage());
  });

  return (
    <div class="min-h-screen bg-background">
      <Show when={page().type === 'login'}>
        <Login onLogin={() => navigate({ type: 'dashboard' })} />
      </Show>
      <Show when={page().type === 'dashboard'}>
        <Dashboard
          onLogout={() => navigate({ type: 'login' })}
          onOpenTerminal={(username: string) => navigate({ type: 'terminal', username })}
        />
      </Show>
      <Show when={page().type === 'terminal'}>
        <Terminal
          username={(page() as { type: 'terminal'; username: string }).username}
          onBack={() => navigate({ type: 'dashboard' })}
        />
      </Show>
    </div>
  );
}
