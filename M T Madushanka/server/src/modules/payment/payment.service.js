// Payment business logic (transactions, receipts)
const { pool } = require('../../../../../shared/server/src/config/db');
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { recordAuditEvent } = require('../../../../../shared/server/src/utils/auditLogger');
const { toSafePayment } = require('../../../../../shared/server/src/utils/sanitize');
const { PAYMENT_STATUS } = require('./payment.constants');
const gateway = require('./paymentGateway');
const payhere = require('./payhereGateway');
const repository = require('./payment.repository');
const payoutGateway = require('./payoutGateway');
const schema = require('../../../../../shared/server/src/utils/schemaFeatures');
const config = require('../../../../../shared/server/src/config/env');

// gateway timeout error
class GatewayUnavailableError extends Error {}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

// 25000 -> "LKR 25,000.00"
function formatLkr(amount) {
  return `LKR ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseDetails(details) {
  if (!details) return {};
  return typeof details === 'string' ? JSON.parse(details) : details;
}

function todayDateString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// bank transfer closes on the last day of each month
function lastDayOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function isBankTransferWindowOpen(date = new Date()) {
  return date.getDate() !== lastDayOfMonth(date);
}

function getBankTransferAvailability() {
  const now = new Date();
  const available = isBankTransferWindowOpen(now);
  return {
    available,
    message: available
      ? null
      : 'Bank transfer is closed today - it always closes on the last day of the month so an ' +
        'Administrator has time to verify it before the new month starts. It reopens tomorrow, ' +
        'or choose another payment method now.',
  };
}

async function getMyBalances(studentUser) {
  const rows = await repository.listBalancesForStudent(studentUser.id);
  return rows.map((row) => ({
    enrollmentId: row.enrollment_id,
    classId: row.class_id,
    subject: row.subject,
    tutorName: row.tutor_name,
    balance: Number(row.balance),
  }));
}

function buildReceiptNumber(paymentId) {
  const year = new Date().getFullYear();
  const paddedId = String(paymentId).padStart(6, '0');
  return `RCPT-${year}-${paddedId}`;
}

function buildStoredPaymentDetails(paymentMethod, rawDetails = {}) {
  if (paymentMethod === 'CARD') {
    return {
      method: 'CARD',
      cardholderName: String(rawDetails.cardholderName || '').slice(0, 100),
      cardBrand: String(rawDetails.cardBrand || 'Card').slice(0, 20),
      cardLast4: String(rawDetails.cardLast4 || '').slice(0, 4),
    };
  }
  if (paymentMethod === 'EZ_CASH' || paymentMethod === 'MCASH') {
    return {
      method: paymentMethod,
      walletPhone: String(rawDetails.walletPhone || '').slice(0, 20),
    };
  }
  if (paymentMethod === 'BANK_TRANSFER') {
    return {
      method: 'BANK_TRANSFER',
      bankReference: String(rawDetails.bankReference || '').slice(0, 40),
      receiptImagePath: rawDetails.receiptImagePath || null,
    };
  }
  return { method: paymentMethod };
}

async function withTransaction(work) {
  const connection = await pool.getConnection();
  let transactionOpen = false;
  try {
    await connection.beginTransaction();
    transactionOpen = true;
    const result = await work(connection);
    await connection.commit();
    transactionOpen = false;
    return result;
  } catch (error) {
    if (transactionOpen) {
      await connection.rollback();
    }
    throw error;
  } finally {
    connection.release();
  }
}

// save payment as pending first
async function createPendingPaymentRecord(
  studentUser,
  { enrollmentId, amount, paymentMethod, paymentDetails }
) {
  if (!(amount > 0)) {
    throw ApiError.badRequest('Payment amount must be greater than zero.');
  }

  const safeDetails = buildStoredPaymentDetails(paymentMethod, paymentDetails);

  return withTransaction(async (connection) => {
    const enrollment = await repository.findEnrollmentByIdForUpdate(enrollmentId, connection);
    if (!enrollment || enrollment.status !== 'ACTIVE') {
      throw ApiError.notFound('Enrollment not found.');
    }
    if (enrollment.student_id !== studentUser.id) {
      throw ApiError.forbidden('You can only pay fees for your own enrollments.');
    }
    if (amount > Number(enrollment.balance)) {
      throw ApiError.badRequest('Payment amount cannot exceed the outstanding balance.');
    }

    const balanceBefore = Number(enrollment.balance);
    const paymentId = await repository.createPendingPayment(
      { studentId: studentUser.id, enrollmentId, amount, balanceBefore, paymentMethod, paymentDetails: safeDetails },
      connection
    );

    return paymentId;
  });
}

async function finalizePendingPayment(studentUser, paymentId) {
  try {
    return await withTransaction(async (connection) => {
      const payment = await repository.findPaymentByIdForUpdate(paymentId, connection);
      if (!payment) {
        throw ApiError.notFound('Payment not found.');
      }
      if (payment.student_id !== studentUser.id) {
        throw ApiError.forbidden('You can only manage your own payments.');
      }
      if (payment.status !== PAYMENT_STATUS.PENDING) {
        throw ApiError.badRequest('Only a pending payment can be processed or retried.');
      }
      if (payment.payment_method === 'BANK_TRANSFER') {
        throw ApiError.badRequest(
          'Bank transfers are reviewed by an Administrator, not retried through the gateway.'
        );
      }

      const enrollment = await repository.findEnrollmentByIdForUpdate(
        payment.enrollment_id,
        connection
      );

      let gatewayResult;
      try {
        gatewayResult = await gateway.chargePaymentToken({ amount: Number(payment.amount) });
      } catch (gatewayError) {
        throw new GatewayUnavailableError(gatewayError.message);
      }

      if (!gatewayResult.approved) {
        await repository.markPaymentFailed(
          payment.id,
          { gatewayTransactionId: gatewayResult.gatewayTransactionId },
          connection
        );
        // Returned, not thrown, so this commit isn't rolled back.
        return { declinedReason: gatewayResult.reason, subject: enrollment.subject };
      }

      const balanceAfter = Number(enrollment.balance) - Number(payment.amount);
      await repository.markPaymentSuccessful(
        payment.id,
        { gatewayTransactionId: gatewayResult.gatewayTransactionId, balanceAfter },
        connection
      );
      await repository.updateEnrollmentBalance(payment.enrollment_id, balanceAfter, connection);

      const receiptNumber = buildReceiptNumber(payment.id);
      await repository.createReceipt(payment.id, receiptNumber, connection);

      return { receiptNumber, subject: enrollment.subject };
    }).then(async (outcome) => {
      if (outcome.declinedReason) {
        await recordAuditEvent({
          actorId: studentUser.id,
          action: 'PAYMENT_FAILED',
          entityType: 'payment',
          entityId: paymentId,
          details: { reason: outcome.declinedReason },
        });
        throw ApiError.badRequest(
          outcome.declinedReason || 'The payment gateway declined this payment. Please try again.'
        );
      }

      await recordAuditEvent({
        actorId: studentUser.id,
        action: 'PAYMENT_SUCCESSFUL',
        entityType: 'payment',
        entityId: paymentId,
        details: { receiptNumber: outcome.receiptNumber },
      });

      const payment = await repository.findPaymentById(paymentId);
      return {
        pending: false,
        payment: toSafePayment({
          ...payment,
          subject: outcome.subject,
          receipt_number: outcome.receiptNumber,
          receipt_issued_at: new Date().toISOString(),
        }),
      };
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (!(error instanceof GatewayUnavailableError)) {
      throw error;
    }

    await recordAuditEvent({
      actorId: studentUser.id,
      action: 'PAYMENT_GATEWAY_ERROR',
      entityType: 'payment',
      entityId: paymentId,
      details: { message: error.message },
    });

    const pendingPayment = await repository.findPaymentById(paymentId);
    return {
      pending: true,
      payment: toSafePayment(pendingPayment),
    };
  }
}

async function makePayment(studentUser, { enrollmentId, amount, paymentMethod, paymentDetails }) {
  const paymentId = await createPendingPaymentRecord(studentUser, {
    enrollmentId,
    amount,
    paymentMethod,
    paymentDetails,
  });
  return finalizePendingPayment(studentUser, paymentId);
}

async function retryPendingPayment(studentUser, paymentId) {
  return finalizePendingPayment(studentUser, paymentId);
}

// bank transfer form - saves receipt, waits for admin approval
async function submitBankTransferPayment(
  studentUser,
  { enrollmentId, amount, bankReference, receiptImagePath }
) {
  const { available, message } = getBankTransferAvailability();
  if (!available) {
    throw ApiError.badRequest(message);
  }

  const paymentId = await createPendingPaymentRecord(studentUser, {
    enrollmentId,
    amount,
    paymentMethod: 'BANK_TRANSFER',
    paymentDetails: { bankReference, receiptImagePath },
  });

  await recordAuditEvent({
    actorId: studentUser.id,
    action: 'BANK_TRANSFER_SUBMITTED',
    entityType: 'payment',
    entityId: paymentId,
  });

  // let Admin know there's something to review, instead of them having to
  // remember to check Payment Verification on their own
  const adminIds = await repository.findActiveAdminIds();
  await Promise.all(
    adminIds.map((adminId) =>
      repository.createNotification({
        recipientId: adminId,
        type: 'PAYMENT_SUBMITTED',
        message: `${studentUser.email} submitted a bank transfer of LKR ${Number(amount).toFixed(2)} - awaiting your verification.`,
        sentBy: studentUser.id,
      })
    )
  );

  const payment = await repository.findPaymentById(paymentId);
  return { pending: true, payment: toSafePayment(payment) };
}

// edit btn - correct a pending bank transfer's reference/receipt before review
async function editBankTransferPayment(studentUser, paymentId, { bankReference, receiptImagePath }) {
  const payment = await repository.findPaymentById(paymentId);
  if (!payment || payment.payment_method !== 'BANK_TRANSFER') {
    throw ApiError.notFound('Bank transfer payment not found.');
  }
  if (payment.student_id !== studentUser.id) {
    throw ApiError.forbidden('You can only edit your own bank transfer submissions.');
  }
  if (payment.status !== PAYMENT_STATUS.PENDING) {
    throw ApiError.badRequest('This payment has already been reviewed and can no longer be edited.');
  }

  const existingDetails =
    typeof payment.payment_details === 'string'
      ? JSON.parse(payment.payment_details)
      : payment.payment_details || {};

  const updatedDetails = {
    method: 'BANK_TRANSFER',
    bankReference: bankReference ? String(bankReference).slice(0, 40) : existingDetails.bankReference,
    receiptImagePath: receiptImagePath || existingDetails.receiptImagePath,
  };

  await repository.updatePaymentDetails(paymentId, updatedDetails);

  await recordAuditEvent({
    actorId: studentUser.id,
    action: 'BANK_TRANSFER_EDITED',
    entityType: 'payment',
    entityId: paymentId,
  });

  const updated = await repository.findPaymentById(paymentId);
  return toSafePayment(updated);
}

async function listPendingBankTransfers() {
  const rows = await repository.listPendingBankTransfers();
  return rows.map((row) => {
    const details = parseDetails(row.payment_details);
    return {
      id: row.id,
      enrollmentId: row.enrollment_id,
      studentName: row.student_name,
      studentEmail: row.student_email,
      subject: row.subject,
      amount: Number(row.amount),
      outstandingBalance: Number(row.current_balance),
      bankReference: details.bankReference,
      hasReceiptImage: Boolean(details.receiptImagePath),
      createdAt: row.created_at,
    };
  });
}

async function findPendingBankTransferOrThrow(paymentId) {
  const payment = await repository.findPaymentById(paymentId);
  if (!payment || payment.payment_method !== 'BANK_TRANSFER') {
    throw ApiError.notFound('Bank transfer payment not found.');
  }
  if (payment.status !== PAYMENT_STATUS.PENDING) {
    throw ApiError.badRequest('This payment has already been reviewed.');
  }
  return payment;
}

// Admin checks the slip and enters the amount actually received. That amount
// (not the one the student typed) moves the balance and counts as revenue.
async function approveBankTransferPayment(adminUser, paymentId, { amount } = {}) {
  const outcome = await withTransaction(async (connection) => {
    const payment = await repository.findPaymentByIdForUpdate(paymentId, connection);
    if (!payment || payment.payment_method !== 'BANK_TRANSFER' || payment.status !== PAYMENT_STATUS.PENDING) {
      throw ApiError.badRequest('This payment is not a pending bank transfer.');
    }

    const enrollment = await repository.findEnrollmentByIdForUpdate(payment.enrollment_id, connection);
    const claimedAmount = Number(payment.amount);
    const hasAmount = amount !== undefined && amount !== null && amount !== '';
    const receivedAmount = roundMoney(hasAmount ? Number(amount) : claimedAmount);
    const balanceBefore = Number(enrollment.balance);

    if (!(receivedAmount > 0)) {
      throw ApiError.badRequest('Enter the amount shown on the bank slip.');
    }
    if (receivedAmount > balanceBefore) {
      throw ApiError.badRequest(
        `The amount cannot be more than the outstanding balance of ${formatLkr(balanceBefore)}.`
      );
    }

    const balanceAfter = roundMoney(balanceBefore - receivedAmount);
    await repository.approveBankTransfer(
      payment.id,
      {
        amount: receivedAmount,
        balanceBefore,
        balanceAfter,
        gatewayTransactionId: `BANKXFER-${payment.id}`,
        paymentDetails: { ...parseDetails(payment.payment_details), claimedAmount, receivedAmount },
      },
      connection
    );
    await repository.updateEnrollmentBalance(payment.enrollment_id, balanceAfter, connection);

    const receiptNumber = buildReceiptNumber(payment.id);
    await repository.createReceipt(payment.id, receiptNumber, connection);

    return { subject: enrollment.subject, receiptNumber, claimedAmount, receivedAmount };
  });

  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'BANK_TRANSFER_APPROVED',
    entityType: 'payment',
    entityId: paymentId,
    details: {
      receiptNumber: outcome.receiptNumber,
      claimedAmount: outcome.claimedAmount,
      receivedAmount: outcome.receivedAmount,
    },
  });

  const payment = await repository.findPaymentById(paymentId);
  const message =
    outcome.receivedAmount === outcome.claimedAmount
      ? `Your bank transfer of ${formatLkr(outcome.receivedAmount)} for ${outcome.subject} was approved.`
      : `Your bank transfer for ${outcome.subject} was approved for ${formatLkr(outcome.receivedAmount)} ` +
        `(you entered ${formatLkr(outcome.claimedAmount)}).`;

  await repository.createNotification({
    recipientId: payment.student_id,
    type: 'PAYMENT_APPROVED',
    message: `${message} Receipt: ${outcome.receiptNumber}.`,
    sentBy: adminUser.id,
  });

  return toSafePayment({
    ...payment,
    subject: outcome.subject,
    receipt_number: outcome.receiptNumber,
    receipt_issued_at: new Date().toISOString(),
  });
}

async function rejectBankTransferPayment(adminUser, paymentId) {
  const pendingPayment = await findPendingBankTransferOrThrow(paymentId);
  await repository.markPaymentFailed(paymentId, { gatewayTransactionId: null });

  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'BANK_TRANSFER_REJECTED',
    entityType: 'payment',
    entityId: paymentId,
  });

  const enrollment = await repository.findEnrollmentById(pendingPayment.enrollment_id);
  await repository.createNotification({
    recipientId: pendingPayment.student_id,
    type: 'PAYMENT_REJECTED',
    message: `Your bank transfer of LKR ${Number(pendingPayment.amount).toFixed(2)} for ${enrollment ? enrollment.subject : 'your class'} was rejected. Please check your reference and receipt, then resubmit.`,
    sentBy: adminUser.id,
  });

  const payment = await repository.findPaymentById(paymentId);
  return toSafePayment(payment);
}

// only the student or admin can view the receipt image
async function getReceiptImagePath(requestingUser, paymentId) {
  const payment = await repository.findPaymentById(paymentId);
  if (!payment || payment.payment_method !== 'BANK_TRANSFER') {
    throw ApiError.notFound('Receipt image not found.');
  }
  if (requestingUser.role !== 'ADMIN' && payment.student_id !== requestingUser.id) {
    throw ApiError.forbidden();
  }
  const details =
    typeof payment.payment_details === 'string'
      ? JSON.parse(payment.payment_details)
      : payment.payment_details;
  if (!details || !details.receiptImagePath) {
    throw ApiError.notFound('Receipt image not found.');
  }
  return details.receiptImagePath;
}

// admin dashboard - a real ledger of individual payments (any method,
// any status), not just the lump revenue total
async function listRecentPayments() {
  const rows = await repository.listRecentPayments(20);
  return rows.map((row) => ({
    id: row.id,
    studentName: row.student_name,
    subject: row.subject,
    amount: Number(row.amount),
    status: row.status,
    paymentMethod: row.payment_method,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  }));
}

async function getMyPaymentHistory(studentUser) {
  const rows = await repository.listPaymentHistoryForStudent(studentUser.id);
  return rows.map(toSafePayment);
}

// Never send a Tutor's real account number to anyone but themselves - Admin
// only needs enough to confirm it's the right account, not the full number.
function maskAccountNumber(accountNumber) {
  const digits = String(accountNumber || '').trim();
  if (!digits) return null;
  if (digits.length <= 4) return digits;
  return `•••• ${digits.slice(-4)}`;
}

// checkout tabs - the institute's own receiving details (Bank Transfer callout,
// and where eZ Cash/mCash payments should be confirmed to). Any logged-in
// role can read this; only Admin can change it.
async function getPaymentSettings() {
  const row = await repository.getPaymentSettings();
  return {
    bankName: row ? row.bank_name : null,
    bankAccountName: row ? row.bank_account_name : null,
    bankAccountNumber: row ? row.bank_account_number : null,
    bankBranch: row ? row.bank_branch : null,
    bankSwift: row ? row.bank_swift : null,
    ezCashNumber: row ? row.ez_cash_number : null,
    mcashNumber: row ? row.mcash_number : null,
    // Tells the checkout screen whether to send people to the real gateway
    // or fall back to the built-in simulator.
    onlinePaymentsEnabled: payhere.isConfigured(),
    onlinePaymentProvider: payhere.isConfigured() ? 'payhere' : null,
  };
}

async function updatePaymentSettings(adminUser, settings) {
  await repository.upsertPaymentSettings(settings, adminUser.id);
  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'PAYMENT_SETTINGS_UPDATED',
    entityType: 'payment_settings',
    entityId: 1,
  });
  return getPaymentSettings();
}

async function listActiveTutors() {
  const rows = await repository.listActiveTutors();
  return rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    profilePictureUrl: row.profile_picture_path,
    bankName: row.bank_name,
    bankAccountHolder: row.bank_account_holder,
    bankBranch: row.bank_branch,
    maskedAccountNumber: maskAccountNumber(row.bank_account_number),
    hasBankDetails: Boolean(row.bank_name || row.bank_account_number),
  }));
}

// tutor's own profile - the real, unmasked details, so they can verify what's on file
async function getMyBankDetails(tutorUser) {
  const row = await repository.findBankDetails(tutorUser.id);
  return {
    bankName: row ? row.bank_name : null,
    accountHolder: row ? row.bank_account_holder : null,
    accountNumber: row ? row.bank_account_number : null,
    branch: row ? row.bank_branch : null,
  };
}

async function updateMyBankDetails(tutorUser, { bankName, accountHolder, accountNumber, branch }) {
  await repository.updateBankDetails(tutorUser.id, { bankName, accountHolder, accountNumber, branch });
  await recordAuditEvent({
    actorId: tutorUser.id,
    action: 'TUTOR_BANK_DETAILS_UPDATED',
    entityType: 'user',
    entityId: tutorUser.id,
  });
  return getMyBankDetails(tutorUser);
}

// Admin filling in a tutor's payout account for them (e.g. the tutor gave
// it over the phone). Stored on the same fields the tutor edits themselves,
// so there is only ever one account on file per tutor.
async function updateTutorBankDetailsAsAdmin(adminUser, tutorId, { bankName, accountHolder, accountNumber, branch }) {
  const tutor = await repository.findActiveTutorById(tutorId);
  if (!tutor) {
    throw ApiError.badRequest('Please select a valid, active Tutor.');
  }

  await repository.updateBankDetails(tutorId, { bankName, accountHolder, accountNumber, branch });
  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'TUTOR_BANK_DETAILS_UPDATED_BY_ADMIN',
    entityType: 'user',
    entityId: tutorId,
  });

  await repository.createNotification({
    recipientId: tutorId,
    type: 'PAYOUT_RECORDED',
    message: 'An Admin updated the bank account your payouts are sent to. Check your profile if this was unexpected.',
    sentBy: adminUser.id,
  });

  const row = await repository.findBankDetails(tutorId);
  return {
    bankName: row ? row.bank_name : null,
    bankAccountHolder: row ? row.bank_account_holder : null,
    bankBranch: row ? row.bank_branch : null,
    maskedAccountNumber: maskAccountNumber(row ? row.bank_account_number : null),
    hasBankDetails: Boolean(row && (row.bank_name || row.bank_account_number)),
  };
}

// --- Tutor payouts ---------------------------------------------------------

const PAYOUT_METHODS = ['BANK_TRANSFER', 'BANK_FILE', 'PAYOUT_API'];

// What the Pay Tutors page can offer on this install.
async function getPayoutOptions() {
  const tracking = await schema.hasPayoutTracking();
  const settings = await repository.getPaymentSettings();
  return {
    bulkFileAvailable: tracking,
    apiAvailable: tracking && payoutGateway.isApiConfigured(),
    apiName: config.payouts.providerName || 'payout provider',
    // the institute's own account (Payment Settings) - where the money leaves from
    sourceAccount:
      settings && settings.bank_account_number
        ? {
            bankName: settings.bank_name,
            accountName: settings.bank_account_name,
            accountNumber: settings.bank_account_number,
            branch: settings.bank_branch,
          }
        : null,
  };
}

// Admin needs the full account number to make the transfer, so it is shown
// only on request and every look is written to the audit log.
async function getTutorPayoutAccount(adminUser, tutorId) {
  const tutor = await repository.findActiveTutorById(tutorId);
  if (!tutor) {
    throw ApiError.notFound('Tutor not found.');
  }
  const bank = await repository.findBankDetails(tutorId);

  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'TUTOR_BANK_DETAILS_VIEWED',
    entityType: 'user',
    entityId: tutorId,
  });

  return {
    bankName: bank ? bank.bank_name : null,
    accountHolder: bank ? bank.bank_account_holder : null,
    accountNumber: bank ? bank.bank_account_number : null,
    branch: bank ? bank.bank_branch : null,
  };
}

function payoutNotification({ method, amount, periodLabel, destination, reference }) {
  const what = `${formatLkr(amount)}${periodLabel ? ` (${periodLabel})` : ''}`;
  if (method === 'BANK_TRANSFER') {
    return `You have been paid ${what} to ${destination}. Bank reference: ${reference}.`;
  }
  if (method === 'PAYOUT_API') {
    return `${what} has been sent to ${destination}.`;
  }
  return `A payout of ${what} has been approved and will reach ${destination} with the next bank transfer.`;
}

// method: BANK_TRANSFER (already paid from the bank - needs the bank reference),
// BANK_FILE (queue for the bulk file) or PAYOUT_API (send through the provider).
async function payTutor(adminUser, { tutorId, amount, note, periodLabel, method, bankReference, transferDate }) {
  if (!(amount > 0)) {
    throw ApiError.badRequest('Payout amount must be greater than zero.');
  }
  const tutor = await repository.findActiveTutorById(tutorId);
  if (!tutor) {
    throw ApiError.badRequest('Please select a valid, active Tutor.');
  }

  const bank = await repository.findBankDetails(tutorId);
  if (!bank || !bank.bank_account_number) {
    throw ApiError.badRequest(
      `${tutor.full_name} has no bank account on file. Add their account details before paying them.`
    );
  }

  const tracking = await schema.hasPayoutTracking();
  // older clients send no method - they always queued the payout
  const payoutMethod = PAYOUT_METHODS.includes(method) ? method : 'BANK_FILE';

  if (payoutMethod === 'BANK_TRANSFER' && !bankReference) {
    throw ApiError.badRequest('Enter the reference number the bank gave for this transfer.');
  }
  if (payoutMethod === 'BANK_TRANSFER' && transferDate && transferDate > todayDateString()) {
    throw ApiError.badRequest('The transfer date cannot be in the future.');
  }
  if (payoutMethod === 'PAYOUT_API' && !(tracking && payoutGateway.isApiConfigured())) {
    throw ApiError.badRequest('Online payouts are not set up. Pay by bank transfer instead.');
  }

  const destination = `${bank.bank_name || 'bank account'} ${maskAccountNumber(bank.bank_account_number)}`;
  // null means "now"; an earlier date keeps the real transfer day
  const settledAt = payoutMethod === 'BANK_TRANSFER' && transferDate && transferDate !== todayDateString()
    ? `${transferDate} 00:00:00`
    : null;

  // before the database update there is no reference column, so it goes in the note
  const noteParts = [note && note.trim()];
  if (!tracking) {
    noteParts.push(payoutMethod === 'BANK_TRANSFER' ? `Ref ${bankReference}` : null, `to ${destination}`);
  }
  const fullNote = noteParts.filter(Boolean).join(' - ').slice(0, 255);

  const payoutId = await repository.createTutorPayout({
    tutorId,
    amount,
    note: fullNote,
    periodLabel,
    paidBy: adminUser.id,
    status: payoutMethod === 'BANK_TRANSFER' ? 'SENT' : 'QUEUED',
    method: payoutMethod,
    bankName: bank.bank_name,
    bankAccountHolder: bank.bank_account_holder,
    bankAccountLast4: payoutGateway.last4(bank.bank_account_number),
    bankBranch: bank.bank_branch,
    providerReference: payoutMethod === 'BANK_TRANSFER' ? bankReference : null,
    settledAt,
  });

  let status = tracking ? (payoutMethod === 'BANK_TRANSFER' ? 'SENT' : 'QUEUED') : 'RECORDED';
  let failureReason = null;

  if (payoutMethod === 'PAYOUT_API') {
    try {
      const { reference } = await payoutGateway.sendTransfer({
        payoutId,
        amount,
        bank,
        reference: `PAYOUT-${payoutId}`,
      });
      await repository.markPayoutSent(payoutId, reference);
      status = 'SENT';
    } catch (error) {
      failureReason = error.message;
      await repository.markPayoutFailed(payoutId, error.message);
      status = 'FAILED';
    }
  }

  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'TUTOR_PAID',
    entityType: 'tutor_payout',
    entityId: payoutId,
    details: { tutorId, amount, method: payoutMethod, outcome: status, bankReference: bankReference || null },
  });

  // never tell a tutor they were paid when the transfer failed
  if (status !== 'FAILED') {
    await repository.createNotification({
      recipientId: tutorId,
      type: 'PAYOUT_RECORDED',
      message: payoutNotification({ method: payoutMethod, amount, periodLabel, destination, reference: bankReference }),
      sentBy: adminUser.id,
    });
  }

  return {
    id: payoutId,
    tutorId,
    tutorName: tutor.full_name,
    amount,
    periodLabel,
    method: payoutMethod,
    status,
    failureReason,
  };
}

// --- Bulk bank file ------------------------------------------------------
// Queued payouts are exported as one bulk-credit file for corporate online
// banking. The bank moves the money; admin then marks each one paid.

async function getPayoutBatch() {
  const rows = await repository.listPayoutsAwaitingTransfer();
  return {
    count: rows.length,
    total: rows.reduce((sum, row) => sum + Number(row.amount), 0),
    payouts: rows.map((row) => ({
      id: row.id,
      tutorId: row.tutor_id,
      tutorName: row.tutor_name,
      amount: Number(row.amount),
      periodLabel: row.period_label,
      bankName: row.bank_name,
      accountLast4: payoutGateway.last4(row.bank_account_number),
      hasAccount: Boolean(row.bank_account_number),
      exportedAt: row.exported_at,
      paidAt: row.paid_at,
    })),
  };
}

async function exportPayoutFile(adminUser) {
  if (!(await schema.hasPayoutTracking())) throw schema.migrationRequired();

  const rows = await repository.listPayoutsAwaitingTransfer();
  if (rows.length === 0) {
    throw ApiError.badRequest('There are no payouts waiting to be transferred.');
  }

  const file = payoutGateway.buildBankTransferFile(rows);
  if (file.rowCount === 0) {
    throw ApiError.badRequest('None of the waiting payouts have a bank account on file.');
  }

  const includedIds = rows
    .filter((row) => row.bank_account_number)
    .map((row) => row.id);
  await repository.markPayoutsExported(includedIds);

  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'PAYOUT_FILE_EXPORTED',
    entityType: 'tutor_payout',
    entityId: null,
    details: { count: file.rowCount, total: file.total, payoutIds: includedIds },
  });

  return { ...file, filename: `tutor-payouts-${todayDateString()}.csv` };
}

// Admin confirms, from the bank's own confirmation, that a queued payout landed.
async function confirmPayoutSettled(adminUser, payoutId, { providerReference, transferDate }) {
  if (!(await schema.hasPayoutTracking())) throw schema.migrationRequired();
  const payout = await repository.findTutorPayoutById(payoutId);
  if (!payout) {
    throw ApiError.notFound('Payout not found.');
  }
  if (transferDate && transferDate > todayDateString()) {
    throw ApiError.badRequest('The transfer date cannot be in the future.');
  }

  const settledAt = transferDate && transferDate !== todayDateString() ? `${transferDate} 00:00:00` : null;
  const updated = await repository.markPayoutSent(payoutId, providerReference, settledAt);
  if (!updated) {
    throw ApiError.badRequest('Only a payout that is waiting or failed can be marked as paid.');
  }

  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'PAYOUT_SETTLED',
    entityType: 'tutor_payout',
    entityId: payoutId,
    details: { providerReference },
  });

  const destination = `${payout.bank_name || 'bank account'}${payout.bank_account_last4 ? ` •••• ${payout.bank_account_last4}` : ''}`;
  await repository.createNotification({
    recipientId: payout.tutor_id,
    type: 'PAYOUT_RECORDED',
    message: payoutNotification({
      method: 'BANK_TRANSFER',
      amount: payout.amount,
      periodLabel: payout.period_label,
      destination,
      reference: providerReference,
    }),
    sentBy: adminUser.id,
  });

  return { id: payoutId, status: 'SENT' };
}

async function markPayoutFailed(adminUser, payoutId, reason) {
  if (!(await schema.hasPayoutTracking())) throw schema.migrationRequired();
  const payout = await repository.findTutorPayoutById(payoutId);
  if (!payout) {
    throw ApiError.notFound('Payout not found.');
  }
  const updated = await repository.markPayoutFailed(payoutId, reason);
  if (!updated) {
    throw ApiError.badRequest('That payout cannot be marked as failed.');
  }

  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'PAYOUT_FAILED',
    entityType: 'tutor_payout',
    entityId: payoutId,
    details: { reason },
  });

  return { id: payoutId, status: 'FAILED' };
}

async function listTutorPayouts() {
  const [payouts, totals] = await Promise.all([
    repository.listTutorPayouts(),
    repository.sumPayoutsByTutor(),
  ]);

  const totalsByTutor = {};
  const summaryByTutor = {};
  totals.forEach((row) => {
    totalsByTutor[row.tutor_id] = Number(row.total_paid);
    summaryByTutor[row.tutor_id] = {
      totalPaid: Number(row.total_paid),
      paidThisMonth: Number(row.month_paid),
      lastPaidAt: row.last_paid_at,
    };
  });

  return {
    payouts: payouts.map((row) => ({
      id: row.id,
      tutorId: row.tutor_id,
      tutorName: row.tutor_name,
      amount: Number(row.amount),
      note: row.note,
      periodLabel: row.period_label,
      paidByName: row.paid_by_name,
      paidAt: row.paid_at,
      status: row.status || 'RECORDED',
      method: row.method,
      bankName: row.bank_name,
      accountLast4: row.bank_account_last4,
      providerReference: row.provider_reference,
      failureReason: row.failure_reason,
      exportedAt: row.exported_at,
      settledAt: row.settled_at,
    })),
    totalsByTutor,
    summaryByTutor,
  };
}

// =========================================================================
// PayHere - real online payments (card / eZ Cash / mCash)
// =========================================================================

/**
 * Step 1 of the online flow: reserve a PENDING payment row and hand back the
 * signed field set the browser posts to PayHere. Nothing about the money has
 * happened yet - the balance only moves when PayHere calls us back.
 */
async function startOnlineCheckout(studentUser, { enrollmentId, amount }) {
  if (!payhere.isConfigured()) {
    throw ApiError.badRequest(
      'Online card payments are not switched on yet. Please use Bank Transfer, or ask an Administrator to finish the PayHere setup.'
    );
  }

  // Reuses the same ownership / amount / balance checks as every other
  // payment path. 'ONLINE' because the payer picks the actual instrument
  // on PayHere's page - the notification tells us which one they used.
  const paymentId = await createPendingPaymentRecord(studentUser, {
    enrollmentId,
    amount,
    paymentMethod: 'ONLINE',
    paymentDetails: { provider: 'payhere' },
  });

  const enrollment = await repository.findEnrollmentById(enrollmentId);

  const checkout = payhere.buildCheckoutRequest({
    paymentId,
    amount,
    itemDescription: `Tuition fee - ${enrollment ? enrollment.subject : 'Brilliant Institute'}`,
    student: studentUser,
  });

  await recordAuditEvent({
    actorId: studentUser.id,
    action: 'PAYMENT_CHECKOUT_STARTED',
    entityType: 'payment',
    entityId: paymentId,
    details: { provider: 'payhere', amount },
  });

  return { paymentId, ...checkout };
}

/**
 * Step 2: PayHere's server-to-server notification. This is the ONLY place an
 * online payment becomes SUCCESSFUL - the payer's browser returning to our
 * site proves nothing and is never trusted.
 *
 * Safe to receive more than once: PayHere retries, so every branch here is
 * idempotent.
 */
async function handlePayHereNotification(body) {
  if (!payhere.isConfigured()) {
    return { handled: false, reason: 'PayHere is not configured.' };
  }

  const result = payhere.verifyNotification(body);
  if (!result.valid) {
    // Anyone can POST to this public URL - an unsigned request is simply
    // not from PayHere, so it must not touch a single row.
    return { handled: false, reason: 'Signature verification failed.' };
  }
  if (!result.paymentId) {
    return { handled: false, reason: 'Unrecognised order id.' };
  }

  const outcome = await withTransaction(async (connection) => {
    const payment = await repository.findPaymentByIdForUpdate(result.paymentId, connection);
    if (!payment) {
      return { status: 'unknown-payment' };
    }

    // Already settled by an earlier delivery of this same notification.
    if (payment.status === PAYMENT_STATUS.SUCCESSFUL) {
      return { status: 'already-successful' };
    }
    if (payment.status !== PAYMENT_STATUS.PENDING) {
      return { status: 'not-pending' };
    }

    // Never take the posted amount at face value - it decides how much
    // credit the student gets, so it has to match what we asked for.
    if (payhere.formatAmount(payment.amount) !== payhere.formatAmount(result.amount)) {
      return { status: 'amount-mismatch' };
    }

    const storedDetails = {
      method: result.mappedMethod,
      provider: 'payhere',
      providerPaymentId: result.providerPaymentId,
      providerMethod: result.providerMethod,
      cardholderName: result.cardHolderName,
      cardLast4: result.cardLast4,
    };

    if (result.statusCode !== payhere.STATUS.SUCCESS) {
      if (result.statusCode === payhere.STATUS.PENDING) {
        // e.g. an offline instrument still clearing - leave it PENDING and
        // wait for PayHere's follow-up notification.
        return { status: 'still-pending' };
      }
      await repository.markPaymentFailed(
        payment.id,
        { gatewayTransactionId: result.providerPaymentId },
        connection
      );
      await repository.updatePaymentMethodAndDetails(
        payment.id,
        { paymentMethod: result.mappedMethod, paymentDetails: storedDetails },
        connection
      );
      return { status: 'failed', studentId: payment.student_id, amount: Number(payment.amount) };
    }

    const enrollment = await repository.findEnrollmentByIdForUpdate(
      payment.enrollment_id,
      connection
    );
    const balanceAfter = Number(enrollment.balance) - Number(payment.amount);

    await repository.markPaymentSuccessful(
      payment.id,
      { gatewayTransactionId: result.providerPaymentId, balanceAfter },
      connection
    );
    await repository.updatePaymentMethodAndDetails(
      payment.id,
      { paymentMethod: result.mappedMethod, paymentDetails: storedDetails },
      connection
    );
    await repository.updateEnrollmentBalance(payment.enrollment_id, balanceAfter, connection);

    const receiptNumber = buildReceiptNumber(payment.id);
    await repository.createReceipt(payment.id, receiptNumber, connection);

    return {
      status: 'successful',
      studentId: payment.student_id,
      amount: Number(payment.amount),
      subject: enrollment.subject,
      receiptNumber,
    };
  });

  if (outcome.status === 'successful') {
    await recordAuditEvent({
      actorId: outcome.studentId,
      action: 'PAYMENT_SUCCESSFUL',
      entityType: 'payment',
      entityId: result.paymentId,
      details: { provider: 'payhere', receiptNumber: outcome.receiptNumber },
    });
    await repository.createNotification({
      recipientId: outcome.studentId,
      type: 'PAYMENT_APPROVED',
      message: `Your payment of LKR ${outcome.amount.toFixed(2)} for ${outcome.subject} was received. Receipt: ${outcome.receiptNumber}.`,
      sentBy: null,
    });
  } else if (outcome.status === 'failed') {
    await recordAuditEvent({
      actorId: outcome.studentId,
      action: 'PAYMENT_FAILED',
      entityType: 'payment',
      entityId: result.paymentId,
      details: { provider: 'payhere', reason: result.statusMessage || result.statusCode },
    });
  }

  return { handled: true, ...outcome };
}

/**
 * Polled by the return page after PayHere sends the payer back, since the
 * real result arrives on the webhook and may land a moment later.
 */
async function getMyPaymentStatus(studentUser, paymentId) {
  const payment = await repository.findPaymentWithDetailsById(paymentId);
  if (!payment) {
    throw ApiError.notFound('Payment not found.');
  }
  if (payment.student_id !== studentUser.id) {
    throw ApiError.forbidden('You can only view your own payments.');
  }
  return toSafePayment(payment);
}

module.exports = {
  getMyBalances,
  makePayment,
  retryPendingPayment,
  startOnlineCheckout,
  handlePayHereNotification,
  getMyPaymentStatus,
  getBankTransferAvailability,
  submitBankTransferPayment,
  editBankTransferPayment,
  listPendingBankTransfers,
  approveBankTransferPayment,
  rejectBankTransferPayment,
  getReceiptImagePath,
  getMyPaymentHistory,
  listRecentPayments,
  listActiveTutors,
  getMyBankDetails,
  updateMyBankDetails,
  updateTutorBankDetailsAsAdmin,
  getPaymentSettings,
  updatePaymentSettings,
  payTutor,
  listTutorPayouts,
  getPayoutOptions,
  getTutorPayoutAccount,
  getPayoutBatch,
  exportPayoutFile,
  confirmPayoutSettled,
  markPayoutFailed,
};
