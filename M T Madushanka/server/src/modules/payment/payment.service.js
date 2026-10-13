// Payment business logic (transactions, receipts)
const { pool } = require('../../../../../shared/server/src/config/db');
const ApiError = require('../../../../../shared/server/src/utils/ApiError');
const { recordAuditEvent } = require('../../../../../shared/server/src/utils/auditLogger');
const { toSafePayment } = require('../../../../../shared/server/src/utils/sanitize');
const { PAYMENT_STATUS } = require('./payment.constants');
const gateway = require('./paymentGateway');
const payhere = require('./payhereGateway');
const paypal = require('./paypalGateway');
const repository = require('./payment.repository');
const { deleteUpload } = require('../../../../../shared/server/src/utils/fileStore');
const payoutGateway = require('./payoutGateway');
const schema = require('../../../../../shared/server/src/utils/schemaFeatures');
const config = require('../../../../../shared/server/src/config/env');

class GatewayUnavailableError extends Error {}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

const INSTANT_METHOD_NAMES = { CARD: 'card', EZ_CASH: 'eZ Cash', MCASH: 'mCash' };

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

function lastDayOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

// closed on the last day of the month
function isBankTransferWindowOpen(date = new Date()) {
  return date.getDate() !== lastDayOfMonth(date);
}

// open or closed, with a message
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

// balance per class
async function getMyBalances(studentUser) {
  const rows = await repository.listBalancesForStudent(studentUser.id);
  return rows.map((row) => ({
    enrollmentId: row.enrollment_id,
    classId: row.class_id,
    subject: row.subject,
    tutorName: row.tutor_name,
    balance: Number(row.balance),
    isPaid: row.payment_status === 'PAID' || Number(row.balance) <= 0,
    paymentDueAt: Number(row.balance) > 0 ? row.payment_due_at : null,
  }));
}

// receipt number RCPT-year-id
function buildReceiptNumber(paymentId) {
  const year = new Date().getFullYear();
  const paddedId = String(paymentId).padStart(6, '0');
  return `RCPT-${year}-${paddedId}`;
}

// keep safe details only
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

// BEGIN, then COMMIT or ROLLBACK
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

// save a PENDING payment
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

