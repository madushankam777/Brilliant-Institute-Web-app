import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Files under shared/client/src import packages (react-router-dom, axios,
// the JSX runtime) that only exist in THIS app's own node_modules. Node's
// module resolution walks up from the importing file's own folder, so it
// never finds a sibling app's node_modules on its own - these aliases
// point those bare imports at this app's copies explicitly.
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
  server: {
    port: 5173,
    // Lets the dev server read shared/, which sits outside this app's own
    // root (two levels up: client -> this folder -> repo root).
    fs: {
      allow: [path.resolve(__dirname, '../..')],
    },
  },
});
