/**
 * TabTamer (by Elad Lavi): Electron main process.
 * Lives in the Windows tray, shows the live tab count and opens the Home screen.
 */
import path from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, Tray } from 'electron';
import { BROWSERS, type BrowserKind } from '@tabtamer/core';
import { BrowserHub } from './hub';
import { IPC, type AppState } from './ipc';
import { SweepSession } from './sweepSession';
import { trayIcon } from './trayIcon';

const BROWSER_LABEL: Record<BrowserKind, string> = { chrome: 'Chrome', edge: 'Edge' };

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

function state(): AppState {
  return { summary: hub.summary(), tabs: hub.registry.allTabs() };
}

function tooltip(): string {
  const s = hub.summary();
  if (s.connected.length === 0) return 'TabTamer: waiting for Chrome or Edge';
  const parts = s.connected.map((b) => `${BROWSER_LABEL[b]} ${s.byBrowser[b] ?? 0}`);
  return `TabTamer: ${s.total} tabs open (${parts.join(', ')})`;
}

function refreshTray(): void {
  if (!tray) return;
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

  hub.on('change', () => {
    refreshTray();
    win?.webContents.send(IPC.state, state());
  });

  try {
    await hub.start();
  } catch (err) {
    console.error('TabTamer could not open its private connection for the browser helpers', err);
  }

  tray = new Tray(trayIcon(null));
  tray.setContextMenu(
    Menu.buildFromTemplate([
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
