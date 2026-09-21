-- Brilliant Institute - read-only queries grouped by team member's module.
-- Run one query at a time in MySQL Workbench (Ctrl+Enter). Nothing here changes data.

USE brilliant_institute;

-- =====================================================================
-- N Danushika - Registration & Login
-- Tables: users, password_reset_tokens, tutor_enrollment_keys (redeeming)
-- =====================================================================

-- Registered accounts
SELECT id, student_code, full_name, email, phone, role, grade, status, created_at
FROM users
WHERE status <> 'DELETED'
ORDER BY created_at DESC;

-- Login activity and lockouts
SELECT full_name, email, role, last_login_at, failed_login_attempts, locked_until
FROM users
WHERE status <> 'DELETED'
ORDER BY last_login_at DESC;

-- Password reset requests
SELECT u.full_name, u.email, t.created_at AS requested_at, t.expires_at, t.used_at,
       CASE
         WHEN t.used_at IS NOT NULL THEN 'USED'
         WHEN t.expires_at < NOW() THEN 'EXPIRED'
         ELSE 'ACTIVE'
       END AS token_state
FROM password_reset_tokens t
JOIN users u ON u.id = t.user_id
ORDER BY t.created_at DESC;

-- Tutors who registered with an enrollment key
SELECT u.full_name, u.email, k.key_code, k.used_at AS registered_at
FROM tutor_enrollment_keys k
JOIN users u ON u.id = k.used_by
ORDER BY k.used_at DESC;

-- =====================================================================
-- M T Madushanka - Attendance & Payment
-- Tables: class_sessions, attendance_records, payments, receipts,
--         tutor_payouts, payment_settings
-- =====================================================================

-- Class sessions, with attendance counts and self check-in key
SELECT cs.id, c.subject, cs.session_date, cs.start_time, cs.end_time,
       cs.checkin_code, cs.checkin_code_expires_at,
       SUM(ar.status = 'PRESENT') AS present,
       SUM(ar.status = 'LATE') AS late,
       SUM(ar.status = 'ABSENT') AS absent
FROM class_sessions cs
JOIN classes c ON c.id = cs.class_id
LEFT JOIN attendance_records ar ON ar.session_id = cs.id
GROUP BY cs.id
ORDER BY cs.session_date DESC;

-- Attendance records (manual marking and self check-in)
SELECT cs.session_date, c.subject, s.full_name AS student, ar.status, ar.remarks,
       m.full_name AS marked_by, ar.marked_at
FROM attendance_records ar
JOIN class_sessions cs ON cs.id = ar.session_id
JOIN classes c ON c.id = cs.class_id
JOIN users s ON s.id = ar.student_id
JOIN users m ON m.id = ar.marked_by
ORDER BY ar.marked_at DESC;

-- Student payments with receipts
SELECT p.id, s.full_name AS student, c.subject, p.amount, p.balance_before, p.balance_after,
       p.payment_method, p.status, r.receipt_number, p.created_at, p.paid_at
FROM payments p
JOIN users s ON s.id = p.student_id
JOIN enrollments e ON e.id = p.enrollment_id
JOIN classes c ON c.id = e.class_id
LEFT JOIN receipts r ON r.payment_id = p.id
ORDER BY p.created_at DESC;

-- Payouts to tutors
SELECT t.full_name AS tutor, tp.amount, tp.period_label, tp.note, a.full_name AS paid_by, tp.paid_at
FROM tutor_payouts tp
JOIN users t ON t.id = tp.tutor_id
JOIN users a ON a.id = tp.paid_by
ORDER BY tp.paid_at DESC;

-- Institute's receiving account details (shown at checkout)
SELECT * FROM payment_settings;

-- =====================================================================
-- C D Kumanan - Course Management
-- Tables: classes, enrollments
-- =====================================================================

-- All classes with tutor and seats taken
SELECT c.id, c.subject, c.subject_area, c.level, u.full_name AS tutor,
       c.day_of_week, c.start_time, c.end_time, c.venue, c.fee, c.capacity,
       SUM(e.status = 'ACTIVE') AS enrolled, c.status, c.created_at, c.updated_at