// charge a PENDING payment
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
        gatewayResult = await gateway.chargePaymentToken({
          amount: Number(payment.amount),
          paymentMethod: payment.payment_method,
          paymentDetails: payment.payment_details,
        });
      } catch (gatewayError) {
        throw new GatewayUnavailableError(gatewayError.message);
      }

      if (!gatewayResult.approved) {
        await repository.markPaymentFailed(
          payment.id,
          { gatewayTransactionId: gatewayResult.gatewayTransactionId },
          connection
        );
        return {
          declinedReason: gatewayResult.reason,
          subject: enrollment.subject,
          amount: Number(payment.amount),
          method: payment.payment_method,
        };
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

      return {
        receiptNumber,
        subject: enrollment.subject,
        amount: Number(payment.amount),
        method: payment.payment_method,
      };
    }).then(async (outcome) => {
      const methodName = INSTANT_METHOD_NAMES[outcome.method] || 'online';
      if (outcome.declinedReason) {
        await recordAuditEvent({
          actorId: studentUser.id,
          action: 'PAYMENT_FAILED',
          entityType: 'payment',
          entityId: paymentId,
          details: { reason: outcome.declinedReason },
        });
        await repository.createNotification({
          recipientId: studentUser.id,
          type: 'PAYMENT_DECLINED',
          message:
            `Your ${methodName} payment of ${formatLkr(outcome.amount)} for ${outcome.subject} was declined ` +
            `(${String(outcome.declinedReason || 'declined by the bank').replace(/\.$/, '')}). ` +
            'No money was taken - please try again or use another method.',
          link: `/payments/history?highlight=${paymentId}`,
          sentBy: null,
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
      await repository.createNotification({
        recipientId: studentUser.id,
        type: 'PAYMENT_APPROVED',
        message:
          `Your ${methodName} payment of ${formatLkr(outcome.amount)} for ${outcome.subject} was received. ` +
          `Receipt: ${outcome.receiptNumber}.`,
        link: `/payments/history?highlight=${paymentId}`,
        sentBy: null,
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

const PAYMENT_METHOD_KEYS = ['BANK_TRANSFER', 'CARD', 'EZ_CASH', 'MCASH', 'PAYPAL'];
const METHOD_NAMES = { BANK_TRANSFER: 'Bank transfer', CARD: 'Card', EZ_CASH: 'eZ Cash', MCASH: 'mCash', PAYPAL: 'PayPal' };

// methods that are switched on
async function loadEnabledMethods() {
  const saved = await repository.findEnabledMethods();
  if (!saved) return ['BANK_TRANSFER', 'PAYPAL'];
  return PAYMENT_METHOD_KEYS.filter((method) => saved.includes(method));
}

// what is still missing before a method can be used (null when it is ready)
function missingDetailFor(method, row, hasCardColumns) {
  const settings = row || {};
  if (method === 'BANK_TRANSFER' && !settings.bank_account_number) {
    return 'Add the bank account number under Bank transfer first.';
  }
  if (method === 'CARD') {
    // until the card columns exist, card payments settle into the main bank account
    if (!hasCardColumns) {
      return settings.bank_account_number ? null : 'Add the bank account number under Bank transfer first.';
    }
    if (!settings.card_account_number) return 'Add the card account number under Card first.';
  }
  if (method === 'EZ_CASH' && !settings.ez_cash_number) return 'Add the institute eZ Cash number first.';
  if (method === 'MCASH' && !settings.mcash_number) return 'Add the institute mCash number first.';
  if (method === 'PAYPAL' && !paypal.isConfigured()) return 'PayPal is not connected on this server.';
  return null;
}

// the saved details plus whether the card columns exist
async function loadMethodDetails() {
  const [row, hasCardColumns] = await Promise.all([repository.getPaymentSettings(), schema.hasCardAccount()]);
  return { row, hasCardColumns };
}

// checkout tabs - methods that are switched on and have their details
function checkoutMethodsFor(enabled, details) {
  const ready = enabled.filter((method) => !missingDetailFor(method, details.row, details.hasCardColumns));
  const online = ready.filter((method) => method !== 'BANK_TRANSFER' && method !== 'PAYPAL');
  const tabs = [];
  if (online.length > 0) {
    if (payhere.isConfigured()) tabs.push('ONLINE');
    else if (!config.isProduction && config.paymentGateway.providerName === 'mock-gateway') tabs.push(...online);
  }
  if (ready.includes('PAYPAL')) tabs.push('PAYPAL');
  if (ready.includes('BANK_TRANSFER')) tabs.push('BANK_TRANSFER');
  return tabs;
}

// refuse a method that is off
async function assertMethodAllowed(method) {
  const tabs = checkoutMethodsFor(await loadEnabledMethods(), await loadMethodDetails());
  if (!tabs.includes(method)) {
    throw ApiError.forbidden('This payment method is not available right now. Please choose another one.');
  }
}

// pay instantly
async function makePayment(studentUser, { enrollmentId, amount, paymentMethod, paymentDetails }) {
  await assertMethodAllowed(paymentMethod);
  const paymentId = await createPendingPaymentRecord(studentUser, {
    enrollmentId,
    amount,
    paymentMethod,
    paymentDetails,
  });
  return finalizePendingPayment(studentUser, paymentId);
}

// retry a pending payment
async function retryPendingPayment(studentUser, paymentId) {
  const pending = await repository.findPaymentById(paymentId);
  if (pending) await assertMethodAllowed(pending.payment_method);
  return finalizePendingPayment(studentUser, paymentId);
}

// save the slip as PENDING
async function submitBankTransferPayment(
  studentUser,
  { enrollmentId, amount, bankReference, receiptImagePath }
) {
  await assertMethodAllowed('BANK_TRANSFER');
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

  const [adminIds, studentName, enrollment] = await Promise.all([
    repository.findActiveAdminIds(),
    repository.findUserName(studentUser.id),
    repository.findEnrollmentById(enrollmentId),
  ]);
  const subject = enrollment ? enrollment.subject : 'a class';
  for (const adminId of adminIds) {
    await repository.createNotification({
      recipientId: adminId,
      type: 'PAYMENT_SUBMITTED',
      message:
        `${studentName || studentUser.email} submitted a bank transfer of ${formatLkr(amount)} for ${subject} ` +
        `(reference ${bankReference}) - awaiting your verification.`,
      link: `/admin/payments/verify?highlight=${paymentId}`,
      sentBy: studentUser.id,
    });
  }
  await repository.createNotification({
    recipientId: studentUser.id,
    type: 'SLIP_RECEIVED',
    message:
      `We received your bank slip for ${formatLkr(amount)} (${subject}, reference ${bankReference}). ` +
      'The office will check it and you will be told as soon as it is approved.',
    link: `/payments/history?highlight=${paymentId}`,
    sentBy: null,
  });

  const payment = await repository.findPaymentById(paymentId);
  return { pending: true, payment: toSafePayment(payment) };
}

// fix a pending slip
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
  if (receiptImagePath && existingDetails.receiptImagePath && existingDetails.receiptImagePath !== receiptImagePath) {
    await deleteUpload(existingDetails.receiptImagePath);
  }

  await recordAuditEvent({
    actorId: studentUser.id,
    action: 'BANK_TRANSFER_EDITED',
    entityType: 'payment',
    entityId: paymentId,
  });

  const updated = await repository.findPaymentById(paymentId);
  return toSafePayment(updated);
}

// slips waiting to be checked
async function listPendingBankTransfers() {
  const rows = await repository.listPendingBankTransfers();
  return rows.map((row) => {
    const details = parseDetails(row.payment_details);
    return {
      id: row.id,
      enrollmentId: row.enrollment_id,
      studentName: row.student_name,
      studentEmail: row.student_email,
      studentCode: row.student_code,
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

// approve the slip in one transaction
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
    link: `/payments/history?highlight=${payment.id}`,
    sentBy: adminUser.id,
  });

  return toSafePayment({
    ...payment,
    subject: outcome.subject,
    receipt_number: outcome.receiptNumber,
    receipt_issued_at: new Date().toISOString(),
  });
}

async function searchStudentsForPayment(term) {
  const students = await repository.searchStudents(term);
  const enrollments = await repository.listActiveEnrollmentsForStudents(students.map((s) => s.id));
  return students.map((student) => ({
    id: student.id,
    fullName: student.full_name,
    studentCode: student.student_code,
    grade: student.grade,
    email: student.email,
    enrollments: enrollments
      .filter((row) => row.student_id === student.id)
      .map((row) => ({
        enrollmentId: row.id,
        subject: row.subject,
        tutorName: row.tutor_name,
        balance: Number(row.balance),
      })),
  }));
}

const OFFICE_METHODS = { CASH: 'Cash', BANK_DEPOSIT: 'Bank deposit slip' };

// cash or deposit paid at the office
async function recordOfficePayment(adminUser, { enrollmentId, amount, method, reference, note }) {
  const paid = roundMoney(Number(amount));
  if (!(paid > 0)) {
    throw ApiError.badRequest('Enter the amount the student paid.');
  }

  const outcome = await withTransaction(async (connection) => {
    const enrollment = await repository.findEnrollmentByIdForUpdate(enrollmentId, connection);
    if (!enrollment || enrollment.status !== 'ACTIVE') {
      throw ApiError.notFound('That class enrolment was not found.');
    }
    const balanceBefore = Number(enrollment.balance);
    if (paid > balanceBefore) {
      throw ApiError.badRequest(`The amount cannot be more than the outstanding balance of ${formatLkr(balanceBefore)}.`);
    }

    const balanceAfter = roundMoney(balanceBefore - paid);
    const paymentId = await repository.createPendingPayment(
      {
        studentId: enrollment.student_id,
        enrollmentId,
        amount: paid,
        balanceBefore,
        paymentMethod: method,
        paymentDetails: {
          method,
          reference: reference || null,
          note: note || null,
          recordedBy: adminUser.id,
        },
      },
      connection
    );
    await repository.markPaymentSuccessful(
      paymentId,
      { gatewayTransactionId: `OFFICE-${paymentId}`, balanceAfter },
      connection
    );
    await repository.updateEnrollmentBalance(enrollmentId, balanceAfter, connection);
    const receiptNumber = buildReceiptNumber(paymentId);
    await repository.createReceipt(paymentId, receiptNumber, connection);

    return { paymentId, studentId: enrollment.student_id, subject: enrollment.subject, receiptNumber, balanceAfter };
  });

  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'PAYMENT_RECORDED_BY_ADMIN',
    entityType: 'payment',
    entityId: outcome.paymentId,
    details: { method, amount: paid, receiptNumber: outcome.receiptNumber },
  });
  await repository.createNotification({
    recipientId: outcome.studentId,
    type: 'PAYMENT_APPROVED',
    message:
      `Your ${OFFICE_METHODS[method].toLowerCase()} payment of ${formatLkr(paid)} for ${outcome.subject} was recorded. ` +
      `Receipt: ${outcome.receiptNumber}.`,
    link: `/payments/history?highlight=${outcome.paymentId}`,
    sentBy: adminUser.id,
  });

  return {
    receiptNumber: outcome.receiptNumber,
    amount: paid,
    subject: outcome.subject,
    balanceAfter: outcome.balanceAfter,
  };
}

// reject the slip and tell the student
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
    link: `/payments/history?highlight=${paymentId}`,
    sentBy: adminUser.id,
  });

  const payment = await repository.findPaymentById(paymentId);
  return toSafePayment(payment);
}

// only an admin or the owner
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

async function listRecentPayments() {
  const rows = await repository.listRecentPayments(20);
  return rows.map((row) => ({
    id: row.id,
    studentName: row.student_name,
    studentCode: row.student_code,
    subject: row.subject,
    amount: Number(row.amount),
    status: row.status,
    paymentMethod: row.payment_method,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  }));
}

// history with receipts
async function getMyPaymentHistory(studentUser) {
  const rows = await repository.listPaymentHistoryForStudent(studentUser.id);
  return rows.map(toSafePayment);
}

// show only the last 4 digits
function maskAccountNumber(accountNumber) {
  const digits = String(accountNumber || '').trim();
  if (!digits) return null;
  if (digits.length <= 4) return digits;
  return `•••• ${digits.slice(-4)}`;
}

// the settings page and checkout - the card settlement account is only shown to admins
async function getPaymentSettings({ forAdmin = false } = {}) {
  const details = await loadMethodDetails();
  const row = details.row;
  const enabledMethods = await loadEnabledMethods();
  const checkoutMethods = checkoutMethodsFor(enabledMethods, details);
  const settings = {
    bankName: row ? row.bank_name : null,
    bankAccountName: row ? row.bank_account_name : null,
    bankAccountNumber: row ? row.bank_account_number : null,
    bankBranch: row ? row.bank_branch : null,
    bankSwift: row ? row.bank_swift : null,
    ezCashNumber: row ? row.ez_cash_number : null,
    mcashNumber: row ? row.mcash_number : null,
    enabledMethods,
    checkoutMethods,
    onlinePaymentsEnabled: payhere.isConfigured(),
    paypalEnabled: checkoutMethods.includes('PAYPAL'),
    paypalCurrency: config.paypal.currency,
    paypalLkrRate: config.paypal.lkrPerUnit,
    paypalConfigured: paypal.isConfigured(),
  };
  if (!forAdmin) return settings;
  // what each method still needs before students can see it
  const missing = {};
  PAYMENT_METHOD_KEYS.forEach((method) => {
    missing[method] = missingDetailFor(method, row, details.hasCardColumns);
  });
  return {
    ...settings,
    cardAccountAvailable: details.hasCardColumns,
    cardBankName: row ? row.card_bank_name || null : null,
    cardAccountName: row ? row.card_account_name || null : null,
    cardAccountNumber: row ? row.card_account_number || null : null,
    cardBankBranch: row ? row.card_bank_branch || null : null,
    missingDetails: missing,
  };
}

// the methods to save, or null when nothing changed (turning one off needs REMOVE typed, turning one on needs its details)
async function checkMethodChange(enabledMethods, confirmText, details) {
  if (!Array.isArray(enabledMethods)) return null;
  const methods = PAYMENT_METHOD_KEYS.filter((method) => enabledMethods.includes(method));
  const current = await loadEnabledMethods();
  const removed = current.filter((method) => !methods.includes(method));
  if (removed.length > 0 && String(confirmText || '').trim().toUpperCase() !== 'REMOVE') {
    throw ApiError.badRequest('Type REMOVE to confirm turning off a payment method.');
  }
  for (const method of methods.filter((item) => !current.includes(item))) {
    const missing = missingDetailFor(method, details.row, details.hasCardColumns);
    if (missing) throw ApiError.badRequest(missing);
  }
  return methods.join(',') === current.join(',') ? null : methods;
}

// the details as they would be saved, in database column names
function proposedRow(settings, hasCardColumns, saved) {
  const row = {
    bank_account_number: settings.bankAccountNumber || null,
    ez_cash_number: settings.ezCashNumber || null,
    mcash_number: settings.mcashNumber || null,
  };
  row.card_account_number = hasCardColumns
    ? settings.cardAccountNumber || null
    : saved && saved.card_account_number;
  return row;
}

// save details, keep switched-on methods valid
async function updatePaymentSettings(adminUser, settings) {
  const details = await loadMethodDetails();
  const next = { row: proposedRow(settings, details.hasCardColumns, details.row), hasCardColumns: details.hasCardColumns };
  const methods = await checkMethodChange(settings.enabledMethods, settings.confirmText, next);

  // a method that is on cannot lose the details it needs
  const stayingOn = methods || (await loadEnabledMethods());
  for (const method of stayingOn) {
    const missing = missingDetailFor(method, next.row, next.hasCardColumns);
    if (missing && !missingDetailFor(method, details.row, details.hasCardColumns)) {
      throw ApiError.badRequest(`${METHOD_NAMES[method]} is on, so its details cannot be removed. Turn it off first.`);
    }
  }

  await repository.upsertPaymentSettings(settings, adminUser.id);
  if (details.hasCardColumns) await repository.saveCardAccount(settings);
  if (methods) await repository.saveEnabledMethods(methods, adminUser.id);
  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'PAYMENT_SETTINGS_UPDATED',
    entityType: 'payment_settings',
    entityId: 1,
  });
  return getPaymentSettings({ forAdmin: true });
}

