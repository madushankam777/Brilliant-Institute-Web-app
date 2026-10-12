
const config = require('../../../shared/server/src/config/env');
const { verifyDatabaseConnection } = require('../../../shared/server/src/config/db');
const app = require('./app');


async function start() {
  try {
    await verifyDatabaseConnection();
    
    console.log('[startup] Database connection verified.');
  } catch (error) {
    
    console.error('[startup] Could not connect to the database:', error.message);
    process.exit(1);
  }

  app.listen(config.port, () => {

    console.log(`[startup] Brilliant Institute API listening on port ${config.port} (${config.env})`);
  });
}


start();
