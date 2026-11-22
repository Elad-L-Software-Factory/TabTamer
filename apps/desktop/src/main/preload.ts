import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type AppState, type SweepRow, type TabTamerApi } from './ipc';

const api: TabTamerApi = {
  getState: () => ipcRenderer.invoke(IPC.getState) as Promise<AppState>,
  onState: (listener) => {
    const handler = (_e: unknown, state: AppState) => listener(state);
    ipcRenderer.on(IPC.state, handler);
    return () => ipcRenderer.off(IPC.state, handler);
  },
  closeTab: (browser, tabId) =>
    ipcRenderer.invoke(IPC.closeTab, browser, tabId) as Promise<boolean>,
  focusTab: (browser, tabId) =>
    ipcRenderer.invoke(IPC.focusTab, browser, tabId) as Promise<boolean>,
  sweepStart: () => ipcRenderer.invoke(IPC.sweepStart) as Promise<SweepRow[]>,
  sweepRun: (keys) => ipcRenderer.invoke(IPC.sweepRun, keys) as Promise<number>,
  sweepUndo: () => ipcRenderer.invoke(IPC.sweepUndo) as Promise<number>,
};

contextBridge.exposeInMainWorld('tabtamer', api);
