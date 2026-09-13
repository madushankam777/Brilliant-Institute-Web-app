const { pool } = require('../../../../../shared/server/src/config/db');

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
    `SELECT e.id AS enrollment_id, e.class_id, c.subject, e.balance, t.full_name AS tutor_name
     FROM enrollments e
     JOIN classes c ON c.id = e.class_id
     JOIN users t ON t.id = c.tutor_id
     WHERE e.student_id = ? AND e.status = 'ACTIVE'
     ORDER BY c.subject ASC`,
    [studentId]
  );
  return rows;
}

// update balance after payment (marks as paid)
async function updateEnrollmentBalance(enrollmentId, newBalance, executor = pool) {
  await executor.execute(
    `UPDATE enrollments SET balance = ?, payment_status = 'PAID' WHERE id = ?`,
    [newBalance, enrollmentId]
  );
}

async function createPendingPayment(
  { studentId, enrollmentId, amount, balanceBefore, paymentMethod, paymentDetails },
  executor = pool
) {
  const [result] = await executor.execute(
    `INSERT INTO payments
       (student_id, enrollment_id, amount, balance_before, balance_after,
        status, payment_method, payment_details, created_at)
     VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, NOW())`,
    [
      studentId,
      enrollmentId,
      amount,
      balanceBefore,
      balanceBefore,
      paymentMethod,
      JSON.stringify(paymentDetails || {}),
    ]
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

// edit btn - update a pending bank transfer's reference/receipt
async function updatePaymentDetails(paymentId, paymentDetails, executor = pool) {
  await executor.execute(`UPDATE payments SET payment_details = ? WHERE id = ?`, [
    JSON.stringify(paymentDetails),
    paymentId,
  ]);
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

async function listPendingBankTransfers(executor = pool) {
  const [rows] = await executor.execute(
    `SELECT p.id, p.enrollment_id, p.amount, p.balance_before, p.payment_details, p.created_at,
            u.full_name AS student_name, u.email AS student_email, c.subject
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     JOIN classes c ON c.id = e.class_id
     JOIN users u ON u.id = p.student_id
     WHERE p.payment_method = 'BANK_TRANSFER' AND p.status = 'PENDING'
     ORDER BY p.created_at ASC`
  );
  return rows;
}

async function listPaymentHistoryForStudent(studentId, executor = pool) {
  const [rows] = await executor.execute(
    `SELECT p.id, p.enrollment_id, c.subject, p.amount, p.balance_before, p.balance_after,
            p.status, p.payment_method, p.payment_details, p.gateway_transaction_id, p.created_at, p.paid_at,
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

// --- Tutor payouts (Admin paying a Tutor their share/salary) ---

// tutor picker list - bank fields included so Admin's Pay Tutors page can
// show them without a second round trip per tutor
async function listActiveTutors() {
  const [rows] = await pool.execute(
    `SELECT id, full_name, email, profile_picture_path,
            bank_name, bank_account_holder, bank_account_number, bank_branch
     FROM users
     WHERE role = 'TUTOR' AND status = 'ACTIVE'
     ORDER BY full_name ASC`
  );
  return rows;
}

// tutor's own bank details - the full, unmasked record
async function findBankDetails(tutorId) {
  const [rows] = await pool.execute(
    `SELECT bank_name, bank_account_holder, bank_account_number, bank_branch
     FROM users WHERE id = ? AND role = 'TUTOR' LIMIT 1`,
    [tutorId]
  );
  return rows[0] || null;
}

async function updateBankDetails(tutorId, { bankName, accountHolder, accountNumber, branch }) {
  await pool.execute(
    `UPDATE users
     SET bank_name = ?, bank_account_holder = ?, bank_account_number = ?, bank_branch = ?, updated_at = NOW()
     WHERE id = ? AND role = 'TUTOR'`,
    [bankName || null, accountHolder || null, accountNumber || null, branch || null, tutorId]
  );
}

async function findActiveTutorById(tutorId) {
  const [rows] = await pool.execute(
    `SELECT id, full_name FROM users WHERE id = ? AND role = 'TUTOR' AND status = 'ACTIVE' LIMIT 1`,
    [tutorId]
  );
  return rows[0] || null;
}

async function createTutorPayout({ tutorId, amount, note, periodLabel, paidBy }) {
  const [result] = await pool.execute(
    `INSERT INTO tutor_payouts (tutor_id, amount, note, period_label, paid_by, paid_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [tutorId, amount, note || null, periodLabel || null, paidBy]
  );
  return result.insertId;
}

async function listTutorPayouts() {
  const [rows] = await pool.execute(
    `SELECT tp.id, tp.tutor_id, t.full_name AS tutor_name, tp.amount, tp.note, tp.period_label,
            tp.paid_by, a.full_name AS paid_by_name, tp.paid_at
     FROM tutor_payouts tp
     JOIN users t ON t.id = tp.tutor_id
     JOIN users a ON a.id = tp.paid_by
     ORDER BY tp.paid_at DESC`
  );
  return rows;
}

async function sumPayoutsByTutor() {
  const [rows] = await pool.execute(
    `SELECT tutor_id, COALESCE(SUM(amount), 0) AS total_paid
     FROM tutor_payouts
     GROUP BY tutor_id`
  );
  return rows;
}

// --- Institute payment settings (Admin-editable, shown to students at checkout) ---

async function getPaymentSettings() {
  const [rows] = await pool.execute(`SELECT * FROM payment_settings WHERE id = 1 LIMIT 1`);
  return rows[0] || null;
}

async function upsertPaymentSettings(
  { bankName, bankAccountName, bankAccountNumber, bankBranch, bankSwift, ezCashNumber, mcashNumber },
  updatedBy
) {
  await pool.execute(
    `INSERT INTO payment_settings
       (id, bank_name, bank_account_name, bank_account_number, bank_branch, bank_swift,
        ez_cash_number, mcash_number, updated_by, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       bank_name = VALUES(bank_name),
       bank_account_name = VALUES(bank_account_name),
       bank_account_number = VALUES(bank_account_number),
       bank_branch = VALUES(bank_branch),
       bank_swift = VALUES(bank_swift),
       ez_cash_number = VALUES(ez_cash_number),
       mcash_number = VALUES(mcash_number),
       updated_by = VALUES(updated_by),
       updated_at = NOW()`,
    [
      bankName || null,
      bankAccountName || null,
      bankAccountNumber || null,
      bankBranch || null,
      bankSwift || null,
      ezCashNumber || null,
      mcashNumber || null,
      updatedBy,
    ]
  );
}

module.exports = {
  findEnrollmentById,
  findEnrollmentByIdForUpdate,
  listBalancesForStudent,
  updateEnrollmentBalance,
  createPendingPayment,
  markPaymentSuccessful,
  markPaymentFailed,
  updatePaymentDetails,
  createReceipt,
  findPaymentById,
  findPaymentByIdForUpdate,
  listPendingBankTransfers,
  listPaymentHistoryForStudent,
  listActiveTutors,
  findBankDetails,
  updateBankDetails,
  getPaymentSettings,
  upsertPaymentSettings,
  findActiveTutorById,
  createTutorPayout,
  listTutorPayouts,
  sumPayoutsByTutor,
};
