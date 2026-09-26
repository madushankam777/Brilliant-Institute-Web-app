// stops old copies of this project's dev servers before starting
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..').toLowerCase();

const ROLES = {
  server: { port: 5000, dir: 'server', match: /nodemon|src[\\/]server\.js/i },
  client: { port: 5173, dir: 'client', match: /vite/i, not: /preview/i },
  preview: { port: 4173, dir: 'client', match: /vite/i, only: /preview/i },
};

const role = ROLES[process.argv[2]];
if (!role) {
  console.error('[free-port] usage: free-port.js <server|client|preview>');
  process.exit(2);
}

if (process.platform !== 'win32') {
  process.exit(0);
}

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true });
}

function listProcesses() {
  const script =
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress';
  const parsed = JSON.parse(run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script]) || '[]');
  return (Array.isArray(parsed) ? parsed : [parsed]).map((p) => ({
    pid: p.ProcessId,
    ppid: p.ParentProcessId,
    name: (p.Name || '').toLowerCase(),
    cmd: p.CommandLine || '',
  }));
}

function listeningPids(port) {
  const pids = new Set();
  run('netstat', ['-ano']).split(/\r?\n/).forEach((line) => {
    const m = /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/.exec(line);
    if (m && Number(m[1]) === port) pids.add(Number(m[2]));
  });
  return pids;
}

function isFree(port) {
  return listeningPids(port).size === 0;
}

const processes = listProcesses();
const byPid = new Map(processes.map((p) => [p.pid, p]));

// Never touch ourselves, or the npm/shell chain that launched this script.
const protectedPids = new Set();
for (let p = byPid.get(process.pid); p; p = byPid.get(p.ppid)) {
  if (protectedPids.has(p.pid)) break;
  protectedPids.add(p.pid);
}

const projectNeedle = path.join(REPO_ROOT, role.dir, 'node_modules').toLowerCase();

function belongsToRole(proc) {
  const cmd = proc.cmd.toLowerCase();
  if (!proc.name.startsWith('node')) return false;
  if (!role.match.test(proc.cmd)) return false;
  if (role.not && role.not.test(proc.cmd)) return false;
  if (role.only && !role.only.test(proc.cmd)) return false;
  return cmd.includes(projectNeedle) || /src[\\/]server\.js/i.test(proc.cmd);
}

const WRAPPER = /nodemon|npm-cli|npx-cli|vite|cmd(\.exe)?["\s]+\/d\s+\/s\s+\/c/i;

function topWrapper(proc) {
  let top = proc;
  for (let p = byPid.get(proc.ppid); p; p = byPid.get(p.ppid)) {
    const isWrapper = (p.name === 'node.exe' || p.name === 'cmd.exe') && WRAPPER.test(p.cmd);
    if (!isWrapper || protectedPids.has(p.pid)) break;
    top = p;
  }
  return top;
}

const foreign = [];
const victims = new Set();

for (const pid of listeningPids(role.port)) {
  const proc = byPid.get(pid);
  if (!proc || protectedPids.has(pid)) continue;
  if (belongsToRole(proc)) victims.add(proc.pid);
  else foreign.push(proc);
}

processes.filter((p) => !protectedPids.has(p.pid) && belongsToRole(p)).forEach((p) => victims.add(p.pid));

if (foreign.length > 0) {
  const who = foreign.map((p) => `${p.name} (PID ${p.pid})`).join(', ');
  console.error(
    `[free-port] Port ${role.port} is used by ${who}, which is not part of this project. ` +
      'Close that program (or change the port) and try again.'
  );
  process.exit(1);
}

const roots = new Set();
victims.forEach((pid) => {
  const proc = byPid.get(pid);
  if (proc) roots.add(topWrapper(proc).pid);
});

roots.forEach((pid) => {
  try {
    run('taskkill', ['/PID', String(pid), '/T', '/F']);
  } catch (error) {
    // already gone
  }
});

const deadline = Date.now() + 8000;
while (!isFree(role.port) && Date.now() < deadline) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
}

if (!isFree(role.port)) {
  console.error(`[free-port] Port ${role.port} is still busy after stopping old copies.`);
  process.exit(1);
}

console.log(
  roots.size > 0
    ? `[free-port] Stopped ${roots.size} stale ${process.argv[2]} process group(s); port ${role.port} is free.`
    : `[free-port] Port ${role.port} is free.`
);
