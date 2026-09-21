-- Brilliant Institute - read-only queries for inspecting data in MySQL Workbench.
-- Run one query at a time (Ctrl+Enter on the line). Nothing here changes data.

USE brilliant_institute;

-- =============================================================
-- 1. Overview: row count in every table
-- =============================================================
SELECT 'users' AS table_name, COUNT(*) AS total_rows FROM users
UNION ALL SELECT 'tutor_enrollment_keys', COUNT(*) FROM tutor_enrollment_keys
UNION ALL SELECT 'classes', COUNT(*) FROM classes
UNION ALL SELECT 'class_sessions', COUNT(*) FROM class_sessions
UNION ALL SELECT 'enrollments', COUNT(*) FROM enrollments
UNION ALL SELECT 'attendance_records', COUNT(*) FROM attendance_records
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'receipts', COUNT(*) FROM receipts
UNION ALL SELECT 'tutor_payouts', COUNT(*) FROM tutor_payouts
UNION ALL SELECT 'feedback_complaints', COUNT(*) FROM feedback_complaints
UNION ALL SELECT 'announcements', COUNT(*) FROM announcements
UNION ALL SELECT 'notification_log', COUNT(*) FROM notification_log
UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log;

-- =============================================================
-- 2. Users
-- =============================================================

-- All active accounts, newest first
SELECT id, student_code, full_name, email, phone, role, status, grade, created_at, last_login_at
FROM users
WHERE status <> 'DELETED'
ORDER BY created_at DESC;

-- Count of accounts by role and status
SELECT role, status, COUNT(*) AS total
FROM users
GROUP BY role, status
ORDER BY role, status;

-- Tutors and whether they have payout bank details on file
SELECT id, full_name, email, status,
       bank_name, bank_account_holder, bank_branch,
       CONCAT('**** ', RIGHT(bank_account_number, 4)) AS account_last4,
       CASE WHEN bank_name IS NULL AND bank_account_number IS NULL THEN 'MISSING' ELSE 'ON FILE' END AS bank_details
FROM users
WHERE role = 'TUTOR' AND status <> 'DELETED'
ORDER BY full_name;

-- Locked / suspended accounts
SELECT id, full_name, email, role, status, failed_login_attempts, locked_until
FROM users
WHERE status = 'SUSPENDED' OR locked_until > NOW();

-- =============================================================
-- 3. Tutor enrollment keys (and the tutor who redeemed each)
-- =============================================================
SELECT k.id, k.key_code, k.intended_for, k.id_number, k.status,
       k.cv_path IS NOT NULL AS has_cv,
       JSON_LENGTH(k.certificate_paths) AS certificate_count,
       creator.full_name AS created_by, tutor.full_name AS redeemed_by,
       k.created_at, k.used_at
FROM tutor_enrollment_keys k
JOIN users creator ON creator.id = k.created_by
LEFT JOIN users tutor ON tutor.id = k.used_by
ORDER BY k.created_at DESC;

-- =============================================================
-- 4. Classes and enrollments
-- =============================================================

-- Classes with tutor and how full they are
SELECT c.id, c.subject, c.subject_area, c.level, u.full_name AS tutor,
       c.day_of_week, c.start_time, c.end_time, c.venue, c.fee, c.capacity,
       (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'ACTIVE') AS enrolled,
       c.status
FROM classes c
JOIN users u ON u.id = c.tutor_id
ORDER BY c.status, c.subject;

-- Every student's enrollments with balance owed
SELECT e.id AS enrollment_id, s.full_name AS student, s.student_code,
       c.subject, t.full_name AS tutor,
       e.status, e.payment_status, e.balance, e.enrolled_at
FROM enrollments e
JOIN users s ON s.id = e.student_id
JOIN classes c ON c.id = e.class_id
JOIN users t ON t.id = c.tutor_id
ORDER BY s.full_name, c.subject;

-- Students with outstanding fees
SELECT s.full_name AS student, s.email, c.subject, e.balance
FROM enrollments e
JOIN users s ON s.id = e.student_id
JOIN classes c ON c.id = e.class_id
WHERE e.status = 'ACTIVE' AND e.balance > 0
ORDER BY e.balance DESC;

-- =============================================================
-- 5. Attendance
-- =============================================================

-- Recent attendance marks (manual and self check-in)
SELECT ar.id, cs.session_date, c.subject, s.full_name AS student,
       ar.status, ar.remarks, m.full_name AS marked_by, ar.marked_at
FROM attendance_records ar
JOIN class_sessions cs ON cs.id = ar.session_id
JOIN classes c ON c.id = cs.class_id
JOIN users s ON s.id = ar.student_id
JOIN users m ON m.id = ar.marked_by
ORDER BY ar.marked_at DESC
LIMIT 100;

