import { createSignal, onMount, Show } from 'solid-js';
import { useTerminal } from '../hooks/useTerminal';
import '@xterm/xterm/css/xterm.css';

interface Props {
  username: string;
  onBack: () => void;
}

export default function Terminal(props: Props) {
  const { status, errorMessage, createTerminal, connect, disconnect } = useTerminal(props.username);
  const [password, setPassword] = createSignal('');

  let containerRef: HTMLDivElement | undefined;

  onMount(() => {
    if (containerRef) {
      createTerminal(containerRef);
    }
  });

  const handleAuth = (e: Event) => {
    e.preventDefault();
    if (!password()) return;
    connect(password());
  };

  const showOverlay = () => status() !== 'connected';

  const statusText = () => {
    switch (status()) {
      case 'connecting': return '...';
      case 'authenticating': return '...';
      case 'connected': return 'Connected';
      case 'error': return 'Error';
      case 'disconnected': return 'Disconnected';
      default: return '';
    }
  };

  const statusDotColor = () => {
    switch (status()) {
      case 'connected': return 'bg-green-500';
      case 'connecting':
      case 'authenticating': return 'bg-yellow-500 animate-pulse';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div class="flex flex-col h-screen" style={{ background: '#1a1b26' }}>
      {/* Top bar */}
      <div
        class="flex items-center justify-between px-3 sm:px-4 h-10 sm:h-11 shrink-0"
        style={{ background: '#16161e', 'border-bottom': '1px solid #292e42' }}
      >
        <div class="flex items-center gap-2 sm:gap-3">
          <button
            onClick={props.onBack}
            class="text-xs sm:text-sm px-2 py-1 rounded hover:bg-white/10 transition-colors"
            style={{ color: '#7aa2f7' }}
          >
            Back
          </button>
          <span class="text-xs sm:text-sm font-medium" style={{ color: '#a9b1d6' }}>
            {props.username}
          </span>
        </div>

        <div class="flex items-center gap-2 sm:gap-3">
          <div class="flex items-center gap-1.5">
            <div class={`w-2 h-2 rounded-full ${statusDotColor()}`} />
            <span class="text-xs" style={{ color: '#565f89' }}>{statusText()}</span>
          </div>
          <Show when={status() === 'connected'}>
            <button
              onClick={disconnect}
              class="text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors"
              style={{ color: '#f7768e' }}
            >
              Disconnect
            </button>
          </Show>
        </div>
      </div>

      {/* Terminal area */}
      <div class="relative flex-1 overflow-hidden">
        <div
          ref={containerRef}
          class="w-full h-full"
          style={{ padding: '4px' }}
        />

        {/* Auth overlay */}
        <Show when={showOverlay()}>
          <div
            class="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(26, 27, 38, 0.92)', 'backdrop-filter': 'blur(4px)' }}
          >
            <div class="w-full max-w-xs px-4">
              <div class="text-center mb-5">
                <div
                  class="text-base sm:text-lg font-semibold mb-1"
                  style={{ color: '#c0caf5' }}
                >
                  {props.username}
                </div>
                <div class="text-xs" style={{ color: '#565f89' }}>
                  SSH Terminal
                </div>
              </div>

              <Show when={errorMessage()}>
                <div
                  class="text-xs text-center mb-3 px-3 py-2 rounded"
                  style={{ background: 'rgba(247, 118, 142, 0.1)', color: '#f7768e' }}
                >
                  {errorMessage()}
                </div>
              </Show>

              <form onSubmit={handleAuth} class="space-y-3">
                <input
                  type="password"
                  value={password()}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                  placeholder="Password"
                  autofocus
                  class="w-full h-10 px-3 text-sm rounded outline-none"
                  style={{
                    background: '#292e42',
                    color: '#a9b1d6',
                    border: '1px solid #3b4261',
                  }}
                />
                <button
                  type="submit"
                  disabled={!password() || status() === 'connecting' || status() === 'authenticating'}
                  class="w-full h-10 text-sm font-medium rounded transition-colors disabled:opacity-40"
                  style={{
                    background: '#7aa2f7',
                    color: '#1a1b26',
                  }}
                >
                  {status() === 'connecting' || status() === 'authenticating'
                    ? 'Connecting...'
                    : status() === 'disconnected' && errorMessage()
                      ? 'Retry'
                      : 'Connect'}
                </button>
              </form>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
