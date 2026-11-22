/**
 * TabTamer (by Elad Lavi): Electron main process.
 * Lives in the Windows tray, shows the live tab count and opens the Home screen.
 */
import path from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, Tray } from 'electron';
import { BROWSERS, type BrowserKind, type TriageAction } from '@tabtamer/core';
import { ClaudeProvider, CostMeter } from '@tabtamer/llm';
import { hasClaudeSignIn, loadApiKey } from './apiKey';
import { BrowserHub } from './hub';
import { IPC, type AppState } from './ipc';
import { Store } from './store';
import { SweepSession } from './sweepSession';
import { TriageSession } from './triageSession';
import { trayIcon } from './trayIcon';
import { versionLabel } from './version';

const BROWSER_LABEL: Record<BrowserKind, string> = { chrome: 'Chrome', edge: 'Edge' };
const ACTIONS: TriageAction[] = ['forget', 'save', 'theme'];

// App data lives in %APPDATA%\TabTamer (until M4 moves it to Google Drive).
app.setName('TabTamer');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId('TabTamer');
  void app.whenReady().then(start);
}

let tray: Tray | null = null;
let win: BrowserWindow | null = null;
let quitting = false;
const hub = new BrowserHub();
const sweep = new SweepSession(hub);
let store: Store;
let triage: TriageSession;

function state(): AppState {
  return {
    summary: hub.summary(),
    tabs: hub.registry.allTabs(),
    savedCount: store?.saved.length ?? 0,
    version: versionLabel(),
  };
}

function tooltip(): string {
  const s = hub.summary();
  if (s.connected.length === 0) return 'TabTamer: waiting for Chrome or Edge';
  const parts = s.connected.map((b) => `${BROWSER_LABEL[b]} ${s.byBrowser[b] ?? 0}`);
  return `TabTamer: ${s.total} tabs open (${parts.join(', ')})`;
}

/** Send to the screens only while the window is alive (not during shutdown). */
function sendToWindow(channel: string, payload: unknown): void {
  if (quitting || !win || win.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

function refreshTray(): void {
  if (quitting || !tray || tray.isDestroyed()) return;
  const s = hub.summary();
  tray.setImage(trayIcon(s.connected.length ? s.total : null));
  tray.setToolTip(tooltip());
}

function showWindow(): void {
  if (!win) {
    win = new BrowserWindow({
      width: 440,
      height: 640,
      minWidth: 380,
      minHeight: 480,
      title: 'TabTamer',
      icon: trayIcon(null),
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#f8f9fb',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.on('close', (e) => {
      if (!quitting) {
        e.preventDefault();
        win?.hide();
      }
    });
    // Never navigate away from the app's own screens or open other windows.
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
    win.once('ready-to-show', () => win?.show());
    return;
  }
  win.show();
  win.focus();
}

async function start(): Promise<void> {
  ipcMain.handle(IPC.getState, () => state());
  const validTab = (browser: unknown, tabId: unknown): browser is BrowserKind =>
    BROWSERS.includes(browser as BrowserKind) && Number.isInteger(tabId);
  ipcMain.handle(IPC.closeTab, (_e, browser: unknown, tabId: unknown) =>
    validTab(browser, tabId) ? hub.closeTabs(browser, [tabId as number]) : false,
  );
  ipcMain.handle(IPC.focusTab, (_e, browser: unknown, tabId: unknown) =>
    validTab(browser, tabId) ? hub.focusTab(browser, tabId as number) : false,
  );
  ipcMain.handle(IPC.sweepStart, () => sweep.start());
  ipcMain.handle(IPC.sweepRun, (_e, keys: unknown) =>
    Array.isArray(keys) && keys.every((k) => typeof k === 'string') ? sweep.run(keys) : 0,
  );
  ipcMain.handle(IPC.sweepUndo, () => sweep.undo());

  store = new Store(app.getPath('userData'));
  // Claude access: a key (.env / environment) or the `ant auth login` browser sign-in.
  const apiKey = loadApiKey(app.getAppPath());
  const provider =
    apiKey || hasClaudeSignIn()
      ? new ClaudeProvider(apiKey ? { apiKey } : {}, store.settings.model)
      : null;
  const meter = new CostMeter(store.settings.spend, store.settings.monthlyCapUsd);
  triage = new TriageSession(hub, store, provider, meter);
  triage.on('update', (s) => sendToWindow(IPC.triageState, s));

  ipcMain.handle(IPC.triageStart, () => triage.start(sweep.closedKeys()));
  ipcMain.handle(IPC.triageAct, (_e, key: unknown, action: unknown, target: unknown) =>
    typeof key === 'string' && ACTIONS.includes(action as TriageAction)
      ? triage.act(key, action as TriageAction, typeof target === 'string' ? target : undefined)
      : false,
  );
  ipcMain.handle(IPC.triageAcceptAll, () => triage.acceptAll());
  ipcMain.handle(IPC.triageUndo, () => triage.undo());
  ipcMain.handle(IPC.savedList, () => store.saved);
  ipcMain.handle(IPC.savedOpen, (_e, id: unknown) => {
    const s = store.saved.find((x) => x.id === id);
    if (!s) return false;
    const browser = hub.summary().connected.includes(s.browser)
      ? s.browser
      : hub.summary().connected[0];
    return browser ? hub.openTabs(browser, [{ url: s.url }]) : false;
  });
  ipcMain.handle(IPC.savedDelete, (_e, id: unknown) =>
    typeof id === 'string' ? Boolean(store.removeSaved(id)) : false,
  );

  hub.on('change', () => {
    refreshTray();
    sendToWindow(IPC.state, state());
  });

  try {
    await hub.start();
  } catch (err) {
    console.error('TabTamer could not open its private connection for the browser helpers', err);
  }

  tray = new Tray(trayIcon(null));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: versionLabel(), enabled: false },
      { type: 'separator' },
      { label: 'Open TabTamer', click: showWindow },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', showWindow);
  refreshTray();

  app.on('second-instance', showWindow);
  app.on('before-quit', () => {
    quitting = true;
    void hub.stop();
  });
  // A tray app keeps running when its window is closed.
  app.on('window-all-closed', () => undefined);

  if (process.argv.includes('--show')) showWindow();

  // Developer aid: `electron . --capture=out.png` saves a screenshot of Home, then quits.
  const capture = process.argv.find((a) => a.startsWith('--capture='))?.slice('--capture='.length);
  if (capture) {
    showWindow();
    win?.once('ready-to-show', () => {
      setTimeout(async () => {
        const image = await win!.webContents.capturePage();
        const { writeFile } = await import('node:fs/promises');
        await writeFile(capture, image.toPNG());
        quitting = true;
        app.quit();
      }, 1500);
    });
  }
}
