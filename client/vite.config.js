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
    // Lets the dev server read shared/, which sits outside this app's own
    // root (one level up: client -> repo root).
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
});
