// sends one test email - npm run mail:test -- someone@example.com
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const config = require('../../shared/server/src/config/env');
const { sendMail, checkMailer, closeMailer } = require('../../shared/server/src/utils/mailer');

// check the email set-up, then send one test email (to the given address, or the institute address)
async function main() {
  const to = process.argv[2] || config.institute.email;
  const ready = await checkMailer();
  if (!ready && config.isProduction) {
    process.exitCode = 1;
    return;
  }
  const sent = await sendMail({
    to,
    subject: 'Brilliant Institute - test email',
    text: `This is a test email from ${config.institute.email}. If you can read it, password reset codes will arrive too.`,
    html: `<p>This is a test email from <b>${config.institute.email}</b>.</p><p>If you can read it, password reset codes will arrive too.</p>`,
  });
  console.log(sent.skipped ? `Not sent - ${to} cannot receive email (demo or blocked address)` : `Test email sent to ${to}`);
}

// run it - show the error if sending fails
main()
  .catch((error) => {
    console.error('Could not send the test email:', error.message);
    process.exitCode = 1;
  })
  .finally(closeMailer);
