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
async function createPendingPaymentRecord(studentUser, { enrollmentId, amount, paymentMethod }) {
  if (!(amount > 0)) {
    throw ApiError.badRequest('Payment amount must be greater than zero.');
  }

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
      { studentId: studentUser.id, enrollmentId, amount, balanceBefore, paymentMethod },
      connection
    );

    return paymentId;
  });
}

// Loads a PENDING payment and calls the mock gateway: approved -> SUCCESSFUL
// + balance + receipt; declined -> FAILED; gateway error -> stays PENDING.
// Shared by makePayment() and the retry endpoint.
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

async function makePayment(studentUser, { enrollmentId, amount, paymentMethod }) {
  const paymentId = await createPendingPaymentRecord(studentUser, {
    enrollmentId,
    amount,
    paymentMethod,
  });
  return finalizePendingPayment(studentUser, paymentId);
}

async function retryPendingPayment(studentUser, paymentId) {
  return finalizePendingPayment(studentUser, paymentId);
}

async function getMyPaymentHistory(studentUser) {
  const rows = await repository.listPaymentHistoryForStudent(studentUser.id);
  return rows.map(toSafePayment);
}

module.exports = { getMyBalances, makePayment, retryPendingPayment, getMyPaymentHistory };
