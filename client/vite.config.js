// website build and dev server settings (Vite) - security headers, the /api proxy and shared packages
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// make shared/ files use this app's copy of react, axios and the router (only one copy)
const sharedPackageAliases = ['react', 'react-dom', 'react/jsx-runtime', 'react-router-dom', 'axios'].reduce(
  (aliases, pkg) => {
    aliases[pkg] = path.resolve(__dirname, 'node_modules', pkg);
    return aliases;
  },
  {}
);

// headers sent with every page - same rules as server/src/app.js
const SECURITY_HEADERS = {
  // security headers
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

// dev server gets every header except the CSP
const { 'Content-Security-Policy': _strictCsp, ...DEV_HEADERS } = SECURITY_HEADERS;

// the Vite settings
export default defineConfig({
  // React support
  plugins: [react()],
  resolve: {
    alias: sharedPackageAliases,
  },
  // static files from shared/client/public
  publicDir: path.resolve(__dirname, '../shared/client/public'),
  // dev server - npm run dev, port 5173
  server: {
    port: 5173,
    strictPort: true,
    headers: DEV_HEADERS,
    // allow tunnel hostnames (Vite blocks unrecognized Host headers by default)
    allowedHosts: ['.loca.lt', '.trycloudflare.com', '.brilliantinstitute.edu.lk'],
    // The dev server may only read this app and shared/client
    fs: {
      strict: true,
      allow: [__dirname, path.resolve(__dirname, '../shared/client')],
      deny: ['.env', '.env.*', '*.{crt,pem,key}', '**/*.sql', '**/uploads/**', '**/server/**'],
    },
    // send /api and /uploads to the backend
    proxy: {
      // Strip Origin on the proxy hop
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
    allowedHosts: ['.loca.lt', '.trycloudflare.com', '.brilliantinstitute.edu.lk'],
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
