// sends email - real SMTP when set in .env, else a free Ethereal test inbox (dev only)
const nodemailer = require('nodemailer');
const config = require('../config/env');

let mailerPromise = null;

async function createMailer() {
  if (config.mail.host) {
    const transport = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
    });
    return { transport, isTestInbox: false };
  }
  if (config.isProduction) return null;

  // dev without SMTP - Ethereal catches the email and gives a link to view it
  const account = await nodemailer.createTestAccount();
  const transport = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: { user: account.user, pass: account.pass },
  });
  return { transport, isTestInbox: true };
}

async function sendMail({ to, subject, text, html }) {
  if (!mailerPromise) {
    mailerPromise = createMailer().catch((error) => {
      mailerPromise = null;
      throw error;
    });
  }
  const mailer = await mailerPromise;
  if (!mailer) {
    throw new Error('Email is not set up - add SMTP_HOST, SMTP_USER and SMTP_PASS to server/.env');
  }
  const info = await mailer.transport.sendMail({ from: config.mail.from, to, subject, text, html });
  if (mailer.isTestInbox) {
    // eslint-disable-next-line no-console
    console.log(`[mail] test email to ${to} - view it here: ${nodemailer.getTestMessageUrl(info)}`);
  }
  return info;
}

module.exports = { sendMail };
