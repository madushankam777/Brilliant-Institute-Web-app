// Maps DB rows to safe API response shapes
function toSafeUser(userRow) {
  if (!userRow) return null;
  return {
    id: userRow.id,
    studentCode: userRow.student_code,
    fullName: userRow.full_name,
    email: userRow.email,
    phone: userRow.phone,
    role: userRow.role,
    status: userRow.status,
    bio: userRow.bio,
    grade: userRow.grade,
    profilePictureUrl: userRow.profile_picture_path,
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
    paymentDetails:
      typeof row.payment_details === 'string'
        ? JSON.parse(row.payment_details)
        : row.payment_details || null,
    // Only a reference id from the gateway - never card details.
    gatewayTransactionId: row.gateway_transaction_id,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    receiptNumber: row.receipt_number,
    receiptIssuedAt: row.receipt_issued_at,
  };
}

// Admin's "Manage Users" list needs a bit more than the self-service
// profile view (status/lockout state), but still never the password hash.
function toSafeUserForAdmin(userRow) {
  if (!userRow) return null;
  return {
    ...toSafeUser(userRow),
    failedLoginAttempts: userRow.failed_login_attempts,
    lockedUntil: userRow.locked_until,
    lastLoginAt: userRow.last_login_at,
  };
}

function toSafeClass(row) {
  if (!row) return null;
  return {
    id: row.id,
    subject: row.subject,
    subjectArea: row.subject_area,
    description: row.description,
    level: row.level,
    tutorId: row.tutor_id,
    tutorName: row.tutor_name,
    tutorProfilePictureUrl: row.tutor_profile_picture,
    venue: row.venue,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    capacity: row.capacity,
    enrolledCount: row.enrolled_count === undefined ? undefined : Number(row.enrolled_count),
    spotsLeft:
      row.enrolled_count === undefined
        ? undefined
        : Math.max(0, Number(row.capacity) - Number(row.enrolled_count)),
    fee: Number(row.fee),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSafeFeedback(row) {
  if (!row) return null;
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    submittedBy: row.submitted_by,
    submittedByName: row.submitted_by_name,
    submittedByRole: row.submitted_by_role,
    category: row.category,
    recipientType: row.recipient_type,
    recipientTutorId: row.recipient_tutor_id,
    recipientTutorName: row.recipient_tutor_name,
    subject: row.subject,
    message: row.message,
    priority: row.priority,
    status: row.status,
    responses: typeof row.responses === 'string' ? JSON.parse(row.responses) : row.responses || [],
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSafeAnnouncement(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    priority: row.priority,
    targetAudience: row.target_audience,
    targetGrade: row.target_grade,
    status: row.status,
    scheduledAt: row.scheduled_at,
    publishedBy: row.published_by,
    publishedByName: row.published_by_name,
    updatedBy: row.updated_by,
    updatedByName: row.updated_by_name,
    version: row.version,
    // Anyone who already saw v1 needs to be able to tell this is a
    // re-edited notice, not a brand new one.
    isUpdated: Number(row.version) > 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSafeTutorKey(row, { includeCode = false } = {}) {
  if (!row) return null;
  const certificatePaths =
    typeof row.certificate_paths === 'string'
      ? JSON.parse(row.certificate_paths)
      : row.certificate_paths || [];
  return {
    id: row.id,
    keyCode: includeCode ? row.key_code : undefined,
    intendedFor: row.intended_for,
    idNumber: row.id_number,
    hasCv: Boolean(row.cv_path),
    certificateCount: certificatePaths.length,
    status: row.status,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    usedBy: row.used_by,
    usedByName: row.used_by_name,
    createdAt: row.created_at,
    usedAt: row.used_at,
  };
}

function toSafeTutorProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    bio: row.bio,
    profilePictureUrl: row.profile_picture_path,
    createdAt: row.created_at,
  };
}

module.exports = {
  toSafeUser,
  toSafeUserForAdmin,
  toSafeAttendanceRecord,
  toSafePayment,
  toSafeClass,
  toSafeFeedback,
  toSafeAnnouncement,
  toSafeTutorKey,
  toSafeTutorProfile,
};
