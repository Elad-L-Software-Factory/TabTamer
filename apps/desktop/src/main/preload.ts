import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type AppState, type TabTamerApi } from './ipc';

const api: TabTamerApi = {
  getState: () => ipcRenderer.invoke(IPC.getState) as Promise<AppState>,
  onState: (listener) => {
    const handler = (_e: unknown, state: AppState) => listener(state);
    ipcRenderer.on(IPC.state, handler);
    return () => ipcRenderer.off(IPC.state, handler);
  },
  closeTab: (browser, tabId) =>
    ipcRenderer.invoke(IPC.closeTab, browser, tabId) as Promise<boolean>,
};

contextBridge.exposeInMainWorld('tabtamer', api);
