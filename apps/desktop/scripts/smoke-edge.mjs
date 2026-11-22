// Development smoke test with a REAL browser:
// starts the BrowserHub, launches Edge with a throwaway profile + the unpacked helper,
// waits for the tab count, closes one tab through the helper and checks the count drops.
// Requires: pnpm build, pnpm register-host. Close the TabTamer app first (it owns the pipe).
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../../..');
const { outputFiles } = await build({
  entryPoints: [path.join(root, 'apps/desktop/src/main/hub.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { BrowserHub } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
);

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = mkdtempSync(path.join(tmpdir(), 'tabtamer-smoke-'));
const hub = new BrowserHub();
await hub.start();

const waitFor = (pred, ms = 30000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for ' + pred)), ms);
    const check = (s) => {
      if (pred(s)) {
        clearTimeout(t);
        hub.off('change', check);
        resolve(s);
      }
    };
    hub.on('change', check);
  });

const proc = spawn(
  edge,
  [
    `--user-data-dir=${profile}`,
    `--load-extension=${path.join(root, 'apps/extension/dist')}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=msEdgeSidebarV2',
    'https://example.com/a',
    'https://example.com/b',
    'https://example.org/c',
  ],
  { stdio: 'ignore' },
);

let ok = false;
try {
  const s1 = await waitFor((s) => s.byBrowser.edge >= 3);
  console.log('Connected:', JSON.stringify(s1));
  const victim = hub.registry.allTabs().find((t) => t.url.includes('example.org'));
  hub.closeTabs('edge', [victim.id]);
  const s2 = await waitFor((s) => s.byBrowser.edge === s1.byBrowser.edge - 1);
  console.log('After closing one tab:', JSON.stringify(s2));
  ok = true;
} catch (err) {
  console.error('SMOKE TEST FAILED:', err.message);
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
