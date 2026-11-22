import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type AppState,
  type SavedTab,
  type SweepRow,
  type TabTamerApi,
  type TriageState,
} from './ipc';

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_e: unknown, value: T) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

const api: TabTamerApi = {
  getState: () => ipcRenderer.invoke(IPC.getState) as Promise<AppState>,
  onState: (listener) => subscribe(IPC.state, listener),
  closeTab: (browser, tabId) =>
    ipcRenderer.invoke(IPC.closeTab, browser, tabId) as Promise<boolean>,
  focusTab: (browser, tabId) =>
    ipcRenderer.invoke(IPC.focusTab, browser, tabId) as Promise<boolean>,
  sweepStart: () => ipcRenderer.invoke(IPC.sweepStart) as Promise<SweepRow[]>,
  sweepRun: (keys) => ipcRenderer.invoke(IPC.sweepRun, keys) as Promise<number>,
  sweepUndo: () => ipcRenderer.invoke(IPC.sweepUndo) as Promise<number>,
  triageStart: () => ipcRenderer.invoke(IPC.triageStart) as Promise<TriageState>,
  onTriage: (listener) => subscribe(IPC.triageState, listener),
  triageAct: (key, action, target) =>
    ipcRenderer.invoke(IPC.triageAct, key, action, target) as Promise<boolean>,
  triageAcceptAll: () => ipcRenderer.invoke(IPC.triageAcceptAll) as Promise<number>,
  triageUndo: () => ipcRenderer.invoke(IPC.triageUndo) as Promise<boolean>,
  savedList: () => ipcRenderer.invoke(IPC.savedList) as Promise<SavedTab[]>,
  savedOpen: (id) => ipcRenderer.invoke(IPC.savedOpen, id) as Promise<boolean>,
  savedDelete: (id) => ipcRenderer.invoke(IPC.savedDelete, id) as Promise<boolean>,
};

contextBridge.exposeInMainWorld('tabtamer', api);
