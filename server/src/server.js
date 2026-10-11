// Entry point: checks DB, then starts listening
const config = require('../../shared/server/src/config/env');
const { verifyDatabaseConnection } = require('../../shared/server/src/config/db');
const { reportPendingUpdates } = require('../../shared/server/src/utils/schemaFeatures');
const { checkMailer } = require('../../shared/server/src/utils/mailer');
const { startNotificationEmails } = require('../../shared/server/src/utils/notificationEmails');
const { warnAboutDemoPasswords } = require('./startup/demoPasswordCheck');
const { moveUploadsToDb } = require('./startup/moveUploadsToDb');
const { reportPayPalSetup } = require('./startup/paypalCheck');
const {
  startPaymentDeadlineScheduler,
} = require('../../C D Kumanan/server/src/modules/course/enrollmentPayments');
const { startRolloverScheduler } = require('../../S Vithushan/server/src/modules/admin/yearlyRollover');
const app = require('./app');

// start - connect to MySQL, open the port and run the start-up checks
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

  // open the port
  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[startup] Brilliant Institute API listening on port ${config.port} (${config.env})`);
  });

  // tells the developer (not the users) if sql/update_database.sql still needs running
  reportPendingUpdates().catch(() => {});
  warnAboutDemoPasswords().catch(() => {});
  reportPayPalSetup();
  checkMailer().catch(() => {});
  moveUploadsToDb().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[setup] Could not move old uploads into MySQL - the folder was kept:', error.message);
  });

  // checks once shortly after boot, then daily - see yearlyRollover.js
  startRolloverScheduler();
  // unpaid new enrolments - 2-day warning, then the place is released to the waiting list
  startPaymentDeadlineScheduler();
  // every bell notification is emailed to its person too
  startNotificationEmails();

  // port already in use - say so and stop
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

// run the server
start();
