import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const sharedPackageAliases = ['react', 'react-dom', 'react/jsx-runtime', 'react-router-dom', 'axios'].reduce(
  (aliases, pkg) => {
    aliases[pkg] = path.resolve(__dirname, 'node_modules', pkg);
    return aliases;
  },
  {}
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: sharedPackageAliases,
  },
  // Static files (favicon, etc.) live once in shared/client/public instead
  // of a separate copy per app.
  publicDir: path.resolve(__dirname, '../shared/client/public'),
  server: {
    port: 5173,
    // Dev-only: lets this server accept requests carrying a public tunnel's
    // hostname (localtunnel/cloudflared) instead of only localhost/LAN-IP -
    // Vite blocks unrecognized Host headers by default (DNS-rebinding guard).
    allowedHosts: ['.loca.lt', '.trycloudflare.com'],
    // Lets the dev server read shared/, which sits outside this app's own
    // root (one level up: client -> repo root).
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
    // Forward API/upload calls to the backend so the browser only ever talks
    // to this one origin - required for cookies (SameSite=strict) to work
    // when the site is reached through a tunnel/reverse proxy on a single
    // public URL, and it's what lets httpClient use a plain relative
    // '/api' base instead of guessing a hostname.
    proxy: {
      // Strip Origin on the proxy hop - it's a server-to-server request at
      // that point, not the browser's cross-origin request, so the backend
      // should see it as same-origin (needed for CORS to work no matter
      // what public URL - LAN IP, tunnel, real domain - served the page).
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
        },
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
        },
      },
    },
  },
  // `vite preview` serves the production build (npm run build first) - a
  // handful of bundled/minified files instead of dev mode's hundreds of
  // separate unbundled modules, which holds up far better over a laggy
  // tunnel. Mirrors the dev server's proxy + allowedHosts settings above.
  preview: {
    port: 4173,
    allowedHosts: ['.loca.lt', '.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
        },
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
        },
      },
    },
  },
});
