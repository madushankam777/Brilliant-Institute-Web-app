// notification gateway - a mock that only prints to the server log (nothing is really sent)
const { randomUUID } = require('crypto');

// pretend to send a message and report it as delivered
async function sendNotification({ channel, message }) {
  // eslint-disable-next-line no-console
  console.log(`[mock-notification-gateway] (${channel}) ${message}`);
  return { delivered: true, providerMessageId: `mock-notify_${randomUUID()}` };
}

module.exports = { sendNotification };
