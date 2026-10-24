// Builds the simulator and TV preview into web/dist, which the Pawzoo server serves.
import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await build({
  entryPoints: { app: 'src/main.ts', tv: 'src/tv.ts' },
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: true,
  outdir: 'dist',
});
await cp('public', 'dist', { recursive: true });
await cp('index.html', 'dist/index.html');
await cp('tv.html', 'dist/tv.html');
console.log('web: built dist/');
