import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API server runs next to Vite in dev; /api is proxied so the browser
// only ever talks to one origin (no CORS, and the preview tunnel works).
// Extra preview hostnames are passed in through the documented
// __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS variable (comma separated).
const extraAllowedHosts = (process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves project sites from /<repo>/, so builds there set
  // VITE_BASE. Everything else, including Netlify and dev, stays at root.
  base: process.env.VITE_BASE || '/',
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    ...(extraAllowedHosts.length ? { allowedHosts: extraAllowedHosts } : {}),
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
