import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';

mkdirSync('deploy', { recursive: true });

await build({
  entryPoints: ['worker/index.mjs'],
  outfile: 'deploy/worker.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  logLevel: 'info',
});

console.log('[build] deploy/worker.js written');
