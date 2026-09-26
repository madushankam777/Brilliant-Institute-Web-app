// puts the site online for testing - API, website and Cloudflare tunnel
// close the window (or press Ctrl+C) and everything stops
const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CLIENT = path.join(ROOT, 'client');
const SERVER = path.join(ROOT, 'server');
const VITE = path.join(CLIENT, 'node_modules', 'vite', 'bin', 'vite.js');
const children = [];
let stopping = false;

function stopAll(code) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => {
    if (child.exitCode === null) child.kill();
  });
  console.log('\nSite is offline.');
  process.exit(code);
}

// MySQL must be running first
function checkMySql() {
  return new Promise((resolve) => {
    const socket = net.connect(3306, '127.0.0.1');
    socket.setTimeout(2000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function start(name, command, args, cwd, onLine) {
  const child = spawn(command, args, { cwd });
  children.push(child);
  const print = (data) =>
    data
      .toString()
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) => (onLine ? onLine(line) : console.log(`[${name}] ${line}`)));
  child.stdout.on('data', print);
  child.stderr.on('data', print);
  child.on('error', (error) => {
    console.log(`[${name}] could not start: ${error.message}`);
    stopAll(1);
  });
  child.on('exit', () => {
    if (!stopping) {
      console.log(`[${name}] stopped - taking the site offline.`);
      stopAll(1);
    }
  });
}

(async () => {
  if (!(await checkMySql())) {
    console.log('MySQL is not running. Start it first: Windows search -> "Services" -> MySQL80 -> Start.');
    process.exit(1);
  }

  // old copies from a previous run
  execFileSync(process.execPath, [path.join(__dirname, 'free-port.js'), 'server'], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(__dirname, 'free-port.js'), 'preview'], { stdio: 'inherit' });

  // build the website the first time, or when asked with "host.cmd build"
  if (process.argv.includes('build') || !fs.existsSync(path.join(CLIENT, 'dist', 'index.html'))) {
    console.log('Building the website...');
    execFileSync(process.execPath, [VITE, 'build'], { cwd: CLIENT, stdio: 'inherit' });
  }

  start('api', process.execPath, ['src/server.js'], SERVER);
  start('site', process.execPath, [VITE, 'preview'], CLIENT);
  start('tunnel', 'cloudflared', ['tunnel', '--url', 'http://localhost:4173'], ROOT, (line) => {
    const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) {
      console.log('\n=================================================================');
      console.log(`  Your site is online:  ${match[0]}`);
      console.log('  Close this window (or press Ctrl+C) to take it offline.');
      console.log('=================================================================\n');
    } else if (/ERR|error/.test(line)) {
      console.log(`[tunnel] ${line}`);
    }
  });
})();

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
process.on('SIGHUP', () => stopAll(0));