FROM classes c
JOIN users u ON u.id = c.tutor_id
LEFT JOIN enrollments e ON e.class_id = c.id
GROUP BY c.id
ORDER BY c.status, c.subject;

-- Enrollments: who is in which class
SELECT s.full_name AS student, s.student_code, c.subject, t.full_name AS tutor,
       e.status, e.payment_status, e.balance, e.enrolled_at, e.drop_date
FROM enrollments e
JOIN users s ON s.id = e.student_id
JOIN classes c ON c.id = e.class_id
JOIN users t ON t.id = c.tutor_id
ORDER BY c.subject, s.full_name;

-- Weekly timetable
SELECT day_of_week, start_time, end_time, subject, venue
FROM classes
WHERE status = 'ACTIVE'
ORDER BY FIELD(day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
         start_time;

-- =====================================================================
-- H A S Hapuarachchi - Feedback & Complaint
-- Table: feedback_complaints
-- =====================================================================

-- All tickets
SELECT f.ticket_number, s.full_name AS submitted_by, f.category, f.recipient_type,
       t.full_name AS assigned_tutor, f.subject, f.priority, f.status, f.created_at, f.resolved_at
FROM feedback_complaints f
JOIN users s ON s.id = f.submitted_by
LEFT JOIN users t ON t.id = f.recipient_tutor_id
ORDER BY f.created_at DESC;

-- Replies inside each ticket (stored as JSON in the responses column)
SELECT f.ticket_number, jt.author_name, jt.author_role, jt.message AS reply, jt.created_at AS replied_at
FROM feedback_complaints f
JOIN JSON_TABLE(
  f.responses, '$[*]' COLUMNS (
    author_name VARCHAR(150) PATH '$.authorName',
    author_role VARCHAR(20)  PATH '$.authorRole',
    message     TEXT         PATH '$.message',
    created_at  VARCHAR(40)  PATH '$.createdAt'
  )
) AS jt
ORDER BY f.ticket_number, jt.created_at;

-- Ticket counts by status
SELECT status, COUNT(*) AS total FROM feedback_complaints GROUP BY status;

-- =====================================================================
-- S Vithushan - Admin, Notifications & Announcements
-- Tables: tutor_enrollment_keys (issuing), announcements,
--         notification_log, audit_log
-- =====================================================================

-- Dashboard figures
SELECT
  (SELECT COUNT(*) FROM users WHERE status <> 'DELETED') AS total_users,
  (SELECT COUNT(*) FROM classes WHERE status = 'ACTIVE') AS active_classes,
  (SELECT COUNT(*) FROM feedback_complaints WHERE status <> 'RESOLVED') AS open_complaints,
  (SELECT COALESCE(SUM(amount), 0) FROM payments
    WHERE status = 'SUCCESSFUL' AND YEAR(paid_at) = YEAR(CURDATE()) AND MONTH(paid_at) = MONTH(CURDATE())) AS monthly_revenue;

-- Enrollment keys issued by admin
SELECT k.key_code, k.intended_for, k.id_number, k.status,
       k.cv_path IS NOT NULL AS has_cv, JSON_LENGTH(k.certificate_paths) AS certificates,
       c.full_name AS issued_by, u.full_name AS redeemed_by, k.created_at
FROM tutor_enrollment_keys k
JOIN users c ON c.id = k.created_by
LEFT JOIN users u ON u.id = k.used_by
ORDER BY k.created_at DESC;

-- Announcements
SELECT a.title, a.priority, a.target_audience, a.target_grade, a.status, a.version,
       u.full_name AS published_by, a.created_at, a.updated_at
FROM announcements a
JOIN users u ON u.id = a.published_by
ORDER BY a.created_at DESC;

-- Notifications sent to users
SELECT r.full_name AS recipient, r.role, n.type, n.message, s.full_name AS sent_by, n.sent_at
FROM notification_log n
JOIN users r ON r.id = n.recipient_id
LEFT JOIN users s ON s.id = n.sent_by
ORDER BY n.sent_at DESC;

-- Audit trail
SELECT u.full_name AS actor, al.action, al.entity_type, al.entity_id, al.details, al.created_at
FROM audit_log al
LEFT JOIN users u ON u.id = al.actor_id
ORDER BY al.created_at DESC
LIMIT 100;
