// runs heavy work (password checks, PDF building) on worker threads, so one slow job never makes everyone else wait
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');

const WORKER_FILE = path.join(__dirname, 'workerTask.js');
const MAX_WORKERS = Math.max(2, Math.min(4, os.availableParallelism() - 1));
// an unused worker is closed after a minute, to give its memory back
const IDLE_MS = 60 * 1000;

const idle = [];
const queue = [];
let running = 0;

function startJob(worker, job) {
  clearTimeout(worker.idleTimer);
  worker.job = job;
  worker.ref();
  try {
    worker.postMessage(job.task);
  } catch (error) {
    // the data could not be copied to the worker
    worker.job = null;
    job.reject(error);
    finishJob(worker);
  }
}

function finishJob(worker) {
  const next = queue.shift();
  if (next) {
    startJob(worker, next);
    return;
  }
  worker.unref();
  idle.push(worker);
  worker.idleTimer = setTimeout(() => worker.terminate(), IDLE_MS);
  worker.idleTimer.unref();
}

function createWorker() {
  const worker = new Worker(WORKER_FILE);
  running += 1;
  worker.on('message', ({ result, error }) => {
    const { job } = worker;
    worker.job = null;
    if (error) job.reject(new Error(error));
    // files come back as plain bytes - make them a Buffer again
    else job.resolve(result instanceof Uint8Array ? Buffer.from(result.buffer, result.byteOffset, result.byteLength) : result);
    finishJob(worker);
  });
  worker.on('error', (error) => {
    if (worker.job) worker.job.reject(error);
    worker.job = null;
  });
  worker.on('exit', () => {
    running -= 1;
    clearTimeout(worker.idleTimer);
    const index = idle.indexOf(worker);
    if (index >= 0) idle.splice(index, 1);
    if (worker.job) worker.job.reject(new Error('A background worker stopped unexpectedly.'));
    // queued work gets a fresh worker
    if (queue.length > 0 && running < MAX_WORKERS) startJob(createWorker(), queue.shift());
  });
  return worker;
}

// file: a module's full path, name: the function it exports, args: plain data
function runInWorker(file, name, args = []) {
  return new Promise((resolve, reject) => {
    const job = { task: { file, name, args }, resolve, reject };
    const worker = idle.pop() || (running < MAX_WORKERS ? createWorker() : null);
    if (worker) startJob(worker, job);
    else queue.push(job);
  });
}

module.exports = { runInWorker, MAX_WORKERS };
