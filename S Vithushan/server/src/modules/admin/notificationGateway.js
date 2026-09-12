const { randomUUID } = require('crypto');

async function sendNotification({ channel, message }) {
  // eslint-disable-next-line no-console
  console.log(`[mock-notification-gateway] (${channel}) ${message}`);
  return { delivered: true, providerMessageId: `mock-notify_${randomUUID()}` };
}

module.exports = { sendNotification };
