// Paying tutors - bank transfer, bank file or payout API
const config = require('../../../../../shared/server/src/config/env');

function isApiConfigured() {
  return config.payouts.provider === 'API' && Boolean(config.payouts.apiBaseUrl && config.payouts.apiKey);
}

function last4(accountNumber) {
  const digits = String(accountNumber || '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

// Sends one payout through the provider
async function sendTransfer({ payoutId, amount, bank, reference }) {
  if (!isApiConfigured()) {
    throw new Error('No payout provider is configured.');
  }

  const response = await fetch(`${config.payouts.apiBaseUrl.replace(/\/+$/, '')}/transfers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.payouts.apiKey}`,
      // the same payout can never be paid twice
      'Idempotency-Key': `payout-${payoutId}`,
    },
    body: JSON.stringify({
      amount: Number(amount).toFixed(2),
      currency: config.payouts.currency,
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
    throw new Error(body.message || `The payout provider rejected the transfer (HTTP ${response.status}).`);
  }
  return { reference: body.id || body.reference || null };
}

// Bulk-credit file columns (common SLIPS layout - change here if your bank differs)
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
  let text = String(value === null || value === undefined ? '' : value);
  // stop Excel running a cell as a formula
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) {
    text = `'${text}`;
  }
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Rows without an account number are left out and reported back.
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

  return { csv: `${lines.join('\r\n')}\r\n`, rowCount: rows.length, total, skipped };
}

module.exports = {
  isApiConfigured,
  last4,
  sendTransfer,
  buildBankTransferFile,
};
