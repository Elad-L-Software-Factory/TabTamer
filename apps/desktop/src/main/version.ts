import { app } from 'electron';

/** Replaced at build time with the short Git commit (see build.mjs). */
declare const __BUILD_ID__: string;

/** e.g. "TabTamer v0.3.0 · build 74ba385" */
export function versionLabel(): string {
  const build = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
  return `TabTamer v${app.getVersion()} · build ${build}`;
}
