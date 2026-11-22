import type { TabTamerApi } from '../main/ipc';

declare global {
  interface Window {
    tabtamer: TabTamerApi;
  }
}

export {};
