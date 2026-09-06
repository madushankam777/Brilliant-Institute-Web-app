// SQL for enrollments / payments / receipts
const { pool } = require('../../config/db');

async function findEnrollmentById(enrollmentId, executor = pool) {
  const [rows] = await executor.execute(
    `SELECT e.id, e.student_id, e.class_id, e.balance, e.status, c.subject
     FROM enrollments e
     JOIN classes c ON c.id = e.class_id
     WHERE e.id = ?
     LIMIT 1`,
    [enrollmentId]
  );
  return rows[0] || null;
}

// FOR UPDATE locks the row so two simultaneous payments can't both read the
// same balance and overwrite each other's update.
async function findEnrollmentByIdForUpdate(enrollmentId, connection) {
  const [rows] = await connection.execute(
    `SELECT e.id, e.student_id, e.class_id, e.balance, e.status, c.subject
     FROM enrollments e
     JOIN classes c ON c.id = e.class_id
     WHERE e.id = ?
     FOR UPDATE`,
    [enrollmentId]
  );
  return rows[0] || null;
}

async function listBalancesForStudent(studentId, executor = pool) {
  const [rows] = await executor.execute(
    `SELECT e.id AS enrollment_id, e.class_id, c.subject, e.balance
     FROM enrollments e
     JOIN classes c ON c.id = e.class_id
     WHERE e.student_id = ? AND e.status = 'ACTIVE'
     ORDER BY c.subject ASC`,
    [studentId]
  );
  return rows;
}

async function updateEnrollmentBalance(enrollmentId, newBalance, executor = pool) {
  await executor.execute(`UPDATE enrollments SET balance = ? WHERE id = ?`, [
    newBalance,
    enrollmentId,
  ]);
}

async function createPendingPayment(
  { studentId, enrollmentId, amount, balanceBefore, paymentMethod },
  executor = pool
) {
  const [result] = await executor.execute(
    `INSERT INTO payments
       (student_id, enrollment_id, amount, balance_before, balance_after,
        status, payment_method, created_at)
     VALUES (?, ?, ?, ?, ?, 'PENDING', ?, NOW())`,
    [studentId, enrollmentId, amount, balanceBefore, balanceBefore, paymentMethod]
  );
  return result.insertId;
}

async function markPaymentSuccessful(
  paymentId,
  { gatewayTransactionId, balanceAfter },
  executor = pool
) {
  await executor.execute(
    `UPDATE payments
     SET status = 'SUCCESSFUL', gateway_transaction_id = ?, balance_after = ?, paid_at = NOW()
     WHERE id = ?`,
    [gatewayTransactionId, balanceAfter, paymentId]
  );
}

async function markPaymentFailed(paymentId, { gatewayTransactionId }, executor = pool) {
  await executor.execute(
    `UPDATE payments SET status = 'FAILED', gateway_transaction_id = ? WHERE id = ?`,
    [gatewayTransactionId, paymentId]
  );
}

async function createReceipt(paymentId, receiptNumber, executor = pool) {
  await executor.execute(
    `INSERT INTO receipts (payment_id, receipt_number, issued_at) VALUES (?, ?, NOW())`,
    [paymentId, receiptNumber]
  );
}

async function findPaymentById(paymentId, executor = pool) {
  const [rows] = await executor.execute(`SELECT * FROM payments WHERE id = ? LIMIT 1`, [
    paymentId,
  ]);
  return rows[0] || null;
}

// FOR UPDATE locks the row so two simultaneous retries can't both succeed.
async function findPaymentByIdForUpdate(paymentId, connection) {
  const [rows] = await connection.execute(`SELECT * FROM payments WHERE id = ? FOR UPDATE`, [
    paymentId,
  ]);
  return rows[0] || null;
}

async function listPaymentHistoryForStudent(studentId, executor = pool) {
  const [rows] = await executor.execute(
    `SELECT p.id, p.enrollment_id, c.subject, p.amount, p.balance_before, p.balance_after,
            p.status, p.payment_method, p.gateway_transaction_id, p.created_at, p.paid_at,
            r.receipt_number, r.issued_at AS receipt_issued_at
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     JOIN classes c ON c.id = e.class_id
     LEFT JOIN receipts r ON r.payment_id = p.id
     WHERE p.student_id = ?
     ORDER BY p.created_at DESC`,
    [studentId]
  );
  return rows;
}

module.exports = {
  findEnrollmentById,
  findEnrollmentByIdForUpdate,
  listBalancesForStudent,
  updateEnrollmentBalance,
  createPendingPayment,
  markPaymentSuccessful,
  markPaymentFailed,
  createReceipt,
  findPaymentById,
  findPaymentByIdForUpdate,
  listPaymentHistoryForStudent,
};
