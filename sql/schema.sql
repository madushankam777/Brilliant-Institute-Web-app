-- =============================================================================
-- Brilliant Institute - Tuition Class Management System
-- Database schema for the modules implemented in this codebase:
--   - User Registration & Authentication (owner: N Danushika)
--   - Attendance & Payment              (owner: M T Madushanka)
--
-- NOTE: `classes` and `enrollments` are intentionally minimal stubs here.
-- Full Course & Class Management (CRS-01..CRS-06) belongs to a teammate's
-- module and will likely extend these two tables further. They are
-- included only so Attendance/Payment have something real to attach to.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS brilliant_institute
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE brilliant_institute;

-- -----------------------------------------------------------------------
-- USERS  (REG-01, REG-02, REG-03, REG-07)
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name             VARCHAR(150)  NOT NULL,
  email                 VARCHAR(190)  NOT NULL,
  password_hash         VARCHAR(255)  NOT NULL,
  phone                 VARCHAR(30)   NULL,
  role                  ENUM('STUDENT_PARENT', 'TUTOR', 'ADMIN') NOT NULL DEFAULT 'STUDENT_PARENT',
  status                ENUM('ACTIVE', 'SUSPENDED', 'DELETED') NOT NULL DEFAULT 'ACTIVE',
  failed_login_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until          DATETIME NULL,
  last_login_at         DATETIME NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NULL,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------
-- PASSWORD RESET TOKENS  (REG-05)
-- We only ever store a SHA-256 hash of the raw token, never the token
-- itself, the same way we never store the raw password.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64)     NOT NULL,
  expires_at  DATETIME     NOT NULL,
  used_at     DATETIME     NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reset_token_hash (token_hash),
  KEY idx_reset_user (user_id),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------
-- CLASSES  (minimal stub - full ownership: Course & Class Management module)
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classes (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject      VARCHAR(150)   NOT NULL,
  tutor_id     INT UNSIGNED   NOT NULL,
  venue        VARCHAR(150)   NULL,
  day_of_week  VARCHAR(20)    NULL,
  start_time   TIME           NULL,
  end_time     TIME           NULL,
  capacity     SMALLINT UNSIGNED NOT NULL DEFAULT 20,
  fee          DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  status       ENUM('ACTIVE', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_classes_tutor (tutor_id),
  CONSTRAINT fk_classes_tutor FOREIGN KEY (tutor_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------
-- CLASS SESSIONS  (one row per scheduled lesson of a class - ATP-01)
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS class_sessions (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id      INT UNSIGNED NOT NULL,
  session_date  DATE         NOT NULL,
  start_time    TIME         NULL,
  end_time      TIME         NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sessions_class (class_id),
  CONSTRAINT fk_sessions_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------
-- ENROLLMENTS  (minimal stub linking a Student/Parent to a Class)
-- `balance` is the fee still owed for this enrollment (ATP-04/05/07).
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enrollments (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id    INT UNSIGNED NOT NULL,
  class_id      INT UNSIGNED NOT NULL,
  status        ENUM('ACTIVE', 'DROPPED') NOT NULL DEFAULT 'ACTIVE',
  balance       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  enrolled_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  drop_date     DATETIME NULL,
  UNIQUE KEY uq_enrollment_student_class (student_id, class_id),
  KEY idx_enrollments_class (class_id),
  CONSTRAINT fk_enrollments_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollments_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------
-- ATTENDANCE RECORDS  (ATP-01, ATP-02, ATP-03)
-- One row per (session, student). Corrections UPDATE the same row and
-- bump `updated_at`, rather than creating a duplicate row.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_records (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id   INT UNSIGNED NOT NULL,
  student_id   INT UNSIGNED NOT NULL,
  status       ENUM('PRESENT', 'ABSENT', 'LATE') NOT NULL,
  remarks      VARCHAR(255) NULL,
  marked_by    INT UNSIGNED NOT NULL,
  marked_at    DATETIME NOT NULL,
  updated_at   DATETIME NOT NULL,
  UNIQUE KEY uq_attendance_session_student (session_id, student_id),
  KEY idx_attendance_student (student_id),
  CONSTRAINT fk_attendance_session FOREIGN KEY (session_id) REFERENCES class_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_marked_by FOREIGN KEY (marked_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------
-- PAYMENTS  (ATP-05) - card data is NEVER stored here, only a reference
-- id returned by the third-party PCI-compliant gateway.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id             INT UNSIGNED NOT NULL,
  enrollment_id          INT UNSIGNED NOT NULL,
  amount                 DECIMAL(10,2) NOT NULL,
  balance_before         DECIMAL(10,2) NOT NULL,
  balance_after          DECIMAL(10,2) NOT NULL,
  status                 ENUM('PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
  payment_method         VARCHAR(30) NOT NULL,
  gateway_transaction_id VARCHAR(100) NULL,
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at                DATETIME NULL,
  UNIQUE KEY uq_payments_gateway_txn (gateway_transaction_id),
  KEY idx_payments_student (student_id),
  KEY idx_payments_enrollment (enrollment_id),
  CONSTRAINT fk_payments_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------
-- RECEIPTS  (ATP-06)
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipts (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id      INT UNSIGNED NOT NULL,
  receipt_number  VARCHAR(50) NOT NULL,
  issued_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_receipts_payment (payment_id),
  UNIQUE KEY uq_receipts_number (receipt_number),
  CONSTRAINT fk_receipts_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------
-- AUDIT LOG  (SRS 6.2 - immutable, timestamped audit trail)
-- Application code only ever INSERTs here, never UPDATEs/DELETEs.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id     INT UNSIGNED NULL,
  action       VARCHAR(100) NOT NULL,
  entity_type  VARCHAR(50)  NOT NULL,
  entity_id    INT UNSIGNED NULL,
  details      JSON NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_actor (actor_id),
  KEY idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
