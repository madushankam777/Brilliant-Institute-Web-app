// Paying tutors out to real bank accounts.
// -----------------------------------------------------------------------
// Two different things are often confused, so to be explicit:
//
//   * PayHere (payhereGateway.js) COLLECTS money. It is a charge-only
//     gateway: it takes a card payment from a student and settles it into
//     the merchant's own registered bank account. It has no payout API, so
//     it cannot be used to send money out to a tutor.
//
//   * Sending money OUT needs either (a) a payout/disbursement provider the
//     institute holds an account with, or (b) the institute's own corporate
//     online banking, which is how almost every institute in Sri Lanka
//     actually pays staff: you upload one bulk-credit (SLIPS) file and the
//     bank credits every account in it.
//
// This adapter supports both.
//
//   PAYOUT_PROVIDER=BANK_FILE  (default)
//     Each payout is QUEUED with the destination account recorded, then
//     exported as a bank bulk-credit CSV. Admin uploads that file to their
//     corporate banking portal, and marks the batch settled once the bank
//     confirms it. The money movement is real; the instruction leaves this
//     system as a file rather than as an API call.
//
//   PAYOUT_PROVIDER=API
//     Needs PAYOUT_API_BASE_URL / PAYOUT_API_KEY from a payout provider the
//     institute has signed up with (and passed KYC for). Each payout is
//     sent straight to that provider and comes back SENT or FAILED.
//
// Until one of those is set up, nothing here can move real money, and the
// app says so rather than pretending a transfer happened.
// -----------------------------------------------------------------------
const config = require('../../../../../shared/server/src/config/env');

const PROVIDERS = Object.freeze({ BANK_FILE: 'BANK_FILE', API: 'API' });

function provider() {
  return config.payouts.provider === PROVIDERS.API ? PROVIDERS.API : PROVIDERS.BANK_FILE;
}

/** True only when payouts can be sent over an API without human steps. */
function isApiConfigured() {
  return provider() === PROVIDERS.API && Boolean(config.payouts.apiBaseUrl && config.payouts.apiKey);
}

/** True when the institute's own debit account is on file for the CSV. */
function isBankFileConfigured() {
  return Boolean(config.payouts.sourceAccountNumber && config.payouts.sourceBankName);
}

// What the Pay Tutors screen shows admin about how payouts will be sent.
function describe() {
  const mode = provider();
  if (mode === PROVIDERS.API) {
    return {
      provider: mode,
      ready: isApiConfigured(),
      label: config.payouts.providerName || 'Payout API',
      reason: isApiConfigured()
        ? 'Payouts are sent straight to the provider.'
        : 'PAYOUT_API_BASE_URL and PAYOUT_API_KEY are not set, so nothing can be sent yet.',
    };
  }
  return {
    provider: mode,
    ready: isBankFileConfigured(),
    label: 'Bank transfer file',
    reason: isBankFileConfigured()
      ? `Payouts are queued and exported as a bulk-credit file to upload to ${config.payouts.sourceBankName} online banking.`
      : 'Set PAYOUT_SOURCE_BANK_NAME and PAYOUT_SOURCE_ACCOUNT_NUMBER in server/.env - the account the money leaves from.',
  };
}

function last4(accountNumber) {
  const digits = String(accountNumber || '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/**
 * Sends one payout over the provider API. Only called when isApiConfigured().
 * Resolves { reference } on success and throws on failure, so the caller can
 * record SENT or FAILED honestly either way.
 */
async function sendTransfer({ payoutId, amount, currency, bank, reference }) {
  if (!isApiConfigured()) {
    throw new Error('No payout API is configured.');
  }

  const response = await fetch(`${config.payouts.apiBaseUrl.replace(/\/+$/, '')}/transfers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.payouts.apiKey}`,
      // Re-sending the same payout must never pay a tutor twice.
      'Idempotency-Key': `payout-${payoutId}`,
    },
    body: JSON.stringify({
      amount: Number(amount).toFixed(2),
      currency: currency || config.payouts.currency,
      reference,
      beneficiary: {
        name: bank.bank_account_holder,
        accountNumber: bank.bank_account_number,
        bankName: bank.bank_name,
        branch: bank.bank_branch,
      },
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || `Payout provider rejected the transfer (HTTP ${response.status}).`);
  }
  return { reference: body.id || body.reference || null };
}

// One row per tutor, in the layout banks accept for a bulk credit upload.
// Columns match the common SLIPS template; if your bank's template differs,
// this is the one place to change it.
const FILE_COLUMNS = [
  'Beneficiary Name',
  'Beneficiary Account Number',
  'Bank Name',
  'Branch',
  'Amount',
  'Reference',
  'Remarks',
];

function csvCell(value) {
  const text = String(value === null || value === undefined ? '' : value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Builds the bulk-credit file for a batch of queued payouts. Rows without a
 * usable account number are left out and returned separately, so admin sees
 * exactly who could not be included instead of the bank silently rejecting
 * the whole file.
 */
function buildBankTransferFile(payouts) {
  const rows = [];
  const skipped = [];

  payouts.forEach((payout) => {
    if (!payout.bank_account_number) {
      skipped.push({ id: payout.id, tutorName: payout.tutor_name, reason: 'No bank account on file.' });
      return;
    }
    rows.push([
      payout.bank_account_holder || payout.tutor_name,
      payout.bank_account_number,
      payout.bank_name || '',
      payout.bank_branch || '',
      Number(payout.amount).toFixed(2),
      `PAYOUT-${payout.id}`,
      payout.period_label || 'Tutor payout',
    ]);
  });

  const lines = [FILE_COLUMNS, ...rows].map((row) => row.map(csvCell).join(','));
  const total = rows.reduce((sum, row) => sum + Number(row[4]), 0);

  return {
    csv: `${lines.join('\r\n')}\r\n`,
    rowCount: rows.length,
    total,
    skipped,
    debitAccount: {
      bankName: config.payouts.sourceBankName,
      accountNumber: config.payouts.sourceAccountNumber,
      accountHolder: config.payouts.sourceAccountHolder,
    },
  };
}

module.exports = {
  PROVIDERS,
  provider,
  isApiConfigured,
  isBankFileConfigured,
  describe,
  sendTransfer,
  buildBankTransferFile,
  last4,
};
