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

const SECURITY_HEADERS = {
  // The app loads only its own bundle; inline styles are needed because
  // React writes style props out as inline style attributes. Form posts are
  // limited to this site plus PayHere's hosted checkout.
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    // the Contact page shows a Google Map
    "frame-src https://www.google.com https://maps.google.com",
    "form-action 'self' https://sandbox.payhere.lk https://www.payhere.lk",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

// The dev server injects an inline React Refresh script and an HMR websocket,
// which a strict CSP blocks - so dev gets every header except the CSP, and
// the strict CSP applies to the production build served by `vite preview`.
const { 'Content-Security-Policy': _strictCsp, ...DEV_HEADERS } = SECURITY_HEADERS;

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
    strictPort: true,
    headers: DEV_HEADERS,
    // allow tunnel hostnames (Vite blocks unrecognized Host headers by default)
    allowedHosts: ['.loca.lt', '.trycloudflare.com'],
    // The dev server may only read this app and shared/client - never the
    // server code, the sql/ folder (it holds a database password) or uploads.
    fs: {
      strict: true,
      allow: [__dirname, path.resolve(__dirname, '../shared/client')],
      deny: ['.env', '.env.*', '*.{crt,pem,key}', '**/*.sql', '**/uploads/**', '**/server/**'],
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
        xfwd: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
        },
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        xfwd: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
        },
      },
    },
  },
  // serves the production build (npm run build) - mirrors server config above
  preview: {
    port: 4173,
    strictPort: true,
    headers: SECURITY_HEADERS,
    allowedHosts: ['.loca.lt', '.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        xfwd: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
        },
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        xfwd: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
        },
      },
    },
  },
});
