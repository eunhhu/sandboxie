import { createSignal } from 'solid-js';
import { login } from '../api';

interface Props {
  onLogin: () => void;
}

export default function Login(props: Props) {
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal('');
  const [loading, setLoading] = createSignal(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(password());
      props.onLogin();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      if (message.includes('Too many login attempts')) {
        setError('⚠️ 로그인 시도 횟수 초과. 15분 후 다시 시도하세요.');
      } else {
        setError('비밀번호가 올바르지 않습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="flex items-center justify-center min-h-screen">
      <div class="w-full max-w-sm mx-auto space-y-6 p-6">
        <div class="text-center space-y-2">
          <h1 class="text-2xl font-bold">Sandbox Manager</h1>
          <p class="text-muted-foreground text-sm">관리자 비밀번호를 입력하세요</p>
        </div>

        <form onSubmit={handleSubmit} class="space-y-4">
          <div class="space-y-2">
            <label for="password" class="text-sm font-medium">비밀번호</label>
            <input
              id="password"
              type="password"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              placeholder="비밀번호 입력"
              required
              class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          {error() && <p class="text-sm text-destructive">{error()}</p>}

          <button
            type="submit"
            disabled={loading()}
            class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
          >
            {loading() ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
