// installs every folder's packages - the cloud build runs this (npm run build)
const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// the API loads route files from each person's module, so each module's packages are needed too
const FOLDERS = [
  'shared/server',
  'N Danushika/server',
  'M T Madushanka/server',
  'C D Kumanan/server',
  'H A S Hapuarachchi/server',
  'S Vithushan/server',
  'server',
  'client',
];

for (const folder of FOLDERS) {
  console.log(`\n[install] ${folder}`);
  // the website build needs its dev tools (vite); the servers do not
  const flags = folder === 'client' ? '--include=dev' : '--omit=dev';
  execSync(`npm ci ${flags} --no-audit --no-fund`, { cwd: path.join(ROOT, folder), stdio: 'inherit' });
}
console.log('\n[install] done');
