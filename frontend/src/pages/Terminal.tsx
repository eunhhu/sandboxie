import { createSignal, onMount, Show, onCleanup, createEffect } from 'solid-js';
import { useTerminal } from '../hooks/useTerminal';
import '@xterm/xterm/css/xterm.css';

interface Props {
  username: string;
  onBack: () => void;
}

type ModifierKey = 'ctrl' | 'alt' | 'shift';

export default function Terminal(props: Props) {
  const { status, errorMessage, createTerminal, connect, disconnect, terminalInstance } = useTerminal(props.username);
  const [password, setPassword] = createSignal('');
  const [activeModifiers, setActiveModifiers] = createSignal<Set<ModifierKey>>(new Set());

  let containerRef: HTMLDivElement | undefined;

  onMount(() => {
    if (containerRef) {
      createTerminal(containerRef);
    }

    // Listen to real keyboard events and apply modifiers
    const handleKeyDown = (e: KeyboardEvent) => {
      const term = terminalInstance();
      if (!term || status() !== 'connected') return;

      const mods = activeModifiers();
      if (mods.size === 0) return;

      // If any modifier is active, intercept and apply
      if (mods.has('ctrl') || mods.has('alt') || mods.has('shift')) {
        e.preventDefault();

        const key = e.key;
        const ctrlKey = mods.has('ctrl') || e.ctrlKey;
        const altKey = mods.has('alt') || e.altKey;
        const shiftKey = mods.has('shift') || e.shiftKey;

        // Send special sequences for common shortcuts
        if (ctrlKey && !altKey && !shiftKey) {
          if (key === 'c' || key === 'C') {
            term.input('\x03'); // Ctrl+C
            setActiveModifiers(new Set<ModifierKey>());
            return;
          } else if (key === 'd' || key === 'D') {
            term.input('\x04'); // Ctrl+D
            setActiveModifiers(new Set<ModifierKey>());
            return;
          } else if (key === 'z' || key === 'Z') {
            term.input('\x1a'); // Ctrl+Z
            setActiveModifiers(new Set<ModifierKey>());
            return;
          }
        }

        // For other keys, apply modifiers
        term.input(key, { ctrlKey, altKey, shiftKey } as any);
        setActiveModifiers(new Set<ModifierKey>());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    onCleanup(() => {
      window.removeEventListener('keydown', handleKeyDown);
    });
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

  const focusTerminal = () => {
    const term = terminalInstance();
    if (term) {
      term.focus();
    }
  };

  const toggleModifier = (key: ModifierKey) => {
    setActiveModifiers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    focusTerminal();
  };

  const clearModifiers = () => {
    setActiveModifiers(new Set<ModifierKey>());
  };

  const sendKey = (key: string, code?: string) => {
    const term = terminalInstance();
    if (!term) return;

    const mods = activeModifiers();
    const ctrlKey = mods.has('ctrl');
    const altKey = mods.has('alt');
    const shiftKey = mods.has('shift');

    // Send to terminal
    term.input(key, {
      ctrlKey,
      altKey,
      shiftKey,
    } as any);

    clearModifiers();
    focusTerminal();
  };

  const sendSpecialKey = (sequence: string) => {
    const term = terminalInstance();
    if (!term) return;
    term.input(sequence);
    clearModifiers();
    focusTerminal();
  };

  const KeyButton = (props: {
    label: string;
    onClick: () => void;
    active?: boolean;
    class?: string;
    wide?: boolean;
  }) => (
    <button
      onClick={props.onClick}
      class={`
        ${props.wide ? 'flex-1' : 'min-w-[44px]'}
        h-9 px-2 rounded text-xs font-medium
        transition-all active:scale-95
        ${props.active
          ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/50'
          : 'bg-[#292e42] text-[#a9b1d6] active:bg-[#3b4261]'}
        ${props.class || ''}
      `}
      style={{
        border: props.active ? '1px solid #7aa2f7' : '1px solid #3b4261',
        'user-select': 'none',
        '-webkit-user-select': 'none',
        '-webkit-tap-highlight-color': 'transparent',
      }}
    >
      {props.label}
    </button>
  );

  return (
    <div class="flex flex-col" style={{ height: '100dvh', background: '#1a1b26' }}>
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
          style={{
            padding: '4px',
            'touch-action': 'pan-y',
            '-webkit-overflow-scrolling': 'touch',
            'overflow-y': 'auto',
          }}
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

      {/* Mobile keyboard toolbar - only visible on mobile */}
      <Show when={status() === 'connected'}>
        <div
          class="md:hidden shrink-0 px-2 py-2 safe-area-bottom"
          style={{
            background: '#16161e',
            'border-top': '1px solid #292e42',
          }}
        >
          {/* Modifier keys row */}
          <div class="flex gap-1.5 mb-2">
            <KeyButton
              label="Ctrl"
              onClick={() => toggleModifier('ctrl')}
              active={activeModifiers().has('ctrl')}
            />
            <KeyButton
              label="Alt"
              onClick={() => toggleModifier('alt')}
              active={activeModifiers().has('alt')}
            />
            <KeyButton
              label="Shift"
              onClick={() => toggleModifier('shift')}
              active={activeModifiers().has('shift')}
            />
            <KeyButton
              label="Tab"
              onClick={() => sendKey('\t')}
              wide
            />
            <KeyButton
              label="Esc"
              onClick={() => sendSpecialKey('\x1b')}
            />
          </div>

          {/* Arrow keys row */}
          <div class="flex gap-1.5">
            <KeyButton
              label="↑"
              onClick={() => sendSpecialKey('\x1b[A')}
            />
            <KeyButton
              label="↓"
              onClick={() => sendSpecialKey('\x1b[B')}
            />
            <KeyButton
              label="←"
              onClick={() => sendSpecialKey('\x1b[D')}
            />
            <KeyButton
              label="→"
              onClick={() => sendSpecialKey('\x1b[C')}
            />
            <div class="flex-1 flex items-center justify-center text-xs" style={{ color: '#565f89' }}>
              {activeModifiers().size > 0 && (
                <span>
                  {Array.from(activeModifiers()).map(m => m.toUpperCase()).join('+')} + type key
                </span>
              )}
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
