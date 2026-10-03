// sends one test email - npm run mail:test -- someone@example.com
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const config = require('../../shared/server/src/config/env');
const { sendMail, checkMailer } = require('../../shared/server/src/utils/mailer');

async function main() {
  const to = process.argv[2] || config.institute.email;
  const ready = await checkMailer();
  if (!ready && config.isProduction) {
    process.exitCode = 1;
    return;
  }
  await sendMail({
    to,
    subject: 'Brilliant Institute - test email',
    text: `This is a test email from ${config.institute.email}. If you can read it, password reset codes will arrive too.`,
    html: `<p>This is a test email from <b>${config.institute.email}</b>.</p><p>If you can read it, password reset codes will arrive too.</p>`,
  });
  console.log(`Test email sent to ${to}`);
}

main().catch((error) => {
  console.error('Could not send the test email:', error.message);
  process.exitCode = 1;
});
