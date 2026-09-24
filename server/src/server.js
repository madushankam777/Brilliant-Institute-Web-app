// Entry point: checks DB, then starts listening
const config = require('../../shared/server/src/config/env');
const { verifyDatabaseConnection } = require('../../shared/server/src/config/db');
const { startRolloverScheduler } = require('../../S Vithushan/server/src/modules/admin/yearlyRollover');
const app = require('./app');

async function start() {
  try {
    await verifyDatabaseConnection();
    // eslint-disable-next-line no-console
    console.log('[startup] Database connection verified.');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[startup] Could not connect to the database:', error.message);
    // eslint-disable-next-line no-console
    console.error(
      '[startup] Check that MySQL is running (Windows: services.msc -> MySQL80 -> Start) ' +
        'and that DB_USER / DB_PASSWORD in server/.env are correct.'
    );
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[startup] Brilliant Institute API listening on port ${config.port} (${config.env})`);
  });

  // checks once shortly after boot, then daily - see yearlyRollover.js
  startRolloverScheduler();

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      // eslint-disable-next-line no-console
      console.error(
        `[startup] Port ${config.port} is already in use - another copy of the server is running. ` +
          'Run "npm run dev" (it stops the old copy first) or close the other terminal.'
      );
      process.exit(1);
    }
    throw error;
  });
}

start();
