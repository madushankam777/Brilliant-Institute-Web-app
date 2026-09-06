import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// fs.allow lets the dev server read the shared/ folder, which sits
// outside this app's own root (two levels up: client -> this folder -> repo root).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, '../..')],
    },
  },
});
