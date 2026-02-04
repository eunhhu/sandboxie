import { Client, type ClientChannel } from 'ssh2';

export interface SSHConnectOpts {
  host: string;
  port: number;
  username: string;
  password: string;
  cols?: number;
  rows?: number;
}

export interface SSHConnection {
  stream: ClientChannel;
  client: Client;
}

export function connectSSH(opts: SSHConnectOpts): Promise<SSHConnection> {
  return new Promise((resolve, reject) => {
    const client = new Client();

    const timeout = setTimeout(() => {
      client.end();
      reject(new Error('SSH connection timeout'));
    }, 10000);

    client.on('ready', () => {
      clearTimeout(timeout);
      client.shell(
        {
          term: 'xterm-256color',
          cols: opts.cols ?? 80,
          rows: opts.rows ?? 24,
        },
        (err, stream) => {
          if (err) {
            client.end();
            return reject(err);
          }
          resolve({ stream, client });
        },
      );
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    client.connect({
      host: opts.host,
      port: opts.port,
      username: opts.username,
      password: opts.password,
    });
  });
}
