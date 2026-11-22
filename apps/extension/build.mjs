// Builds the browser helper into dist/ (load this folder as an unpacked extension).
import { build } from 'esbuild';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const out = 'dist';
await rm(out, { recursive: true, force: true });
await mkdir(`${out}/icons`, { recursive: true });

await build({
  entryPoints: ['src/background.ts'],
  bundle: true,
  format: 'esm',
  target: 'chrome116',
  outfile: `${out}/background.js`,
  logLevel: 'warning',
});

// Icons are drawn in code by @tabtamer/brand, so there are no binary files in Git.
const { outputFiles } = await build({
  entryPoints: ['../../packages/brand/src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const brand = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
);
for (const size of [16, 32, 48, 128]) {
  const png = brand.encodePng(brand.drawIcon(size, 'T'), size, size, (d) => deflateSync(d));
  await writeFile(`${out}/icons/${size}.png`, png);
}

await copyFile('manifest.json', `${out}/manifest.json`);
console.log('Browser helper built in apps/extension/dist');
