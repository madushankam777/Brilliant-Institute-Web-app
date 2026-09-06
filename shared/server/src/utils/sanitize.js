// Maps DB rows to safe API response shapes
function toSafeUser(userRow) {
  if (!userRow) return null;
  return {
    id: userRow.id,
    fullName: userRow.full_name,
    email: userRow.email,
    phone: userRow.phone,
    role: userRow.role,
    status: userRow.status,
    createdAt: userRow.created_at,
  };
}

function toSafeAttendanceRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    sessionDate: row.session_date,
    classId: row.class_id,
    subject: row.subject,
    studentId: row.student_id,
    studentName: row.student_name,
    status: row.status,
    remarks: row.remarks,
    markedAt: row.marked_at,
    updatedAt: row.updated_at,
  };
}

function toSafePayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    subject: row.subject,
    amount: Number(row.amount),
    balanceBefore: Number(row.balance_before),
    balanceAfter: Number(row.balance_after),
    status: row.status,
    paymentMethod: row.payment_method,
    // Only a reference id from the gateway - never card details.
    gatewayTransactionId: row.gateway_transaction_id,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    receiptNumber: row.receipt_number,
    receiptIssuedAt: row.receipt_issued_at,
  };
}

module.exports = { toSafeUser, toSafeAttendanceRecord, toSafePayment };
