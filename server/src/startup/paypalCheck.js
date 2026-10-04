// start-up note about PayPal - printed in the server window, never on the website
const config = require('../../../shared/server/src/config/env');

// tells the developer whether PayPal checkout is switched on
function reportPayPalSetup() {
  if (!config.paypal.isConfigured) {
    // eslint-disable-next-line no-console
    console.log(
      '[setup] PayPal checkout is off. Put PAYPAL_CLIENT_ID and PAYPAL_SECRET in server/.env ' +
        '(developer.paypal.com -> Apps & Credentials -> Sandbox -> Default Application), then restart.'
    );
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    `[startup] PayPal checkout is on (${config.paypal.mode}). Fees are charged in ` +
      `${config.paypal.currency} at LKR ${config.paypal.lkrPerUnit} per unit, and PayPal returns the payer to ${config.paypal.publicBaseUrl}.`
  );

  // a live key with a localhost address would send real payers nowhere
  if (config.paypal.mode === 'live' && config.paypal.publicBaseUrl.includes('localhost')) {
    // eslint-disable-next-line no-console
    console.warn('[setup] PayPal is in live mode but the return address is localhost. Set PUBLIC_BASE_URL.');
  }
}

module.exports = { reportPayPalSetup };
