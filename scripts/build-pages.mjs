/**
 * Extra files GitHub Pages needs on top of `vite build`:
 *
 *  - 404.html: Pages answers unknown paths with it, so a deep link loads the
 *    app shell instead of a bare GitHub error page.
 *  - .nojekyll: stops Jekyll from dropping files whose names start with "_".
 *
 * The API is *not* part of this output; it runs on another host and is reached
 * through VITE_API_BASE.
 */
import { copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');

await copyFile(join(dist, 'index.html'), join(dist, '404.html'));
await writeFile(join(dist, '.nojekyll'), '');

if (!process.env.VITE_API_BASE) {
  console.warn(
    'warning: VITE_API_BASE is not set, so this build will call /api on the Pages origin, where no API exists.',
  );
}

console.log('GitHub Pages extras written to dist/ (404.html, .nojekyll)');