// a payment method switch - saved on its own, the bank details are left alone
async function updatePaymentMethods(adminUser, { enabledMethods, confirmText }) {
  const methods = await checkMethodChange(enabledMethods, confirmText, await loadMethodDetails());
  if (methods) {
    await repository.saveEnabledMethods(methods, adminUser.id);
    await recordAuditEvent({
      actorId: adminUser.id,
      action: 'PAYMENT_METHODS_CHANGED',
      entityType: 'payment_settings',
      entityId: 1,
      details: { methods },
    });
  }
  return getPaymentSettings({ forAdmin: true });
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

async function getMyBankDetails(tutorUser) {
  const row = await repository.findBankDetails(tutorUser.id);
  return {
    bankName: row ? row.bank_name : null,
    accountHolder: row ? row.bank_account_holder : null,
    accountNumber: row ? row.bank_account_number : null,
    branch: row ? row.bank_branch : null,
  };
}

// tutor saves bank account
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

// admin edits - the tutor is told
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
    link: '/profile',
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

const PAYOUT_METHODS = ['BANK_TRANSFER', 'CARD_ACCOUNT', 'EZ_CASH', 'MCASH', 'BANK_FILE', 'PAYOUT_API'];
// paid on the spot with a reference - the rest wait in the bank file or go through the provider
const DIRECT_PAYOUTS = ['BANK_TRANSFER', 'CARD_ACCOUNT', 'EZ_CASH', 'MCASH'];
const WALLET_PAYOUTS = { EZ_CASH: 'eZ Cash', MCASH: 'mCash' };

// the institute accounts a tutor can be paid from - the main bank account, plus card, eZ Cash and mCash when they are on
async function listPayoutSources() {
  const { row, hasCardColumns } = await loadMethodDetails();
  const enabled = await loadEnabledMethods();
  const settings = row || {};
  const sources = [
    {
      value: 'BANK_TRANSFER',
      label: 'Main bank account',
      kind: 'BANK',
      account: settings.bank_account_number
        ? `${settings.bank_name || 'Bank'} ${maskAccountNumber(settings.bank_account_number)}`
        : null,
    },
  ];
  if (enabled.includes('CARD') && hasCardColumns && settings.card_account_number) {
    sources.push({
      value: 'CARD_ACCOUNT',
      label: 'Card payments account',
      kind: 'BANK',
      account: `${settings.card_bank_name || 'Bank'} ${maskAccountNumber(settings.card_account_number)}`,
    });
  }
  if (enabled.includes('EZ_CASH') && settings.ez_cash_number) {
    sources.push({ value: 'EZ_CASH', label: 'eZ Cash', kind: 'WALLET', account: settings.ez_cash_number });
  }
  if (enabled.includes('MCASH') && settings.mcash_number) {
    sources.push({ value: 'MCASH', label: 'mCash', kind: 'WALLET', account: settings.mcash_number });
  }
  return sources;
}

async function getPayoutOptions() {
  const tracking = await schema.hasPayoutTracking();
  const settings = await repository.getPaymentSettings();
  return {
    sources: await listPayoutSources(),
    bulkFileAvailable: tracking,
    apiAvailable: tracking && payoutGateway.isApiConfigured(),
    apiName: config.payouts.providerName || 'payout provider',
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
    // their phone, offered as the eZ Cash / mCash number
    phone: tutor.phone || null,
  };
}

// the payout message to the tutor
function payoutNotification({ method, amount, periodLabel, destination, reference }) {
  const what = `${formatLkr(amount)}${periodLabel ? ` (${periodLabel})` : ''}`;
  if (method === 'BANK_TRANSFER' || method === 'CARD_ACCOUNT') {
    return `You have been paid ${what} to ${destination}. Bank reference: ${reference}.`;
  }
  if (method === 'EZ_CASH' || method === 'MCASH') {
    return `You have been paid ${what} to ${destination}. Transaction ID: ${reference}.`;
  }
  if (method === 'PAYOUT_API') {
    return `${what} has been sent to ${destination}.`;
  }
  return `A payout of ${what} has been approved and will reach ${destination} with the next bank transfer.`;
}

// pay tutor - by bank transfer, bank file or payout API
async function payTutor(adminUser, { tutorId, amount, note, periodLabel, method, bankReference, transferDate, walletNumber }) {
  if (!(amount > 0)) {
    throw ApiError.badRequest('Payout amount must be greater than zero.');
  }
  const tutor = await repository.findActiveTutorById(tutorId);
  if (!tutor) {
    throw ApiError.badRequest('Please select a valid, active Tutor.');
  }

  const tracking = await schema.hasPayoutTracking();
  const payoutMethod = PAYOUT_METHODS.includes(method) ? method : 'BANK_FILE';
  const walletName = WALLET_PAYOUTS[payoutMethod];
  const isDirect = DIRECT_PAYOUTS.includes(payoutMethod);

  // card, eZ Cash and mCash can only be used when they are on and set up
  if (['CARD_ACCOUNT', 'EZ_CASH', 'MCASH'].includes(payoutMethod)) {
    const sources = await listPayoutSources();
    if (!sources.some((source) => source.value === payoutMethod)) {
      throw ApiError.badRequest('That account is not set up for paying tutors. Turn it on in Payment Settings first.');
    }
  }

  // a wallet payout goes to the tutor's mobile number; everything else to their bank account
  const bank = walletName ? null : await repository.findBankDetails(tutorId);
  if (!walletName && (!bank || !bank.bank_account_number)) {
    throw ApiError.badRequest(
      `${tutor.full_name} has no bank account on file. Add their account details before paying them.`
    );
  }
  const wallet = String(walletNumber || '').trim();
  if (walletName && !/^(?:\+94|0)7\d{8}$/.test(wallet)) {
    throw ApiError.badRequest(`Enter ${tutor.full_name}'s ${walletName} number, e.g. 0771234567.`);
  }

  if (isDirect && !bankReference) {
    throw ApiError.badRequest('Enter the reference or transaction ID for this transfer.');
  }
  if (isDirect && transferDate && transferDate > todayDateString()) {
    throw ApiError.badRequest('The transfer date cannot be in the future.');
  }
  if (payoutMethod === 'PAYOUT_API' && !(tracking && payoutGateway.isApiConfigured())) {
    throw ApiError.badRequest('Online payouts are not set up. Pay by bank transfer instead.');
  }

  const destination = walletName
    ? `your ${walletName} ${maskAccountNumber(wallet)}`
    : `${bank.bank_name || 'bank account'} ${maskAccountNumber(bank.bank_account_number)}`;
  const settledAt = isDirect && transferDate && transferDate !== todayDateString()
    ? `${transferDate} 00:00:00`
    : null;

  const noteParts = [note && note.trim()];
  if (!tracking) {
    noteParts.push(isDirect ? `Ref ${bankReference}` : null, `to ${destination}`);
  }
  const fullNote = noteParts.filter(Boolean).join(' - ').slice(0, 255);

  const payoutId = await repository.createTutorPayout({
    tutorId,
    amount,
    note: fullNote,
    periodLabel,
    paidBy: adminUser.id,
    status: isDirect ? 'SENT' : 'QUEUED',
    method: payoutMethod,
    bankName: walletName || bank.bank_name,
    bankAccountHolder: walletName ? tutor.full_name : bank.bank_account_holder,
    bankAccountLast4: payoutGateway.last4(walletName ? wallet : bank.bank_account_number),
    bankBranch: walletName ? null : bank.bank_branch,
    providerReference: isDirect ? bankReference : null,
    settledAt,
  });

  let status = tracking ? (isDirect ? 'SENT' : 'QUEUED') : 'RECORDED';
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

  if (status !== 'FAILED') {
    await repository.createNotification({
      recipientId: tutorId,
      type: 'PAYOUT_RECORDED',
      message: payoutNotification({ method: payoutMethod, amount, periodLabel, destination, reference: bankReference }),
      link: '/profile',
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

// make the bank CSV
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

// payout confirmed by the bank
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

// payout failed - tell the tutor
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

  await repository.createNotification({
    recipientId: payout.tutor_id,
    type: 'PAYOUT_FAILED',
    message:
      `Your payout of ${formatLkr(payout.amount)}${payout.period_label ? ` for ${payout.period_label}` : ''} ` +
      `did not go through${reason ? ` (${String(reason).replace(/\.$/, '')})` : ''}. ` +
      'The office will send it again - please check your bank details on your profile.',
    link: '/profile',
    sentBy: adminUser.id,
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

// PENDING payment + signed form
async function startOnlineCheckout(studentUser, { enrollmentId, amount }) {
  if (!payhere.isConfigured()) {
    throw ApiError.badRequest(
      'Online card payments are not switched on yet. Please use Bank Transfer, or ask an Administrator to finish the PayHere setup.'
    );
  }
  await assertMethodAllowed('ONLINE');

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

// Step 2: PayHere's server-to-server notification
async function handlePayHereNotification(body) {
  if (!payhere.isConfigured()) {
    return { handled: false, reason: 'PayHere is not configured.' };
  }

  const result = payhere.verifyNotification(body);
  if (!result.valid) {
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

    if (payment.status === PAYMENT_STATUS.SUCCESSFUL) {
      return { status: 'already-successful' };
    }
    if (payment.status !== PAYMENT_STATUS.PENDING) {
      return { status: 'not-pending' };
    }

    if (payhere.formatAmount(payment.amount) !== payhere.formatAmount(result.amount)) {
      return { status: 'amount-mismatch' };
    }
    if (result.currency !== config.payhere.currency) {
      return { status: 'currency-mismatch' };
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
      link: `/payments/history?highlight=${result.paymentId}`,
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
    await repository.createNotification({
      recipientId: outcome.studentId,
      type: 'PAYMENT_DECLINED',
      message:
        `Your online payment of ${formatLkr(outcome.amount)} did not go through. ` +
        'No money was taken - please try again or use another method.',
      link: `/payments/history?highlight=${result.paymentId}`,
      sentBy: null,
    });
  }

  return { handled: true, ...outcome };
}

function payPalOrderIdOf(payment) {
  const details =
    typeof payment.payment_details === 'string'
      ? JSON.parse(payment.payment_details || '{}')
      : payment.payment_details || {};
  return details.provider === 'paypal' && details.orderId ? String(details.orderId) : null;
}

// PENDING payment + PayPal order
async function startPayPalCheckout(studentUser, { enrollmentId, amount }, baseUrl) {
  if (!paypal.isConfigured()) {
    throw ApiError.badRequest(
      'PayPal is not switched on yet. Please use Bank Transfer, or ask an Administrator to finish the PayPal setup.'
    );
  }
  await assertMethodAllowed('PAYPAL');

  const paymentId = await createPendingPaymentRecord(studentUser, {
    enrollmentId,
    amount,
    paymentMethod: 'ONLINE',
    paymentDetails: { provider: 'paypal' },
  });

  const enrollment = await repository.findEnrollmentById(enrollmentId);

  let order;
  try {
    order = await paypal.createOrder({
      paymentId,
      amount,
      description: `Tuition fee - ${enrollment ? enrollment.subject : 'Brilliant Institute'}`,
      baseUrl,
    });
  } catch (error) {
    await repository.markPaymentFailed(paymentId, { gatewayTransactionId: null });
    throw ApiError.badRequest(`PayPal could not start this payment. ${error.message}`);
  }

  await repository.updatePaymentMethodAndDetails(paymentId, {
    paymentMethod: 'ONLINE',
    paymentDetails: {
      provider: 'paypal',
      orderId: order.orderId,
      providerAmount: order.providerAmount,
      providerCurrency: order.providerCurrency,
    },
  });

  await recordAuditEvent({
    actorId: studentUser.id,
    action: 'PAYMENT_CHECKOUT_STARTED',
    entityType: 'payment',
    entityId: paymentId,
    details: { provider: 'paypal', amount, orderId: order.orderId },
  });

  return {
    paymentId,
    approveUrl: order.approveUrl,
    providerAmount: order.providerAmount,
    providerCurrency: order.providerCurrency,
  };
}

// Step 2 - PayPal sends the payer back
async function completePayPalCheckout(paymentId) {
  if (!paypal.isConfigured()) {
    return { handled: false, reason: 'PayPal is not configured.' };
  }

  const payment = await repository.findPaymentWithDetailsById(paymentId);
  if (!payment) {
    return { handled: false, reason: 'Unknown payment.' };
  }
  if (payment.status === PAYMENT_STATUS.SUCCESSFUL) {
    return { handled: true, status: 'already-successful' };
  }
  if (payment.status !== PAYMENT_STATUS.PENDING) {
    return { handled: false, reason: 'This payment is not waiting for PayPal.' };
  }

  const orderId = payPalOrderIdOf(payment);
  if (!orderId) {
    return { handled: false, reason: 'No PayPal order for this payment.' };
  }

  let capture;
  try {
    capture = await paypal.captureOrder(orderId);
  } catch (error) {
    return { handled: false, reason: error.message };
  }
  if (!capture.completed) {
    return { handled: false, reason: capture.reason || `PayPal order is ${capture.orderStatus}.` };
  }

  const expected = paypal.toProviderAmount(payment.amount);
  if (Number(capture.amount).toFixed(2) !== expected || capture.currency !== config.paypal.currency) {
    await repository.markPaymentFailed(payment.id, { gatewayTransactionId: capture.captureId });
    return { handled: false, reason: 'The amount PayPal took does not match this payment.' };
  }

  const outcome = await withTransaction(async (connection) => {
    const locked = await repository.findPaymentByIdForUpdate(payment.id, connection);
    if (!locked) {
      return { status: 'unknown-payment' };
    }
    if (locked.status === PAYMENT_STATUS.SUCCESSFUL) {
      return { status: 'already-successful' };
    }
    if (locked.status !== PAYMENT_STATUS.PENDING) {
      return { status: 'not-pending' };
    }

    const storedDetails = {
      provider: 'paypal',
      orderId,
      captureId: capture.captureId,
      providerAmount: capture.amount,
      providerCurrency: capture.currency,
      payerEmail: capture.payerEmail,
      payerName: capture.payerName,
    };

    const enrollment = await repository.findEnrollmentByIdForUpdate(locked.enrollment_id, connection);
    const balanceAfter = Number(enrollment.balance) - Number(locked.amount);

    await repository.markPaymentSuccessful(
      locked.id,
      { gatewayTransactionId: capture.captureId, balanceAfter },
      connection
    );
    await repository.updatePaymentMethodAndDetails(
      locked.id,
      { paymentMethod: 'ONLINE', paymentDetails: storedDetails },
      connection
    );
    await repository.updateEnrollmentBalance(locked.enrollment_id, balanceAfter, connection);

    const receiptNumber = buildReceiptNumber(locked.id);
    await repository.createReceipt(locked.id, receiptNumber, connection);

    return {
      status: 'successful',
      studentId: locked.student_id,
      amount: Number(locked.amount),
      subject: enrollment.subject,
      receiptNumber,
    };
  });

  if (outcome.status === 'successful') {
    await recordAuditEvent({
      actorId: outcome.studentId,
      action: 'PAYMENT_SUCCESSFUL',
      entityType: 'payment',
      entityId: payment.id,
      details: { provider: 'paypal', receiptNumber: outcome.receiptNumber },
    });
    await repository.createNotification({
      recipientId: outcome.studentId,
      type: 'PAYMENT_APPROVED',
      message: `Your PayPal payment of LKR ${outcome.amount.toFixed(2)} for ${outcome.subject} was received. Receipt: ${outcome.receiptNumber}.`,
      link: `/payments/history?highlight=${payment.id}`,
      sentBy: null,
    });
  }

  return { handled: true, ...outcome };
}

// cancelled on PayPal
async function cancelPayPalCheckout(paymentId) {
  const payment = await repository.findPaymentWithDetailsById(paymentId);
  if (!payment || payment.status !== PAYMENT_STATUS.PENDING || !payPalOrderIdOf(payment)) {
    return { handled: false };
  }

  await repository.markPaymentFailed(payment.id, { gatewayTransactionId: null });
  await recordAuditEvent({
    actorId: payment.student_id,
    action: 'PAYMENT_FAILED',
    entityType: 'payment',
    entityId: payment.id,
    details: { provider: 'paypal', reason: 'Cancelled on PayPal.' },
  });
  return { handled: true };
}

async function getMyPaymentStatus(studentUser, paymentId) {
  const payment = await repository.findPaymentWithDetailsById(paymentId);
  if (!payment) {
    throw ApiError.notFound('Payment not found.');
  }
  if (payment.student_id !== studentUser.id) {
    throw ApiError.forbidden('You can only view your own payments.');
  }

  if (payment.status === PAYMENT_STATUS.PENDING && payPalOrderIdOf(payment)) {
    await completePayPalCheckout(payment.id).catch(() => null);
    const latest = await repository.findPaymentWithDetailsById(paymentId);
    if (latest) return toSafePayment(latest);
  }

  return toSafePayment(payment);
}

module.exports = {
  searchStudentsForPayment,
  recordOfficePayment,
  getMyBalances,
  makePayment,
  retryPendingPayment,
  startOnlineCheckout,
  handlePayHereNotification,
  startPayPalCheckout,
  completePayPalCheckout,
  cancelPayPalCheckout,
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
  updatePaymentMethods,
  payTutor,
  listTutorPayouts,
  getPayoutOptions,
  getTutorPayoutAccount,
  getPayoutBatch,
  exportPayoutFile,
  confirmPayoutSettled,
  markPayoutFailed,
};
