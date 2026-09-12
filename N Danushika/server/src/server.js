// Entry point: checks the database is reachable, then starts the server.
const config = require('../../../shared/server/src/config/env');
const { verifyDatabaseConnection } = require('../../../shared/server/src/config/db');
const app = require('./app');

async function start() {
  try {
    await verifyDatabaseConnection();
    // eslint-disable-next-line no-console
    console.log('[startup] Database connection verified.');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[startup] Could not connect to the database:', error.message);
    process.exit(1);
  }

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[startup] Brilliant Institute API listening on port ${config.port} (${config.env})`);
  });
}

start();
