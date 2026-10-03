// stops old copies of this project's dev servers before starting
const path = require('path');
const { execFileSync } = require('child_process');

// this project's folder, in lower case to compare with process paths
const REPO_ROOT = path.resolve(__dirname, '..').toLowerCase();

// what to stop for each kind of server - its port, folder and how to recognise its process
const ROLES = {
  server: { port: 5000, dir: 'server', match: /nodemon|src[\\/]server\.js/i },
  client: { port: 5173, dir: 'client', match: /vite/i, not: /preview/i },
  preview: { port: 4173, dir: 'client', match: /vite/i, only: /preview/i },
};

// which server to free: server, client or preview
const role = ROLES[process.argv[2]];
if (!role) {
  console.error('[free-port] usage: free-port.js <server|client|preview>');
  process.exit(2);
}

// only works on Windows - do nothing elsewhere
if (process.platform !== 'win32') {
  process.exit(0);
}

// run a command and return its text output
function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true });
}

// all running processes with their parent and command line (asked from PowerShell)
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

// ids of the processes listening on a port (from netstat)
function listeningPids(port) {
  const pids = new Set();
  run('netstat', ['-ano']).split(/\r?\n/).forEach((line) => {
    const m = /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/.exec(line);
    if (m && Number(m[1]) === port) pids.add(Number(m[2]));
  });
  return pids;
}

// true when nothing listens on the port
function isFree(port) {
  return listeningPids(port).size === 0;
}

// snapshot of the running processes, looked up by id
const processes = listProcesses();
const byPid = new Map(processes.map((p) => [p.pid, p]));

// Never touch ourselves, or the npm/shell chain that launched this script.
const protectedPids = new Set();
for (let p = byPid.get(process.pid); p; p = byPid.get(p.ppid)) {
  if (protectedPids.has(p.pid)) break;
  protectedPids.add(p.pid);
}

// this project's node_modules path - tells our own processes from others
const projectNeedle = path.join(REPO_ROOT, role.dir, 'node_modules').toLowerCase();

// is this process one of this project's servers of the chosen kind?
function belongsToRole(proc) {
  const cmd = proc.cmd.toLowerCase();
  if (!proc.name.startsWith('node')) return false;
  if (!role.match.test(proc.cmd)) return false;
  if (role.not && role.not.test(proc.cmd)) return false;
  if (role.only && !role.only.test(proc.cmd)) return false;
  return cmd.includes(projectNeedle) || /src[\\/]server\.js/i.test(proc.cmd);
}

// launcher programs (npm, nodemon, cmd) that wrap the real server
const WRAPPER = /nodemon|npm-cli|npx-cli|vite|cmd(\.exe)?["\s]+\/d\s+\/s\s+\/c/i;

// climb to the outermost launcher, so the whole group is stopped
function topWrapper(proc) {
  let top = proc;
  for (let p = byPid.get(proc.ppid); p; p = byPid.get(p.ppid)) {
    const isWrapper = (p.name === 'node.exe' || p.name === 'cmd.exe') && WRAPPER.test(p.cmd);
    if (!isWrapper || protectedPids.has(p.pid)) break;
    top = p;
  }
  return top;
}

// foreign = other programs using the port, victims = our own old servers
const foreign = [];
const victims = new Set();

// who is using the port? ours get stopped, anything else is reported
for (const pid of listeningPids(role.port)) {
  const proc = byPid.get(pid);
  if (!proc || protectedPids.has(pid)) continue;
  if (belongsToRole(proc)) victims.add(proc.pid);
  else foreign.push(proc);
}

// also stop leftover copies of ours that are not listening yet
processes.filter((p) => !protectedPids.has(p.pid) && belongsToRole(p)).forEach((p) => victims.add(p.pid));

// another program owns the port - leave it alone and tell the user
if (foreign.length > 0) {
  const who = foreign.map((p) => `${p.name} (PID ${p.pid})`).join(', ');
  console.error(
    `[free-port] Port ${role.port} is used by ${who}, which is not part of this project. ` +
      'Close that program (or change the port) and try again.'
  );
  process.exit(1);
}

// stop the outermost launcher of each old server
const roots = new Set();
victims.forEach((pid) => {
  const proc = byPid.get(pid);
  if (proc) roots.add(topWrapper(proc).pid);
});

// kill the whole process tree
roots.forEach((pid) => {
  try {
    run('taskkill', ['/PID', String(pid), '/T', '/F']);
  } catch (error) {
    // already gone
  }
});

// wait up to 8 seconds for the port to free up
const deadline = Date.now() + 8000;
while (!isFree(role.port) && Date.now() < deadline) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
}

if (!isFree(role.port)) {
  console.error(`[free-port] Port ${role.port} is still busy after stopping old copies.`);
  process.exit(1);
}

// report the result
console.log(
  roots.size > 0
    ? `[free-port] Stopped ${roots.size} stale ${process.argv[2]} process group(s); port ${role.port} is free.`
    : `[free-port] Port ${role.port} is free.`
);
