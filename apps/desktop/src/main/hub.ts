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
  type PageTextsMessage,
  type ResultMessage,
  type TabSummary,
  type TabToOpen,
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

  private pending = new Map<
    string,
    { resolve: (m: ResultMessage | PageTextsMessage | null) => void; timer: NodeJS.Timeout }
  >();

  /** Send a command and wait for the helper's reply (null if not connected or no reply in time). */
  private request(
    browser: BrowserKind,
    command: AppCommand,
    timeoutMs: number,
  ): Promise<ResultMessage | PageTextsMessage | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(command.requestId);
        resolve(null);
      }, timeoutMs);
      this.pending.set(command.requestId, { resolve, timer });
      if (!this.send(browser, command)) {
        clearTimeout(timer);
        this.pending.delete(command.requestId);
        resolve(null);
      }
    });
  }

  /** First part of each page's text, by tab id. Unreadable tabs are missing from the map. */
  async getPageTexts(browser: BrowserKind, tabIds: number[]): Promise<Map<number, string>> {
    const reply = await this.request(
      browser,
      { type: 'getPageTexts', v: PROTOCOL_VERSION, requestId: `text-${++this.seq}`, tabIds },
      30_000,
    );
    const map = new Map<number, string>();
    if (reply?.type === 'pageTexts') for (const t of reply.texts) map.set(t.tabId, t.text);
    return map;
  }

  /** Move tabs into a theme window with a labelled group. Returns the window id, or null. */
  async moveToGroup(
    browser: BrowserKind,
    tabIds: number[],
    windowId: number | undefined,
    groupTitle: string,
    groupColor: string,
  ): Promise<number | null> {
    const cmd: AppCommand = {
      type: 'moveToGroup',
      v: PROTOCOL_VERSION,
      requestId: `move-${++this.seq}`,
      tabIds,
      groupTitle,
      groupColor,
      ...(windowId !== undefined ? { windowId } : {}),
    };
    const reply = await this.request(browser, cmd, 15_000);
    return reply?.type === 'result' && reply.ok ? (reply.windowId ?? null) : null;
  }

  /** Undo a move: put tabs back where they were. */
  async restoreTabs(
    browser: BrowserKind,
    moves: { tabId: number; windowId: number; index: number }[],
  ): Promise<boolean> {
    const reply = await this.request(
      browser,
      { type: 'restoreTabs', v: PROTOCOL_VERSION, requestId: `restore-${++this.seq}`, moves },
      15_000,
    );
    return reply?.type === 'result' && reply.ok;
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

  /** Bring a tab to the front (peek). */
  focusTab(browser: BrowserKind, tabId: number): boolean {
    return this.send(browser, {
      type: 'focusTab',
      v: PROTOCOL_VERSION,
      requestId: `focus-${++this.seq}`,
      tabId,
    });
  }

  /** Reopen tabs (Undo). */
  openTabs(browser: BrowserKind, tabs: TabToOpen[]): boolean {
    return this.send(browser, {
      type: 'openTabs',
      v: PROTOCOL_VERSION,
      requestId: `open-${++this.seq}`,
      tabs,
    });
  }

  allTabs() {
    return this.registry.allTabs();
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
    } else {
      const waiting = this.pending.get(message.requestId);
      if (waiting) {
        clearTimeout(waiting.timer);
        this.pending.delete(message.requestId);
        waiting.resolve(message);
      }
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
