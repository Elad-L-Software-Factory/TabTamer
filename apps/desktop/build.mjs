// Bundles the Electron main process, the preload bridge and the native host relay.
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

await rm('dist/main', { recursive: true, force: true });
await rm('dist/native-host', { recursive: true, force: true });

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  logLevel: 'warning',
};

await Promise.all([
  build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.cjs' }),
  build({ ...common, entryPoints: ['src/main/preload.ts'], outfile: 'dist/main/preload.cjs' }),
  build({
    ...common,
    entryPoints: ['src/native-host/relay.ts'],
    outfile: 'dist/native-host/relay.cjs',
  }),
]);
console.log('Desktop main, preload and native host relay built');
