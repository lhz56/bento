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
      const u = new URL(req.url, 'http://x');
      const target = u.searchParams.get('u') || '';
      const send = (status, body, type = 'text/plain') => {
        res.setHeader('x-status', String(status));
        res.setHeader('x-content-type', type);
        res.end(body);
      };
      const headers = { 'user-agent': 'Bento (learning app)' };
      for (const [k, v] of Object.entries(req.headers))
        if (k.startsWith('x-h-')) headers[k.slice(4)] = v;
      let body;
      if (!['GET', 'HEAD'].includes(req.method)) {
        body = '';
        for await (const c of req) body += c;
      }
      try {
        const r = await safeFetch(target, { method: req.method, headers, body });
        send(r.status, r.text, r.type);
      } catch (e) {
        send(0, e.message);
      }
    });
  },
};

// The page's Content-Security-Policy (index.html) is the release one. In development the page comes from Vite, which
// needs its inline React-refresh script and its live-reload socket: added here, and only here.
const devCsp = {
  name: 'bento-dev-csp',
  apply: 'serve',
  transformIndexHtml: (html) =>
    html
      .replace("script-src 'self'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'")
      .replace("connect-src 'self'", "connect-src 'self' ws://localhost:5199")
      .replace("worker-src 'self'", "worker-src 'self' blob:"),
};

// The web version (src/web.js, takeitapart.app/try) reads a featured project's files and searches repos straight from
// GitHub, so its page may also connect there; and a lesson's web page runs in a sandboxed frame of its own (public/web-play.html). Only that build gets this.
const WEB = process.env.VITE_BENTO_WEB === '1';
const webCsp = {
  name: 'bento-web-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    WEB
      ? html
          .replace(
            "connect-src 'self'",
            "connect-src 'self' https://raw.githubusercontent.com https://api.github.com https://cykxdotlcscwrnwgdtwl.supabase.co",
          )
          .replace('frame-src play:', "frame-src 'self'")
      : html,
};

// A finger has no hover. On an iPhone or iPad a tapped button takes its :hover look and keeps it until you tap
// something else, so every :hover rule only counts where there's a pointer that hovers (a Mac's mouse or trackpad).
// (A rule that also names another state, like `.alt:hover, .alt.on`, keeps that state everywhere.)
const hoverWhereHover = {
  postcssPlugin: 'bento-hover-where-hover',
  Once(root, { AtRule }) {
    root.walkRules((rule) => {
      if (!rule.selector.includes(':hover')) return;
      for (let p = rule.parent; p; p = p.parent)
        if (p.type === 'atrule' && (/keyframes/.test(p.name) || /hover:\s*hover/.test(p.params)))
          return;
      const hov = rule.selectors.filter((s) => s.includes(':hover')),
        rest = rule.selectors.filter((s) => !s.includes(':hover'));
      const only = new AtRule({ name: 'media', params: '(hover: hover)' });
      only.append(rule.clone({ selectors: hov }));
      rule.after(only);
      if (rest.length) rule.selectors = rest;
      else rule.remove();
    });
  },
};

export default defineConfig({
  plugins: [react(), devNet, devCsp, webCsp],
  css: { postcss: { plugins: [hoverWhereHover] } },
  base: './',
  server: { port: 5199, strictPort: true },
  worker: { format: 'es' },
  build: {
    target: 'esnext',
    outDir: WEB ? 'dist-web' : 'dist',
    emptyOutDir: true,
    license: { fileName: 'THIRD-PARTY-LICENSES.md' },
  },
  optimizeDeps: { exclude: ['pyodide'] },
});
