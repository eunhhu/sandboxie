import { Elysia } from 'elysia';
import type { Client, ClientChannel } from 'ssh2';
import { connectSSH } from '../services/ssh';
import * as sessionService from '../services/session';

interface WSState {
  sshClient: Client | null;
  sshStream: ClientChannel | null;
  authenticated: boolean;
}

// Key by username — one terminal session per user
const wsStateMap = new Map<string, WSState>();

export const terminalRoutes = new Elysia()
  .ws('/api/terminal/:username', {
    open(ws) {
      const username = (ws.data.params as { username: string }).username;
      console.log(`[terminal] WS open: ${username}`);
      wsStateMap.set(username, {
        sshClient: null,
        sshStream: null,
        authenticated: false,
      });
    },

    async message(ws, raw) {
      const username = (ws.data.params as { username: string }).username;
      const state = wsStateMap.get(username);

      if (!state) {
        console.log(`[terminal] No state for ${username}`);
        ws.send(JSON.stringify({ type: 'error', message: 'Internal error' }));
        return;
      }

      let msg: any;
      try {
        msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        return;
      }

      console.log(`[terminal] msg type=${msg.type} user=${username}`);

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      if (msg.type === 'auth') {
        if (state.authenticated) {
          ws.send(JSON.stringify({ type: 'error', message: 'Already authenticated' }));
          return;
        }

        try {
          const session = await sessionService.getSession(username);
          if (!session || session.status !== 'running') {
            ws.send(JSON.stringify({ type: 'error', message: 'Session not found or not running' }));
            ws.close();
            return;
          }

          console.log(`[terminal] SSH connecting to 127.0.0.1:${session.sshPort}`);

          const { stream, client } = await connectSSH({
            host: '127.0.0.1',
            port: session.sshPort,
            username,
            password: msg.password,
            cols: msg.cols ?? 80,
            rows: msg.rows ?? 24,
          });

          state.sshClient = client;
          state.sshStream = stream;
          state.authenticated = true;

          ws.send(JSON.stringify({ type: 'authenticated' }));
          console.log(`[terminal] SSH authenticated for ${username}`);

          stream.on('data', (data: Buffer) => {
            ws.send(JSON.stringify({
              type: 'data',
              data: data.toString('base64'),
            }));
          });

          stream.on('close', () => {
            ws.send(JSON.stringify({ type: 'disconnect' }));
            ws.close();
          });

          client.on('error', (err) => {
            console.log(`[terminal] SSH error: ${err.message}`);
            ws.send(JSON.stringify({ type: 'disconnect' }));
            ws.close();
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'SSH connection failed';
          console.log(`[terminal] SSH connect failed: ${message}`);
          ws.send(JSON.stringify({ type: 'error', message }));
          ws.close();
        }

        return;
      }

      if (!state.authenticated || !state.sshStream) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
        return;
      }

      if (msg.type === 'data') {
        const buf = Buffer.from(msg.data, 'base64');
        state.sshStream.write(buf);
        return;
      }

      if (msg.type === 'resize') {
        const cols = Number(msg.cols) || 80;
        const rows = Number(msg.rows) || 24;
        state.sshStream.setWindow(rows, cols, 0, 0);
        return;
      }
    },

    close(ws) {
      const username = (ws.data.params as { username: string }).username;
      const state = wsStateMap.get(username);
      console.log(`[terminal] WS close: ${username}`);
      if (state?.sshStream) {
        state.sshStream.close();
      }
      if (state?.sshClient) {
        state.sshClient.end();
      }
      wsStateMap.delete(username);
    },
  });
