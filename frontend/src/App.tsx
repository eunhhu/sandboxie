import { createSignal, Show } from 'solid-js';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

type Page = 'login' | 'dashboard';

function getInitialPage(): Page {
  return localStorage.getItem('token') ? 'dashboard' : 'login';
}

export default function App() {
  const [page, setPage] = createSignal<Page>(getInitialPage());

  const navigate = (p: Page) => setPage(p);

  return (
    <div class="min-h-screen bg-background">
      <Show when={page() === 'login'}>
        <Login onLogin={() => navigate('dashboard')} />
      </Show>
      <Show when={page() === 'dashboard'}>
        <Dashboard onLogout={() => navigate('login')} />
      </Show>
    </div>
  );
}
