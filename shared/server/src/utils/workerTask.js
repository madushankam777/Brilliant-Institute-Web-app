// worker thread for workerPool.js - runs one exported function at a time
const { parentPort } = require('worker_threads');

// do one job - load the file, call the function with the data, send back the result or the error
parentPort.on('message', async ({ file, name, args }) => {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const result = await require(file)[name](...args);
    parentPort.postMessage({ result });
  } catch (error) {
    parentPort.postMessage({ error: error.message });
  }
});
