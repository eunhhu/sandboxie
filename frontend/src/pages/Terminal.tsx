import { createSignal, onMount, Show, onCleanup } from 'solid-js';
import { useTerminal } from '../hooks/useTerminal';
import '@xterm/xterm/css/xterm.css';

interface Props {
  username: string;
  onBack: () => void;
}

type ModifierKey = 'ctrl' | 'alt' | 'shift';

export default function Terminal(props: Props) {
  const {
    status,
    errorMessage,
    hasSelection,
    createTerminal,
    connect,
    disconnect,
    terminalInstance,
    fitAddon,
    copySelection,
    paste,
    scrollToBottom,
    scrollToTop,
  } = useTerminal(props.username);
  const [password, setPassword] = createSignal('');
  const [activeModifiers, setActiveModifiers] = createSignal<Set<ModifierKey>>(new Set());
  const [showToast, setShowToast] = createSignal('');
  const [showScrollButtons, setShowScrollButtons] = createSignal(false);

  let containerRef: HTMLDivElement | undefined;
  let toastTimeout: ReturnType<typeof setTimeout> | null = null;

  const isMobile = () => window.innerWidth < 768 || 'ontouchstart' in window;

  const toast = (msg: string) => {
    if (toastTimeout) clearTimeout(toastTimeout);
    setShowToast(msg);
    toastTimeout = setTimeout(() => setShowToast(''), 1500);
  };

  onMount(() => {
    if (containerRef) {
      createTerminal(containerRef);

      // Show scroll buttons on touch devices when scrolling
      if (isMobile()) {
        const viewport = containerRef.querySelector('.xterm-viewport');
        if (viewport) {
          let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
          viewport.addEventListener('scroll', () => {
            setShowScrollButtons(true);
            if (scrollTimeout) clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => setShowScrollButtons(false), 2000);
          });
        }

        // Mobile: intercept beforeinput on xterm's textarea to apply modifiers
        setTimeout(() => {
          const textarea = containerRef?.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
          if (textarea) {
            textarea.addEventListener('beforeinput', handleMobileInput);
            onCleanup(() => textarea.removeEventListener('beforeinput', handleMobileInput));
          }
        }, 100);
      }
    }

    // Mobile viewport handling for virtual keyboard
    if (isMobile() && window.visualViewport) {
      const handleViewportChange = () => {
        setTimeout(() => {
          const fit = fitAddon();
          if (fit) {
            fit.fit();
          }
        }, 100);
      };

      window.visualViewport.addEventListener('resize', handleViewportChange);
      onCleanup(() => {
        window.visualViewport?.removeEventListener('resize', handleViewportChange);
      });
    }

    // Desktop: Listen to real keyboard events and apply modifiers
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isMobile()) return; // Mobile uses beforeinput

      const term = terminalInstance();
      if (!term || status() !== 'connected') return;

      const mods = activeModifiers();
      if (mods.size === 0) return;

      // If any modifier is active, intercept and apply
      if (mods.has('ctrl') || mods.has('alt') || mods.has('shift')) {
        e.preventDefault();
        e.stopPropagation();

        const key = e.key.toLowerCase();
        let seq = '';

        if (mods.has('ctrl')) {
          if (key.length === 1 && key >= 'a' && key <= 'z') {
            seq = String.fromCharCode(key.charCodeAt(0) - 96);
          }
        } else if (mods.has('alt')) {
          if (key.length === 1) {
            seq = '\x1b' + key;
          }
        } else if (mods.has('shift')) {
          if (e.key.length === 1) {
            seq = e.key;
          }
        }

        if (seq) {
          term.input(seq);
        }
        setActiveModifiers(new Set<ModifierKey>());
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    onCleanup(() => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (toastTimeout) clearTimeout(toastTimeout);
    });
  });

  // Mobile input handler - intercepts virtual keyboard input
  const handleMobileInput = (e: InputEvent) => {
    const term = terminalInstance();
    if (!term || status() !== 'connected') return;

    const mods = activeModifiers();
    if (mods.size === 0) return;

    const data = e.data;
    if (!data) return;

    e.preventDefault();

    let seq = '';
    const char = data.charAt(0).toLowerCase();

    if (mods.has('ctrl')) {
      if (char >= 'a' && char <= 'z') {
        seq = String.fromCharCode(char.charCodeAt(0) - 96);
      }
    } else if (mods.has('alt')) {
      seq = '\x1b' + char;
    } else if (mods.has('shift')) {
      seq = data.toUpperCase();
    }

    if (seq) {
      term.input(seq);
    }
    setActiveModifiers(new Set<ModifierKey>());
  };

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

  const sendKey = (key: string) => {
    const term = terminalInstance();
    if (!term) return;

    const mods = activeModifiers();
    let seq = key;

    // Apply modifiers to generate proper sequence
    if (mods.has('ctrl') && key.length === 1) {
      const lower = key.toLowerCase();
      if (lower >= 'a' && lower <= 'z') {
        // Ctrl+A-Z = 0x01-0x1A
        seq = String.fromCharCode(lower.charCodeAt(0) - 96);
      }
    } else if (mods.has('alt')) {
      // Alt + key = ESC + key
      seq = '\x1b' + key;
    } else if (mods.has('shift') && key.length === 1) {
      seq = key.toUpperCase();
    }

    term.input(seq);
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

  // Direct Ctrl+key send (for mobile buttons)
  const sendCtrl = (key: string) => {
    const term = terminalInstance();
    if (!term) return;
    const code = key.toLowerCase().charCodeAt(0) - 96;
    term.input(String.fromCharCode(code));
    focusTerminal();
  };

  const handleCopy = async () => {
    const success = await copySelection();
    toast(success ? 'Copied!' : 'Nothing to copy');
    focusTerminal();
  };

  const handlePaste = async () => {
    const success = await paste();
    if (!success) toast('Clipboard access denied');
    focusTerminal();
  };

  const handleScrollTop = () => {
    scrollToTop();
    setShowScrollButtons(false);
  };

  const handleScrollBottom = () => {
    scrollToBottom();
    setShowScrollButtons(false);
  };

  const KeyButton = (props: {
    label: string;
    onClick: () => void;
    active?: boolean;
    class?: string;
    highlight?: boolean;
  }) => (
    <button
      onClick={props.onClick}
      class={`
        flex-1 min-w-0
        h-9 px-1 rounded text-[11px] font-medium
        transition-all active:scale-95
        ${props.active
          ? 'bg-blue-500 text-white shadow-md shadow-blue-500/40'
          : props.highlight
            ? 'bg-[#3b4261] text-[#7aa2f7]'
            : 'bg-[#292e42] text-[#a9b1d6] active:bg-[#3b4261]'}
        ${props.class || ''}
      `}
      style={{
        border: props.active ? '1px solid #7aa2f7' : props.highlight ? '1px solid #7aa2f7' : '1px solid #3b4261',
        'user-select': 'none',
        '-webkit-user-select': 'none',
        '-webkit-tap-highlight-color': 'transparent',
        'touch-action': 'manipulation',
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
      <div
        class="relative"
        style={{
          overflow: 'hidden',
          flex: '1 1 0',
          'min-height': '0',
        }}
      >
        <div
          ref={containerRef}
          class="w-full h-full"
          style={{ padding: '4px' }}
          onTouchStart={() => focusTerminal()}
        />

        {/* Toast notification */}
        <Show when={showToast()}>
          <div
            class="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-medium pointer-events-none z-50"
            style={{
              background: 'rgba(122, 162, 247, 0.9)',
              color: '#1a1b26',
              'box-shadow': '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            {showToast()}
          </div>
        </Show>

        {/* Mobile scroll buttons */}
        <Show when={showScrollButtons() && status() === 'connected'}>
          <div class="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2 md:hidden">
            <button
              onClick={handleScrollTop}
              class="w-10 h-10 rounded-full flex items-center justify-center active:scale-95"
              style={{
                background: 'rgba(41, 46, 66, 0.9)',
                border: '1px solid #3b4261',
                color: '#a9b1d6',
              }}
            >
              ↑
            </button>
            <button
              onClick={handleScrollBottom}
              class="w-10 h-10 rounded-full flex items-center justify-center active:scale-95"
              style={{
                background: 'rgba(41, 46, 66, 0.9)',
                border: '1px solid #3b4261',
                color: '#a9b1d6',
              }}
            >
              ↓
            </button>
          </div>
        </Show>

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

      {/* Mobile keyboard toolbar - only visible on mobile (2 rows) */}
      <Show when={status() === 'connected'}>
        <div
          class="md:hidden shrink-0 px-2 py-2 safe-area-bottom"
          style={{
            background: '#16161e',
            'border-top': '1px solid #292e42',
          }}
        >
          {/* Row 1: Ctrl combos + modifiers + clipboard */}
          <div class="flex gap-1 mb-1.5">
            <KeyButton label="^C" onClick={() => sendCtrl('c')} class="text-[#f7768e]" />
            <KeyButton label="^D" onClick={() => sendCtrl('d')} />
            <KeyButton label="^Z" onClick={() => sendCtrl('z')} />
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
            <KeyButton label="Copy" onClick={handleCopy} highlight={hasSelection()} />
            <KeyButton label="Paste" onClick={handlePaste} />
          </div>

          {/* Row 2: Tab, Esc, Arrows, symbols */}
          <div class="flex gap-1">
            <KeyButton label="Tab" onClick={() => sendKey('\t')} />
            <KeyButton label="Esc" onClick={() => sendSpecialKey('\x1b')} />
            <KeyButton label="←" onClick={() => sendSpecialKey('\x1b[D')} />
            <KeyButton label="↓" onClick={() => sendSpecialKey('\x1b[B')} />
            <KeyButton label="↑" onClick={() => sendSpecialKey('\x1b[A')} />
            <KeyButton label="→" onClick={() => sendSpecialKey('\x1b[C')} />
            <KeyButton label="|" onClick={() => sendKey('|')} />
            <KeyButton label="/" onClick={() => sendKey('/')} />
          </div>
        </div>
      </Show>
    </div>
  );
}
