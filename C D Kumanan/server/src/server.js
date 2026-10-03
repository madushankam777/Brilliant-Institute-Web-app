// Entry point: checks DB, then starts listening
const config = require('../../../shared/server/src/config/env');
const { verifyDatabaseConnection } = require('../../../shared/server/src/config/db');
const app = require('./app');

// start - check the database connection, then listen on the port
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

// run the server
start();
