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

  publicDir: path.resolve(__dirname, '../../shared/client/public'),
  server: {
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, '../..')],
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
});
