import { createSignal, onCleanup } from 'solid-js';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

export type TerminalStatus = 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'error';

const THEME = {
  background: '#1a1b26',
  foreground: '#a9b1d6',
  cursor: '#c0caf5',
  cursorAccent: '#1a1b26',
  selectionBackground: '#33467c',
  black: '#15161e',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#a9b1d6',
  brightBlack: '#414868',
  brightRed: '#f7768e',
  brightGreen: '#9ece6a',
  brightYellow: '#e0af68',
  brightBlue: '#7aa2f7',
  brightMagenta: '#bb9af7',
  brightCyan: '#7dcfff',
  brightWhite: '#c0caf5',
};

export function useTerminal(username: string) {
  const [status, setStatus] = createSignal<TerminalStatus>('disconnected');
  const [errorMessage, setErrorMessage] = createSignal('');

  let terminal: Terminal | null = null;
  let fitAddon: FitAddon | null = null;
  let ws: WebSocket | null = null;
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const isMobile = () => window.innerWidth < 768;

  function createTerminal(container: HTMLElement) {
    terminal = new Terminal({
      theme: THEME,
      fontSize: isMobile() ? 12 : 14,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, Monaco, monospace",
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
      scrollOnUserInput: true,
      smoothScrollDuration: 0, // Disable smooth scroll for better mobile performance
    });

    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    terminal.open(container);
    fitAddon.fit();

    resizeObserver = new ResizeObserver(() => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        fitAddon?.fit();
      }, 150);
    });
    resizeObserver.observe(container);

    terminal.onData((data) => {
      if (ws?.readyState === WebSocket.OPEN && status() === 'connected') {
        ws.send(JSON.stringify({
          type: 'data',
          data: btoa(data),
        }));
      }
    });

    terminal.onResize(({ cols, rows }) => {
      if (ws?.readyState === WebSocket.OPEN && status() === 'connected') {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    // mobile viewport - handled by parent component now

    return terminal;
  }

  function connect(password: string) {
    if (ws) disconnect();

    setStatus('connecting');
    setErrorMessage('');

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/api/terminal/${username}`);

    ws.onopen = () => {
      setStatus('authenticating');
      const cols = terminal?.cols ?? 80;
      const rows = terminal?.rows ?? 24;
      ws!.send(JSON.stringify({ type: 'auth', password, cols, rows }));
    };

    ws.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'authenticated':
          setStatus('connected');
          terminal?.focus();
          startPing();
          break;

        case 'data': {
          const bytes = Uint8Array.from(atob(msg.data), c => c.charCodeAt(0));
          terminal?.write(bytes);
          break;
        }

        case 'error':
          setErrorMessage(msg.message);
          setStatus('error');
          break;

        case 'disconnect':
          setStatus('disconnected');
          terminal?.writeln('\r\n\x1b[33m[Connection closed]\x1b[0m');
          break;

        case 'pong':
          break;
      }
    };

    ws.onclose = () => {
      stopPing();
      if (status() === 'connected') {
        setStatus('disconnected');
        terminal?.writeln('\r\n\x1b[33m[Connection closed]\x1b[0m');
      }
    };

    ws.onerror = () => {
      setErrorMessage('WebSocket connection failed');
      setStatus('error');
    };
  }

  function disconnect() {
    stopPing();
    if (ws) {
      ws.close();
      ws = null;
    }
    setStatus('disconnected');
  }

  function startPing() {
    stopPing();
    pingInterval = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  function stopPing() {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  }

  function fit() {
    fitAddon?.fit();
  }

  function dispose() {
    disconnect();
    if (resizeTimeout) clearTimeout(resizeTimeout);
    if (resizeObserver) resizeObserver.disconnect();
    terminal?.dispose();
    terminal = null;
    fitAddon = null;
  }

  onCleanup(dispose);

  return {
    status,
    errorMessage,
    terminalInstance: () => terminal,
    fitAddon: () => fitAddon,
    createTerminal,
    connect,
    disconnect,
    fit,
    dispose,
  };
}
