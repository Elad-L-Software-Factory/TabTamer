/**
 * Browser hub: listens on the private named pipe, receives tab snapshots from every
 * connected browser helper (through its relay) and sends commands back.
 */
import { EventEmitter } from 'node:events';
import net from 'node:net';
import {
  LineDecoder,
  PIPE_NAME,
  PROTOCOL_VERSION,
  TabRegistry,
  encodeLine,
  parseHelperMessage,
  type AppCommand,
  type BrowserKind,
  type TabSummary,
} from '@tabtamer/core';

interface Connection {
  socket: net.Socket;
  browser: BrowserKind | null;
}

export class BrowserHub extends EventEmitter<{ change: [TabSummary] }> {
  readonly registry = new TabRegistry();
  private connections = new Map<string, Connection>();
  private server: net.Server | null = null;
  private seq = 0;

  constructor(private readonly pipePath: string = PIPE_NAME) {
    super();
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => this.onSocket(socket));
      server.once('error', reject);
      server.listen(this.pipePath, () => resolve());
      this.server = server;
    });
  }

  stop(): Promise<void> {
    for (const c of this.connections.values()) c.socket.destroy();
    return new Promise((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }

  summary(): TabSummary {
    return this.registry.summary();
  }

  /** Close tabs in one browser. Returns false if that browser is not connected. */
  closeTabs(browser: BrowserKind, tabIds: number[]): boolean {
    return this.send(browser, {
      type: 'closeTabs',
      v: PROTOCOL_VERSION,
      requestId: `close-${++this.seq}`,
      tabIds,
    });
  }

  private send(browser: BrowserKind, command: AppCommand): boolean {
    for (const c of this.connections.values()) {
      if (c.browser === browser) {
        c.socket.write(encodeLine(command));
        return true;
      }
    }
    return false;
  }

  private onSocket(socket: net.Socket): void {
    const lines = new LineDecoder();
    const relayIds = new Set<string>();
    socket.setEncoding('utf8');
    socket.on('data', (text: string) => {
      for (const raw of lines.push(text)) {
        if (typeof raw !== 'object' || raw === null) continue;
        const env = raw as { relayId?: unknown; message?: unknown; disconnected?: unknown };
        if (typeof env.relayId !== 'string') continue;
        relayIds.add(env.relayId);
        if (env.disconnected === true) {
          this.drop(env.relayId);
          continue;
        }
        this.onMessage(env.relayId, socket, env.message);
      }
    });
    socket.on('error', () => {
      /* handled by close */
    });
    socket.on('close', () => {
      for (const id of relayIds) this.drop(id);
    });
  }

  private onMessage(relayId: string, socket: net.Socket, raw: unknown): void {
    const message = parseHelperMessage(raw);
    if (!message) return;
    const conn = this.connections.get(relayId) ?? { socket, browser: null };
    this.connections.set(relayId, conn);
    if (message.type === 'hello') {
      conn.browser = message.browser;
    } else if (message.type === 'tabs') {
      conn.browser = message.browser;
      this.registry.setTabs(message.browser, message.tabs);
      this.emit('change', this.summary());
    }
  }

  private drop(relayId: string): void {
    const conn = this.connections.get(relayId);
    if (!conn) return;
    this.connections.delete(relayId);
    const stillConnected = [...this.connections.values()].some((c) => c.browser === conn.browser);
    if (conn.browser && !stillConnected) {
      this.registry.removeBrowser(conn.browser);
      this.emit('change', this.summary());
    }
  }
}
