// Development smoke test with a REAL browser (no effect on your own browser windows):
// starts a BrowserHub on a private test pipe, launches Edge with a throwaway profile and the
// unpacked helper, then checks: live tab count, Sweep finds junk + duplicates, closing works,
// and Undo reopens them.
// Requires: pnpm build and pnpm register-host (run from a normal terminal).
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../../..');
const { outputFiles } = await build({
  stdin: {
    contents: "export { BrowserHub } from './hub'; export { SweepSession } from './sweepSession';",
    resolveDir: path.join(root, 'apps/desktop/src/main'),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { BrowserHub, SweepSession } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
);

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = mkdtempSync(path.join(tmpdir(), 'tabtamer-smoke-'));
const pipe = `\\\\.\\pipe\\tabtamer-smoke-${process.pid}`;
const hub = new BrowserHub(pipe);
await hub.start();
const sweep = new SweepSession(hub);

const edgeCount = () => hub.summary().byBrowser.edge ?? 0;
const waitFor = (label, pred, ms = 30000) =>
  new Promise((resolve, reject) => {
    if (pred()) return resolve();
    const t = setTimeout(() => reject(new Error('timeout waiting for ' + label)), ms);
    const check = () => {
      if (pred()) {
        clearTimeout(t);
        hub.off('change', check);
        resolve();
      }
    };
    hub.on('change', check);
  });
const step = (msg) => console.log('  ✓ ' + msg);

const proc = spawn(
  edge,
  [
    `--user-data-dir=${profile}`,
    `--load-extension=${path.join(root, 'apps/extension/dist')}`,
    '--no-first-run',
    '--no-default-browser-check',
    'https://example.com/a',
    'https://example.com/a?utm_source=newsletter',
    'about:blank',
    'https://example.org/c',
  ],
  { stdio: 'ignore', env: { ...process.env, TABTAMER_PIPE: pipe } },
);

let ok = false;
try {
  await waitFor('4 tabs', () => edgeCount() >= 4);
  const before = edgeCount();
  step(`helper connected, ${before} tabs`);

  const rows = sweep.start();
  const reasons = rows.map((r) => r.reason).sort();
  if (!(reasons.includes('blank') && reasons.includes('duplicate'))) {
    throw new Error('sweep did not find blank + duplicate: ' + JSON.stringify(reasons));
  }
  step(`sweep proposes ${rows.length}: ${reasons.join(', ')}`);

  const closed = sweep.run(rows.map((r) => r.key));
  await waitFor('tabs to close', () => edgeCount() === before - closed);
  step(`closed ${closed}, now ${edgeCount()} tabs`);

  const reopened = sweep.undo();
  await waitFor('undo to reopen', () => edgeCount() === before);
  step(`undo reopened ${reopened}, back to ${edgeCount()} tabs`);

  const urls = hub.allTabs().map((t) => t.url);
  if (!urls.some((u) => u.includes('example.com/a'))) throw new Error('reopened URL missing');
  ok = true;
} catch (err) {
  console.error('  ✗ ' + err.message);
} finally {
  // Edge hands off to other processes, so stop every process of THIS throwaway profile only.
  proc.kill();
  spawnSync('powershell', [
    '-NoProfile',
    '-Command',
    `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${path.basename(profile)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
  ]);
  await hub.stop();
  setTimeout(() => {
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* Edge may still hold files */
    }
    console.log(ok ? 'SMOKE TEST PASSED' : 'SMOKE TEST FAILED');
    process.exit(ok ? 0 : 1);
  }, 1500);
}
