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

// gateway timeout error
class GatewayUnavailableError extends Error {}

// round money to 2 decimal places
function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

// how instant payment methods are named in messages
const INSTANT_METHOD_NAMES = { CARD: 'card', EZ_CASH: 'eZ Cash', MCASH: 'mCash' };

// 25000 -> "LKR 25,000.00"
function formatLkr(amount) {
  return `LKR ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// payment details are saved as JSON text - turn them back into an object
function parseDetails(details) {
  if (!details) return {};
  return typeof details === 'string' ? JSON.parse(details) : details;
}

// today's date as YYYY-MM-DD in local time
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

// bank transfer is open every day except the last day of the month
function isBankTransferWindowOpen(date = new Date()) {
  return date.getDate() !== lastDayOfMonth(date);
}

// tell the page if bank transfer is open today, and why not if it is closed
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

// student - what is still owed on each class
async function getMyBalances(studentUser) {
  const rows = await repository.listBalancesForStudent(studentUser.id);
  return rows.map((row) => ({
    enrollmentId: row.enrollment_id,
    classId: row.class_id,
    subject: row.subject,
    tutorName: row.tutor_name,
    balance: Number(row.balance),
    // fully paid - the green dot
    isPaid: row.payment_status === 'PAID' || Number(row.balance) <= 0,
    // pay by this time or the place is released
    paymentDueAt: Number(row.balance) > 0 ? row.payment_due_at : null,
  }));
}

// receipt number, e.g. RCPT-2026-000015
function buildReceiptNumber(paymentId) {
  const year = new Date().getFullYear();
  const paddedId = String(paymentId).padStart(6, '0');
  return `RCPT-${year}-${paddedId}`;
}

// keep only safe details per method (card last 4 digits, wallet phone, bank reference) - never full card data
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

// run work as one database transaction - all of it is saved, or none of it
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

  // lock the enrolment, then check it is the student's own and the amount is within the balance
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

// charge a PENDING payment - approved: balance down + receipt, declined: FAILED, gateway timeout: stays pending
async function finalizePendingPayment(studentUser, paymentId) {
  try {
    return await withTransaction(async (connection) => {
      // lock the payment and check it is this student's and still pending
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

      // ask the gateway to charge it (a timeout becomes GatewayUnavailableError)
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

      // declined - mark the payment FAILED
      if (!gatewayResult.approved) {
        await repository.markPaymentFailed(
          payment.id,
          { gatewayTransactionId: gatewayResult.gatewayTransactionId },
          connection
        );
        // Returned, not thrown, so this commit isn't rolled back.
        return {
          declinedReason: gatewayResult.reason,
          subject: enrollment.subject,
          amount: Number(payment.amount),
          method: payment.payment_method,
        };
      }

      // approved - mark it SUCCESSFUL, lower the class balance and make the receipt
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
      // after the transaction - declined: audit it and tell the student, approved: audit it and return the payment
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

    // a gateway timeout - log it and keep the payment PENDING so it can be retried
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

// payment methods - the admin switches them on and off in Payment Settings
const PAYMENT_METHOD_KEYS = ['BANK_TRANSFER', 'CARD', 'EZ_CASH', 'MCASH', 'PAYPAL'];

// switched-on methods (bank transfer only until the admin changes it)
async function loadEnabledMethods() {
  const saved = await repository.findEnabledMethods();
  if (!saved) return ['BANK_TRANSFER', 'PAYPAL'];
  return PAYMENT_METHOD_KEYS.filter((method) => saved.includes(method));
}

// checkout tabs a student gets - card/wallets go through PayHere once it is set up
function checkoutMethodsFor(enabled) {
  const online = enabled.filter((method) => method !== 'BANK_TRANSFER' && method !== 'PAYPAL');
  const tabs = [];
  if (online.length > 0) {
    if (payhere.isConfigured()) tabs.push('ONLINE');
    else if (!config.isProduction && config.paymentGateway.providerName === 'mock-gateway') tabs.push(...online);
  }
  // PayPal is its own tab once the admin switches it on and the keys are set
  if (enabled.includes('PAYPAL') && paypal.isConfigured()) tabs.push('PAYPAL');
  if (enabled.includes('BANK_TRANSFER')) tabs.push('BANK_TRANSFER');
  return tabs;
}

// refuse a payment method the admin has switched off
async function assertMethodAllowed(method) {
  const tabs = checkoutMethodsFor(await loadEnabledMethods());
  if (!tabs.includes(method)) {
    throw ApiError.forbidden('This payment method is not available right now. Please choose another one.');
  }
}

// pay btn - save the payment as PENDING, then charge it
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

// retry btn - try a pending payment again
async function retryPendingPayment(studentUser, paymentId) {
  const pending = await repository.findPaymentById(paymentId);
  if (pending) await assertMethodAllowed(pending.payment_method);
  return finalizePendingPayment(studentUser, paymentId);
}

// bank transfer form - saves receipt, waits for admin approval
async function submitBankTransferPayment(
  studentUser,
  { enrollmentId, amount, bankReference, receiptImagePath }
) {
  await assertMethodAllowed('BANK_TRANSFER');
  // bank transfer is closed on the last day of the month
  const { available, message } = getBankTransferAvailability();
  if (!available) {
    throw ApiError.badRequest(message);
  }

  // save it as PENDING until an admin approves it
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

  // let Admin know there's a slip to review, and tell the student it arrived
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
  // new slip uploaded - remove the old one
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

// admin - bank transfers waiting for approval, with the claimed amount
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

// load a bank transfer that is still waiting for review, or stop with an error
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

// Admin checks the slip and enters the amount actually received
async function approveBankTransferPayment(adminUser, paymentId, { amount } = {}) {
  // approve in one transaction - the amount received is taken off the class balance
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

    // make the receipt
    const receiptNumber = buildReceiptNumber(payment.id);
    await repository.createReceipt(payment.id, receiptNumber, connection);

    return { subject: enrollment.subject, receiptNumber, claimedAmount, receivedAmount };
  });

  // audit log - transfer approved
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
  // tell the student - and say so when the approved amount differs from what they entered
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

// record payment - find a student by registration number or name, with balances
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

// payment types an admin can record at the office
const OFFICE_METHODS = { CASH: 'Cash', BANK_DEPOSIT: 'Bank deposit slip' };

// record payment btn - admin types what the student paid at the office
async function recordOfficePayment(adminUser, { enrollmentId, amount, method, reference, note }) {
  const paid = roundMoney(Number(amount));
  if (!(paid > 0)) {
    throw ApiError.badRequest('Enter the amount the student paid.');
  }

  // record it in one transaction - saved as SUCCESSFUL, balance lowered, receipt made
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

  // audit log, then tell the student
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

// reject btn - mark the transfer FAILED and tell the student
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

// admin dashboard - recent payments
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

// student - all my payments with their receipt numbers
async function getMyPaymentHistory(studentUser) {
  const rows = await repository.listPaymentHistoryForStudent(studentUser.id);
  return rows.map(toSafePayment);
}

// Never send a Tutor's real account number to anyone but themselves
function maskAccountNumber(accountNumber) {
  const digits = String(accountNumber || '').trim();
  if (!digits) return null;
  if (digits.length <= 4) return digits;
  return `•••• ${digits.slice(-4)}`;
}

// checkout tabs - the institute's own receiving details
async function getPaymentSettings() {
  const row = await repository.getPaymentSettings();
  const enabledMethods = await loadEnabledMethods();
  return {
    bankName: row ? row.bank_name : null,
    bankAccountName: row ? row.bank_account_name : null,
    bankAccountNumber: row ? row.bank_account_number : null,
    bankBranch: row ? row.bank_branch : null,
    bankSwift: row ? row.bank_swift : null,
    ezCashNumber: row ? row.ez_cash_number : null,
    mcashNumber: row ? row.mcash_number : null,
    enabledMethods,
    checkoutMethods: checkoutMethodsFor(enabledMethods),
    onlinePaymentsEnabled: payhere.isConfigured(),
    // PayPal charges in another currency, so the student is shown the rate
    paypalEnabled: checkoutMethodsFor(enabledMethods).includes('PAYPAL'),
    paypalCurrency: config.paypal.currency,
    paypalLkrRate: config.paypal.lkrPerUnit,
    paypalConfigured: paypal.isConfigured(),
  };
}

// save btn - the institute's bank details, wallet numbers and which methods are switched on
async function updatePaymentSettings(adminUser, settings) {
  let methods = null;
  if (Array.isArray(settings.enabledMethods)) {
    methods = PAYMENT_METHOD_KEYS.filter((method) => settings.enabledMethods.includes(method));
    const current = await loadEnabledMethods();
    // turning a method off must be confirmed by typing REMOVE
    const removed = current.filter((method) => !methods.includes(method));
    if (removed.length > 0 && String(settings.confirmText || '').trim().toUpperCase() !== 'REMOVE') {
      throw ApiError.badRequest('Type REMOVE to confirm turning off a payment method.');
    }
    if (methods.join(',') === current.join(',')) methods = null;
  }

  await repository.upsertPaymentSettings(settings, adminUser.id);
  if (methods) await repository.saveEnabledMethods(methods, adminUser.id);
  await recordAuditEvent({
    actorId: adminUser.id,
    action: 'PAYMENT_SETTINGS_UPDATED',
    entityType: 'payment_settings',
    entityId: 1,
  });
  return getPaymentSettings();
}

// Pay Tutors page - active tutors with their account number masked
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

// tutor - save my own bank details
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

// Admin filling in a tutor's payout account for them
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

// --- Tutor payouts ---------------------------------------------------------

// ways to pay a tutor: a bank transfer done by hand, a bank file, or a payout API
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

// admin needs the full account number (every view is logged)
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

// the message a tutor gets when they are paid
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

// pay tutor - by bank transfer, bank file or payout API
async function payTutor(adminUser, { tutorId, amount, note, periodLabel, method, bankReference, transferDate }) {
  if (!(amount > 0)) {
    throw ApiError.badRequest('Payout amount must be greater than zero.');
  }
  // the tutor must be active and have a bank account on file
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

  // payout tracking = the database update that adds the status and reference columns
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

  // where the money goes, with the account number masked
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

  // save the payout - SENT when the admin already did the transfer, otherwise QUEUED
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

  // payout API - send the transfer now, a failure marks the payout FAILED
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

  // audit log - tutor paid
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

// --- Bulk bank file ------------------------------------------------------
// Queued payouts are exported as one bulk-credit file for corporate online
// banking. The bank moves the money; admin then marks each one paid.

// payouts waiting for the next bank file, with their total
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

// export btn - build the bank file (CSV) of all waiting payouts and mark them exported
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

  // only payouts with a bank account are in the file
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

// failed btn - the payout did not go through
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

  // tell the tutor the money did not arrive yet
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

// Pay Tutors page - every payout plus the totals per tutor
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

// PayHere - real online payments

// Step 1 of online payment - reserve a PENDING payment
async function startOnlineCheckout(studentUser, { enrollmentId, amount }) {
  if (!payhere.isConfigured()) {
    throw ApiError.badRequest(
      'Online card payments are not switched on yet. Please use Bank Transfer, or ask an Administrator to finish the PayHere setup.'
    );
  }
  await assertMethodAllowed('ONLINE');

  // same ownership and balance checks as other payments
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
    // unsigned - not from PayHere, ignore it
    return { handled: false, reason: 'Signature verification failed.' };
  }
  if (!result.paymentId) {
    return { handled: false, reason: 'Unrecognised order id.' };
  }

  // update the payment in one transaction - safe even if PayHere sends the same notice twice
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

    // Never take the posted amount at face value
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

    // not successful - still pending means wait, anything else marks it FAILED
    if (result.statusCode !== payhere.STATUS.SUCCESS) {
      if (result.statusCode === payhere.STATUS.PENDING) {
        // still clearing - wait for the next notification
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

    // successful - mark it SUCCESSFUL, lower the class balance and make the receipt
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

  // audit log and a notification for the student
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

// PayPal - card and PayPal wallet payments

// the PayPal order id saved against a payment, if it is a PayPal one
function payPalOrderIdOf(payment) {
  const details =
    typeof payment.payment_details === 'string'
      ? JSON.parse(payment.payment_details || '{}')
      : payment.payment_details || {};
  return details.provider === 'paypal' && details.orderId ? String(details.orderId) : null;
}

// Step 1 of a PayPal payment - reserve a PENDING payment and make the PayPal order
async function startPayPalCheckout(studentUser, { enrollmentId, amount }, baseUrl) {
  if (!paypal.isConfigured()) {
    throw ApiError.badRequest(
      'PayPal is not switched on yet. Please use Bank Transfer, or ask an Administrator to finish the PayPal setup.'
    );
  }
  await assertMethodAllowed('PAYPAL');

  // same ownership and balance checks as every other payment
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
    // PayPal refused or could not be reached - do not leave the payment hanging
    await repository.markPaymentFailed(paymentId, { gatewayTransactionId: null });
    throw ApiError.badRequest(`PayPal could not start this payment. ${error.message}`);
  }

  // remember the order so the return page can finish it
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

// Step 2 - PayPal sends the payer back, so take the money and update the payment
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

  // PayPal itself is asked - nothing that came back in the browser is trusted
  let capture;
  try {
    capture = await paypal.captureOrder(orderId);
  } catch (error) {
    return { handled: false, reason: error.message };
  }
  if (!capture.completed) {
    return { handled: false, reason: capture.reason || `PayPal order is ${capture.orderStatus}.` };
  }

  // PayPal must have taken exactly what we asked for
  const expected = paypal.toProviderAmount(payment.amount);
  if (Number(capture.amount).toFixed(2) !== expected || capture.currency !== config.paypal.currency) {
    await repository.markPaymentFailed(payment.id, { gatewayTransactionId: capture.captureId });
    return { handled: false, reason: 'The amount PayPal took does not match this payment.' };
  }

  // update the payment in one transaction - safe even if the page is opened twice
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

    // successful - mark it SUCCESSFUL, lower the class balance and make the receipt
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

  // audit log and a notification for the student
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

// the payer pressed Cancel on PayPal - close the payment off
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

// Polled by the return page after PayHere sends the payer back
async function getMyPaymentStatus(studentUser, paymentId) {
  const payment = await repository.findPaymentWithDetailsById(paymentId);
  if (!payment) {
    throw ApiError.notFound('Payment not found.');
  }
  if (payment.student_id !== studentUser.id) {
    throw ApiError.forbidden('You can only view your own payments.');
  }

  // a PayPal payment that was approved but never came back - finish it now
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
  payTutor,
  listTutorPayouts,
  getPayoutOptions,
  getTutorPayoutAccount,
  getPayoutBatch,
  exportPayoutFile,
  confirmPayoutSettled,
  markPayoutFailed,
};
