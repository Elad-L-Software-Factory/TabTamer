/**
 * End-to-end test of the browser link without a real browser:
 * fake helper -> relay process (real, over stdin/stdout) -> named pipe -> BrowserHub.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import {
  NativeMessageDecoder,
  PROTOCOL_VERSION,
  encodeNativeMessage,
  type TabInfo,
  type TabSummary,
} from '@tabtamer/core';
import { BrowserHub } from './hub';

const relayOut = path.resolve(__dirname, '../../dist/test/relay.cjs');
const pipe = `\\\\.\\pipe\\tabtamer-test-${process.pid}`;

const tab = (id: number): TabInfo => ({
  id,
  windowId: 1,
  url: `https://example.com/${id}`,
  title: `Tab ${id}`,
  pinned: false,
  audible: false,
  active: false,
});

function waitFor<T>(hub: BrowserHub, pred: (s: TabSummary) => T | false, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    const check = (s: TabSummary) => {
      const r = pred(s);
      if (r !== false) {
        clearTimeout(timer);
        hub.off('change', check);
        resolve(r);
      }
    };
    hub.on('change', check);
  });
}

describe.runIf(process.platform === 'win32')('browser link (relay + hub)', () => {
  let hub: BrowserHub;
  const relays: ChildProcess[] = [];

  beforeAll(async () => {
    await build({
      entryPoints: [path.resolve(__dirname, '../native-host/relay.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile: relayOut,
      logLevel: 'silent',
    });
    expect(existsSync(relayOut)).toBe(true);
  });

  afterEach(async () => {
    relays.forEach((r) => r.kill());
    relays.length = 0;
    await hub?.stop();
  });

  function startRelay(): ChildProcess {
    const r = spawn(process.execPath, [relayOut], {
      env: { ...process.env, TABTAMER_PIPE: pipe },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    relays.push(r);
    return r;
  }

  it('counts tabs from two browsers and forgets one when it disconnects', async () => {
    hub = new BrowserHub(pipe);
    await hub.start();

    const chrome = startRelay();
    chrome.stdin!.write(
      encodeNativeMessage({
        type: 'hello',
        v: PROTOCOL_VERSION,
        browser: 'chrome',
        extensionVersion: '0.1.0',
      }),
    );
    chrome.stdin!.write(
      encodeNativeMessage({
        type: 'tabs',
        v: PROTOCOL_VERSION,
        browser: 'chrome',
        tabs: [tab(1), tab(2), tab(3)],
      }),
    );
    await waitFor(hub, (s) => s.total === 3);

    const edge = startRelay();
    edge.stdin!.write(
      encodeNativeMessage({ type: 'tabs', v: PROTOCOL_VERSION, browser: 'edge', tabs: [tab(7)] }),
    );
    const s = await waitFor(hub, (x) => (x.total === 4 ? x : false));
    expect(s.byBrowser).toEqual({ chrome: 3, edge: 1 });

    chrome.stdin!.end();
    const after = await waitFor(hub, (x) => (x.total === 1 ? x : false));
    expect(after.connected).toEqual(['edge']);
  });

  it('sends no updates while shutting down (the tray and window may already be gone)', async () => {
    hub = new BrowserHub(pipe);
    await hub.start();
    const edge = startRelay();
    edge.stdin!.write(
      encodeNativeMessage({ type: 'tabs', v: PROTOCOL_VERSION, browser: 'edge', tabs: [tab(1)] }),
    );
    await waitFor(hub, (s) => s.total === 1);
    let updatesAfterStop = 0;
    hub.on('change', () => updatesAfterStop++);
    await hub.stop();
    await new Promise((r) => setTimeout(r, 300)); // let socket close events run
    expect(updatesAfterStop).toBe(0);
  });

  it('delivers a close command back to the browser as a native message', async () => {
    hub = new BrowserHub(pipe);
    await hub.start();
    const edge = startRelay();
    edge.stdin!.write(
      encodeNativeMessage({ type: 'tabs', v: PROTOCOL_VERSION, browser: 'edge', tabs: [tab(5)] }),
    );
    await waitFor(hub, (s) => s.total === 1);

    const received = new Promise<unknown>((resolve) => {
      const dec = new NativeMessageDecoder();
      edge.stdout!.on('data', (chunk: Buffer) => {
        const [msg] = dec.push(new Uint8Array(chunk));
        if (msg) resolve(msg);
      });
    });
    expect(hub.closeTabs('edge', [5])).toBe(true);
    expect(await received).toMatchObject({ type: 'closeTabs', tabIds: [5] });
    expect(hub.closeTabs('chrome', [1])).toBe(false);
  });
});