-- Attendance rate per student per class
SELECT s.full_name AS student, c.subject,
       COUNT(*) AS sessions_marked,
       SUM(ar.status IN ('PRESENT', 'LATE')) AS attended,
       ROUND(SUM(ar.status IN ('PRESENT', 'LATE')) / COUNT(*) * 100, 1) AS attendance_percent
FROM attendance_records ar
JOIN class_sessions cs ON cs.id = ar.session_id
JOIN classes c ON c.id = cs.class_id
JOIN users s ON s.id = ar.student_id
GROUP BY s.id, c.id
ORDER BY attendance_percent;

-- =============================================================
-- 6. Payments and tutor payouts
-- =============================================================

-- All student payments with receipt numbers
SELECT p.id, s.full_name AS student, c.subject, p.amount, p.payment_method, p.status,
       r.receipt_number, p.created_at, p.paid_at
FROM payments p
JOIN users s ON s.id = p.student_id
JOIN enrollments e ON e.id = p.enrollment_id
JOIN classes c ON c.id = e.class_id
LEFT JOIN receipts r ON r.payment_id = p.id
ORDER BY p.created_at DESC;

-- Bank transfers waiting for admin approval
SELECT p.id, s.full_name AS student, p.amount, p.payment_details, p.created_at
FROM payments p
JOIN users s ON s.id = p.student_id
WHERE p.payment_method = 'BANK_TRANSFER' AND p.status = 'PENDING';

-- Revenue by month
SELECT DATE_FORMAT(paid_at, '%Y-%m') AS month, COUNT(*) AS payments, SUM(amount) AS revenue
FROM payments
WHERE status = 'SUCCESSFUL'
GROUP BY month
ORDER BY month DESC;

-- Payouts made to tutors
SELECT tp.id, t.full_name AS tutor, tp.amount, tp.period_label, tp.note,
       a.full_name AS paid_by, tp.paid_at
FROM tutor_payouts tp
JOIN users t ON t.id = tp.tutor_id
JOIN users a ON a.id = tp.paid_by
ORDER BY tp.paid_at DESC;

-- Total paid to each tutor
SELECT t.full_name AS tutor, COUNT(tp.id) AS payouts, COALESCE(SUM(tp.amount), 0) AS total_paid
FROM users t
LEFT JOIN tutor_payouts tp ON tp.tutor_id = t.id
WHERE t.role = 'TUTOR' AND t.status <> 'DELETED'
GROUP BY t.id
ORDER BY total_paid DESC;

-- =============================================================
-- 7. Notifications, announcements, feedback
-- =============================================================

-- Latest notifications (payout alerts, class changes, tutor messages, reminders)
SELECT n.id, r.full_name AS recipient, r.role AS recipient_role, n.type, n.message,
       sender.full_name AS sent_by, n.sent_at
FROM notification_log n
JOIN users r ON r.id = n.recipient_id
LEFT JOIN users sender ON sender.id = n.sent_by
ORDER BY n.sent_at DESC
LIMIT 100;

-- Class-change notifications sent to students
SELECT r.full_name AS student, n.message, n.sent_at
FROM notification_log n
JOIN users r ON r.id = n.recipient_id
WHERE n.type = 'CLASS_REMINDER'
ORDER BY n.sent_at DESC;

-- Messages tutors sent to their students / admin
SELECT sender.full_name AS tutor, r.full_name AS recipient, r.role, n.message, n.sent_at
FROM notification_log n
JOIN users r ON r.id = n.recipient_id
JOIN users sender ON sender.id = n.sent_by
WHERE n.type = 'ANNOUNCEMENT' AND sender.role = 'TUTOR'
ORDER BY n.sent_at DESC;

-- Announcements published by admin
SELECT a.id, a.title, a.priority, a.target_audience, a.target_grade, a.status,
       u.full_name AS published_by, a.created_at, a.updated_at
FROM announcements a
JOIN users u ON u.id = a.published_by
ORDER BY a.created_at DESC;

-- Feedback tickets
SELECT f.ticket_number, s.full_name AS submitted_by, f.category, f.recipient_type,
       t.full_name AS assigned_tutor, f.subject, f.priority, f.status, f.created_at, f.resolved_at
FROM feedback_complaints f
JOIN users s ON s.id = f.submitted_by
LEFT JOIN users t ON t.id = f.recipient_tutor_id
ORDER BY f.created_at DESC;

-- =============================================================
-- 8. Audit trail (who did what)
-- =============================================================
SELECT al.id, u.full_name AS actor, al.action, al.entity_type, al.entity_id, al.details, al.created_at
FROM audit_log al
LEFT JOIN users u ON u.id = al.actor_id
ORDER BY al.created_at DESC
LIMIT 100;
