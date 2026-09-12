CREATE DATABASE IF NOT EXISTS brilliant_institute
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE brilliant_institute;

CREATE TABLE IF NOT EXISTS users (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_code          VARCHAR(12)   NULL,
  full_name             VARCHAR(150)  NOT NULL,
  email                 VARCHAR(190)  NOT NULL,
  password_hash         VARCHAR(255)  NOT NULL,
  phone                 VARCHAR(30)   NULL,
  role                  ENUM('STUDENT_PARENT', 'TUTOR', 'ADMIN') NOT NULL DEFAULT 'STUDENT_PARENT',
  status                ENUM('ACTIVE', 'SUSPENDED', 'DELETED') NOT NULL DEFAULT 'ACTIVE',
  bio                   TEXT NULL,
  grade                 VARCHAR(10) NULL,
  profile_picture_path  VARCHAR(255) NULL,
  failed_login_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until          DATETIME NULL,
  last_login_at         DATETIME NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NULL,
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_student_code (student_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tutor_enrollment_keys (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  key_code           VARCHAR(20)  NOT NULL,
  intended_for       VARCHAR(190) NULL,
  id_number          VARCHAR(50)  NULL,
  cv_path            VARCHAR(255) NULL,
  certificate_paths  JSON NULL,
  status             ENUM('UNUSED', 'USED', 'REVOKED') NOT NULL DEFAULT 'UNUSED',
  created_by         INT UNSIGNED NOT NULL,
  used_by            INT UNSIGNED NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at            DATETIME NULL,
  UNIQUE KEY uq_tutor_key_code (key_code),
  KEY idx_tutor_key_status (status),
  CONSTRAINT fk_tutor_key_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tutor_key_used_by FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS classes (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject       VARCHAR(150)   NOT NULL,
  subject_area  VARCHAR(50)    NULL,
  description   TEXT           NULL,
  level         VARCHAR(50)    NULL,
  tutor_id      INT UNSIGNED   NOT NULL,
  venue         VARCHAR(150)   NULL,
  day_of_week   VARCHAR(20)    NULL,
  start_time    TIME           NULL,
  end_time      TIME           NULL,
  capacity      SMALLINT UNSIGNED NOT NULL DEFAULT 20,
  fee           DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  status        ENUM('ACTIVE', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NULL,
  KEY idx_classes_tutor (tutor_id),
  KEY idx_classes_subject_area (subject_area),
  CONSTRAINT fk_classes_tutor FOREIGN KEY (tutor_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS class_sessions (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id      INT UNSIGNED NOT NULL,
  session_date  DATE         NOT NULL,
  start_time    TIME         NULL,
  end_time      TIME         NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_session_class_date (class_id, session_date),
  KEY idx_sessions_class (class_id),
  CONSTRAINT fk_sessions_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS enrollments (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id      INT UNSIGNED NOT NULL,
  class_id        INT UNSIGNED NOT NULL,
  status          ENUM('ACTIVE', 'DROPPED') NOT NULL DEFAULT 'ACTIVE',
  payment_status  ENUM('UNPAID', 'PAID') NOT NULL DEFAULT 'UNPAID',
  balance         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  enrolled_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  drop_date       DATETIME NULL,
  UNIQUE KEY uq_enrollment_student_class (student_id, class_id),
  KEY idx_enrollments_class (class_id),
  CONSTRAINT fk_enrollments_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollments_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS payments (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id             INT UNSIGNED NOT NULL,
  enrollment_id          INT UNSIGNED NOT NULL,
  amount                 DECIMAL(10,2) NOT NULL,
  balance_before         DECIMAL(10,2) NOT NULL,
  balance_after          DECIMAL(10,2) NOT NULL,
  status                 ENUM('PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
  payment_method         VARCHAR(30) NOT NULL,
  payment_details        JSON NULL,
  gateway_transaction_id VARCHAR(100) NULL,
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at                DATETIME NULL,
  UNIQUE KEY uq_payments_gateway_txn (gateway_transaction_id),
  KEY idx_payments_student (student_id),
  KEY idx_payments_enrollment (enrollment_id),
  CONSTRAINT fk_payments_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS receipts (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id      INT UNSIGNED NOT NULL,
  receipt_number  VARCHAR(50) NOT NULL,
  issued_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_receipts_payment (payment_id),
  UNIQUE KEY uq_receipts_number (receipt_number),
  CONSTRAINT fk_receipts_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS feedback_complaints (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_number       VARCHAR(20)  NOT NULL,
  submitted_by        INT UNSIGNED NOT NULL,
  category            VARCHAR(100) NOT NULL,
  recipient_type      ENUM('ADMIN', 'ADMIN_TUTOR', 'TUTOR') NOT NULL DEFAULT 'ADMIN',
  recipient_tutor_id  INT UNSIGNED NULL,
  subject             VARCHAR(200) NOT NULL,
  message             TEXT         NOT NULL,
  priority            ENUM('LOW', 'MEDIUM', 'HIGH') NOT NULL DEFAULT 'MEDIUM',
  status              ENUM('PENDING', 'IN_PROGRESS', 'RESOLVED') NOT NULL DEFAULT 'PENDING',
  responses           JSON NULL,
  resolved_by         INT UNSIGNED NULL,
  resolved_at         DATETIME NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NULL,
  UNIQUE KEY uq_feedback_ticket_number (ticket_number),
  KEY idx_feedback_submitted_by (submitted_by),
  KEY idx_feedback_status (status),
  KEY idx_feedback_recipient_tutor (recipient_tutor_id),
  CONSTRAINT fk_feedback_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_feedback_resolved_by FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_feedback_recipient_tutor FOREIGN KEY (recipient_tutor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS announcements (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title            VARCHAR(200) NOT NULL,
  body             TEXT         NOT NULL,
  priority         ENUM('NORMAL', 'HIGH') NOT NULL DEFAULT 'NORMAL',
  target_audience  ENUM('ALL', 'STUDENT_PARENT', 'TUTOR') NOT NULL DEFAULT 'ALL',
  target_grade     VARCHAR(10) NULL,
  status           ENUM('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'PUBLISHED',
  scheduled_at     DATETIME NULL,
  published_by     INT UNSIGNED NOT NULL,
  updated_by       INT UNSIGNED NULL,
  version          INT UNSIGNED NOT NULL DEFAULT 1,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NULL,
  KEY idx_announcements_audience_status (target_audience, status),
  CONSTRAINT fk_announcements_published_by FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_announcements_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tutor_payouts (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tutor_id      INT UNSIGNED NOT NULL,
  amount        DECIMAL(10,2) NOT NULL,
  note          VARCHAR(255) NULL,
  period_label  VARCHAR(50) NULL,
  paid_by       INT UNSIGNED NOT NULL,
  paid_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tutor_payouts_tutor (tutor_id),
  CONSTRAINT fk_tutor_payouts_tutor FOREIGN KEY (tutor_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tutor_payouts_paid_by FOREIGN KEY (paid_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_log (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  recipient_id  INT UNSIGNED NOT NULL,
  channel       ENUM('EMAIL', 'SMS') NOT NULL,
  type          ENUM('CLASS_REMINDER', 'FEE_DUE', 'LOW_ATTENDANCE', 'ANNOUNCEMENT') NOT NULL,
  message       VARCHAR(500) NOT NULL,
  sent_by       INT UNSIGNED NULL,
  sent_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notification_recipient (recipient_id),
  KEY idx_notification_type (type),
  CONSTRAINT fk_notification_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_sent_by FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
