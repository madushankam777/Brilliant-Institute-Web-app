// Payment business logic (transactions, receipts)
const { pool } = require('../../../../../shared/server/src/config/db');
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { recordAuditEvent } = require('../../../../../shared/server/src/utils/auditLogger');
const { toSafePayment } = require('../../../../../shared/server/src/utils/sanitize');
const { PAYMENT_STATUS } = require('./payment.constants');
const gateway = require('./paymentGateway');
const repository = require('./payment.repository');

// Marks a gateway timeout/network failure so it can be reported as "pending"
// instead of a generic error.
class GatewayUnavailableError extends Error {}

// A bank transfer needs at least a day for an Admin to actually verify it
// before the new month of classes starts, so it closes on the last day of
// each month and reopens automatically on the 1st.
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

// Committed on its own so the PENDING row survives even if the gateway
// call in finalizePendingPayment() fails.
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

// Bank transfer never touches the mock gateway - a real transfer takes
// time to clear and has to be reconciled by a person, so this just
// records the PENDING payment with the uploaded receipt and stops there.
// An Admin has to approve it (see approveBankTransferPayment) before the
// balance moves or a receipt number is issued.
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

  const payment = await repository.findPaymentById(paymentId);
  return { pending: true, payment: toSafePayment(payment) };
}

async function listPendingBankTransfers() {
  const rows = await repository.listPendingBankTransfers();
  return rows.map((row) => {
    const details =
      typeof row.payment_details === 'string' ? JSON.parse(row.payment_details) : row.payment_details;
    return {
      id: row.id,
      enrollmentId: row.enrollment_id,
      studentName: row.student_name,
      studentEmail: row.student_email,
      subject: row.subject,
      amount: Number(row.amount),
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

async function approveBankTransferPayment(adminUser, paymentId) {
  const outcome = await withTransaction(async (connection) => {
    const payment = await repository.findPaymentByIdForUpdate(paymentId, connection);
    if (!payment || payment.payment_method !== 'BANK_TRANSFER' || payment.status !== PAYMENT_STATUS.PENDING) {
      throw ApiError.badRequest('This payment is not a pending bank transfer.');
    }

    const enrollment = await repository.findEnrollmentByIdForUpdate(payment.enrollment_id, connection);
    const balanceAfter = Number(enrollment.balance) - Number(payment.amount);

    await repository.markPaymentSuccessful(
      payment.id,
      { gatewayTransactionId: `BANKXFER-${payment.id}`, balanceAfter },
      connection
    );
    await repository.updateEnrollmentBalance(payment.enrollment_id, balanceAfter, connection);

    const receiptNumber = buildReceiptNumber(payment.id);
    await repository.createReceipt(payment.id, receiptNumber, connection);

    return { subject: enrollment.subject, receiptNumber };
  });

  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'BANK_TRANSFER_APPROVED',
    entityType: 'payment',
    entityId: paymentId,
    details: { receiptNumber: outcome.receiptNumber },
  });

  const payment = await repository.findPaymentById(paymentId);
  return toSafePayment({
    ...payment,
    subject: outcome.subject,
    receipt_number: outcome.receiptNumber,
    receipt_issued_at: new Date().toISOString(),
  });
}

async function rejectBankTransferPayment(adminUser, paymentId) {
  await findPendingBankTransferOrThrow(paymentId);
  await repository.markPaymentFailed(paymentId, { gatewayTransactionId: null });

  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'BANK_TRANSFER_REJECTED',
    entityType: 'payment',
    entityId: paymentId,
  });

  const payment = await repository.findPaymentById(paymentId);
  return toSafePayment(payment);
}

// Only the paying student or an Admin can ever see a receipt image - it's
// personal banking correspondence, never served as a public static file
// (see profilePictureUpload vs. this in shared/server's upload middleware).
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

async function getMyPaymentHistory(studentUser) {
  const rows = await repository.listPaymentHistoryForStudent(studentUser.id);
  return rows.map(toSafePayment);
}

// --- Tutor payouts - a simple ledger of what an Admin has paid each
// Tutor. This is a record-keeping tool, not an automatic payroll run -
// the Admin decides the amount for each entry themselves.
async function payTutor(adminUser, { tutorId, amount, note, periodLabel }) {
  if (!(amount > 0)) {
    throw ApiError.badRequest('Payout amount must be greater than zero.');
  }
  const tutor = await repository.findActiveTutorById(tutorId);
  if (!tutor) {
    throw ApiError.badRequest('Please select a valid, active Tutor.');
  }

  const payoutId = await repository.createTutorPayout({
    tutorId,
    amount,
    note,
    periodLabel,
    paidBy: adminUser.id,
  });

  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'TUTOR_PAID',
    entityType: 'tutor_payout',
    entityId: payoutId,
    details: { tutorId, amount },
  });

  return { id: payoutId, tutorId, tutorName: tutor.full_name, amount, note, periodLabel };
}

async function listTutorPayouts() {
  const [payouts, totals] = await Promise.all([
    repository.listTutorPayouts(),
    repository.sumPayoutsByTutor(),
  ]);

  // Plain object keyed by tutorId - easiest shape for the client to look
  // up "how much has this Tutor been paid in total" per row.
  const totalsByTutor = {};
  totals.forEach((row) => {
    totalsByTutor[row.tutor_id] = Number(row.total_paid);
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
    })),
    totalsByTutor,
  };
}

module.exports = {
  getMyBalances,
  makePayment,
  retryPendingPayment,
  getBankTransferAvailability,
  submitBankTransferPayment,
  listPendingBankTransfers,
  approveBankTransferPayment,
  rejectBankTransferPayment,
  getReceiptImagePath,
  getMyPaymentHistory,
  payTutor,
  listTutorPayouts,
};
