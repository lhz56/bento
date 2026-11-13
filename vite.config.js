import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
const { safeFetch } = createRequire(import.meta.url)('./electron/netfetch.cjs');

// In development the page comes from Vite, so lesson code's web requests (/__net) are answered here,
// the same way electron/main.cjs answers them in the app.
const devNet = {
  name: 'bento-dev-net',
  configureServer(server) {
    server.middlewares.use('/__net', async (req, res) => {
      const u = new URL(req.url, 'http://x'); const target = u.searchParams.get('u') || '';
      const send = (status, body, type = 'text/plain') => { res.setHeader('x-status', String(status)); res.setHeader('x-content-type', type); res.end(body); };
      const headers = { 'user-agent': 'Bento (learning app)' };
      for (const [k, v] of Object.entries(req.headers)) if (k.startsWith('x-h-')) headers[k.slice(4)] = v;
      let body; if (!['GET', 'HEAD'].includes(req.method)) { body = ''; for await (const c of req) body += c; }
      try { const r = await safeFetch(target, { method: req.method, headers, body }); send(r.status, r.text, r.type); }
      catch (e) { send(0, e.message); }
    });
  },
};

// The page's Content-Security-Policy (index.html) is the release one. In development the page comes from Vite, which
// needs its inline React-refresh script and its live-reload socket: added here, and only here.
const devCsp = {
  name: 'bento-dev-csp',
  apply: 'serve',
  transformIndexHtml: (html) => html
    .replace("script-src 'self'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'")
    .replace("connect-src 'self'", "connect-src 'self' ws://localhost:5199")
    .replace("worker-src 'self'", "worker-src 'self' blob:"),
};

export default defineConfig({
  plugins: [react(), devNet, devCsp],
  base: './',
  server: { port: 5199, strictPort: true },
  worker: { format: 'es' },
  build: { target: 'esnext', outDir: 'dist', emptyOutDir: true },
  optimizeDeps: { exclude: ['pyodide'] },
});
