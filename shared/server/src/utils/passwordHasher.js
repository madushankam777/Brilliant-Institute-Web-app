// password hashing (bcrypt) on worker threads - a login never makes other people wait
const bcrypt = require('bcryptjs');
const { runInWorker } = require('./workerPool');

// these two run inside the worker
function hashNow(password, rounds) {
  return bcrypt.hashSync(password, rounds);
}

function compareNow(password, hash) {
  return bcrypt.compareSync(password, hash);
}

const hashPassword = (password, rounds) => runInWorker(__filename, 'hashNow', [password, rounds]);
const comparePassword = (password, hash) => runInWorker(__filename, 'compareNow', [password, hash]);

module.exports = { hashPassword, comparePassword, hashNow, compareNow };
