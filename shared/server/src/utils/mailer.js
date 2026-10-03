// sends email - Resend (cloud), the institute Gmail account, or a free Ethereal test inbox (dev only)
const nodemailer = require('nodemailer');
const config = require('../config/env');

let mailerPromise = null;

// Gmail needs both the address and the app password
function isSmtpReady() {
  return Boolean(config.mail.host && config.mail.user && config.mail.pass);
}

// Resend - used when RESEND_API_KEY is set
async function sendWithResend({ to, subject, text, html }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.mail.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.mail.from, reply_to: config.institute.email, to, subject, text, html }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Resend refused the email (${body.message || `HTTP ${response.status}`})`);
  return body;
}

async function createMailer() {
  if (isSmtpReady()) {
    const transport = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: { user: config.mail.user, pass: config.mail.pass },
    });
    return { transport, isTestInbox: false };
  }
  if (config.isProduction) return null;

  // dev without Gmail - Ethereal catches the email and gives a link to view it
  const account = await nodemailer.createTestAccount();
  const transport = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: { user: account.user, pass: account.pass },
  });
  return { transport, isTestInbox: true };
}

function getMailer() {
  if (!mailerPromise) {
    mailerPromise = createMailer().catch((error) => {
      mailerPromise = null;
      throw error;
    });
  }
  return mailerPromise;
}

async function sendMail({ to, subject, text, html }) {
  if (config.mail.resendApiKey) return sendWithResend({ to, subject, text, html });
  const mailer = await getMailer();
  if (!mailer) {
    throw new Error('Email is not set up - add SMTP_USER and SMTP_PASS to server/.env');
  }
  const info = await mailer.transport.sendMail({
    from: config.mail.from,
    replyTo: config.institute.email,
    to,
    subject,
    text,
    html,
  });
  if (mailer.isTestInbox) {
    // eslint-disable-next-line no-console
    console.log(`[mail] test email to ${to} - view it here: ${nodemailer.getTestMessageUrl(info)}`);
  }
  return info;
}

// startup check - setup problems go to the server log, never to users
async function checkMailer() {
  if (config.mail.resendApiKey) {
    // eslint-disable-next-line no-console
    console.log(`[mail] Ready - emails are sent through Resend from ${config.mail.from}`);
    return true;
  }
  if (!isSmtpReady()) {
    // eslint-disable-next-line no-console
    console.warn(
      `[setup] Emails are not going out from ${config.institute.email} yet. Put the Gmail app password in ` +
        'server/.env as SMTP_PASS (Google Account -> Security -> 2-Step Verification -> App passwords).'
    );
    return false;
  }
  try {
    const mailer = await getMailer();
    await mailer.transport.verify();
    // eslint-disable-next-line no-console
    console.log(`[mail] Ready - emails are sent from ${config.mail.user}`);
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      `[setup] Gmail refused the login for ${config.mail.user} (${error.message}). ` +
        'SMTP_PASS must be a 16-letter Google app password, not the normal Gmail password.'
    );
    return false;
  }
}

module.exports = { sendMail, checkMailer, isSmtpReady };
