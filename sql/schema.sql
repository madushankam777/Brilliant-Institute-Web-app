-- the database and every table - safe to run again (IF NOT EXISTS)
CREATE DATABASE IF NOT EXISTS brilliant_institute
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- everything below goes into this database
USE brilliant_institute;

-- users - every account: admin, tutor and student / parent
CREATE TABLE IF NOT EXISTS users (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_code          VARCHAR(12)   NULL,
  full_name             VARCHAR(150)  NOT NULL,
  email                 VARCHAR(190)  NOT NULL,
  password_hash         VARCHAR(255)  NOT NULL,
  phone                 VARCHAR(30)   NULL,
  role                  ENUM('STUDENT_PARENT', 'TUTOR', 'ADMIN') NOT NULL DEFAULT 'STUDENT_PARENT',
  status                ENUM('ACTIVE', 'SUSPENDED', 'DELETED', 'LEFT') NOT NULL DEFAULT 'ACTIVE',
  bio                   TEXT NULL,
  grade                 VARCHAR(10) NULL,
  reregistered_for_year SMALLINT UNSIGNED NULL,
  left_at               DATETIME NULL,
  profile_picture_path  VARCHAR(255) NULL,
  bank_name             VARCHAR(100) NULL,
  bank_account_holder   VARCHAR(150) NULL,
  bank_account_number   VARCHAR(34) NULL,
  bank_branch           VARCHAR(100) NULL,
  failed_login_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until          DATETIME NULL,
  last_login_at         DATETIME NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NULL,
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_student_code (student_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- tutor_enrollment_keys - the one-time keys an admin gives a tutor so they can register
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

-- password_reset_tokens - reset codes and links, stored as hashes, each used once
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64)     NOT NULL,
  expires_at  DATETIME     NOT NULL,
  used_at     DATETIME     NULL,
  failed_tries TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reset_token_hash (token_hash),
  KEY idx_reset_user (user_id),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- classes - the classes tutors teach, with day, time, venue, seats and fee
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
  start_date    DATE           NULL,
  capacity      SMALLINT UNSIGNED NOT NULL DEFAULT 20,
  fee           DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  status        ENUM('ACTIVE', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NULL,
  KEY idx_classes_tutor (tutor_id),
  KEY idx_classes_subject_area (subject_area),
  CONSTRAINT fk_classes_tutor FOREIGN KEY (tutor_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- class_sessions - one row per class meeting; holds the 6-digit attendance key
CREATE TABLE IF NOT EXISTS class_sessions (
  id                       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id                 INT UNSIGNED NOT NULL,
  session_date             DATE         NOT NULL,
  start_time               TIME         NULL,
  end_time                 TIME         NULL,
  checkin_code             CHAR(6)      NULL,
  checkin_code_expires_at  DATETIME     NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_session_class_date (class_id, session_date),
  KEY idx_sessions_class (class_id),
  KEY idx_sessions_checkin_code (checkin_code),
  CONSTRAINT fk_sessions_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- enrollments - which student is in which class, with the balance owed
CREATE TABLE IF NOT EXISTS enrollments (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id      INT UNSIGNED NOT NULL,
  class_id        INT UNSIGNED NOT NULL,
  status          ENUM('ACTIVE', 'DROPPED', 'REMOVED') NOT NULL DEFAULT 'ACTIVE',
  payment_status  ENUM('UNPAID', 'PAID') NOT NULL DEFAULT 'UNPAID',
  balance         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  payment_due_at    DATETIME NULL,
  payment_warned_at DATETIME NULL,
  enrolled_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  drop_date       DATETIME NULL,
  UNIQUE KEY uq_enrollment_student_class (student_id, class_id),
  KEY idx_enrollments_class (class_id),
  CONSTRAINT fk_enrollments_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollments_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- attendance_records - one mark (present, late or absent) per student per session
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

-- payments - every fee payment a student makes or an admin records
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

-- receipts - one receipt number for each successful payment
CREATE TABLE IF NOT EXISTS receipts (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id      INT UNSIGNED NOT NULL,
  receipt_number  VARCHAR(50) NOT NULL,
  issued_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_receipts_payment (payment_id),
  UNIQUE KEY uq_receipts_number (receipt_number),
  CONSTRAINT fk_receipts_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- audit_log - who did what and when
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

-- feedback_complaints - tickets from students and tutors, with the replies
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

-- announcements - broadcast messages from the admin
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

-- tutor_payouts - money paid to tutors, with the bank reference
CREATE TABLE IF NOT EXISTS tutor_payouts (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tutor_id      INT UNSIGNED NOT NULL,
  amount        DECIMAL(10,2) NOT NULL,
  status        ENUM('RECORDED', 'QUEUED', 'SENT', 'FAILED') NOT NULL DEFAULT 'RECORDED',
  method        VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
  bank_name           VARCHAR(100) NULL,
  bank_account_holder VARCHAR(150) NULL,
  bank_account_last4  CHAR(4) NULL,
  bank_branch         VARCHAR(100) NULL,
  provider_reference  VARCHAR(100) NULL,
  failure_reason      VARCHAR(255) NULL,
  exported_at   DATETIME NULL,
  settled_at    DATETIME NULL,
  note          VARCHAR(255) NULL,
  period_label  VARCHAR(50) NULL,
  paid_by       INT UNSIGNED NOT NULL,
  paid_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tutor_payouts_tutor (tutor_id),
  CONSTRAINT fk_tutor_payouts_tutor FOREIGN KEY (tutor_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tutor_payouts_paid_by FOREIGN KEY (paid_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A one-time key Admin issues so a student can confirm their place for the
-- next academic year. The January roll-over promotes everyone who used one
-- and closes the accounts of everyone who did not.
CREATE TABLE IF NOT EXISTS student_reregistration_keys (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  key_code        VARCHAR(24)  NOT NULL,
  student_id      INT UNSIGNED NOT NULL,
  from_grade      VARCHAR(10)  NULL,
  to_grade        VARCHAR(10)  NOT NULL,
  academic_year   SMALLINT UNSIGNED NOT NULL,
  status          ENUM('UNUSED', 'USED', 'REVOKED') NOT NULL DEFAULT 'UNUSED',
  expires_at      DATETIME     NULL,
  created_by      INT UNSIGNED NOT NULL,
  used_at         DATETIME     NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rereg_key_code (key_code),
  KEY idx_rereg_student (student_id),
  KEY idx_rereg_status (status),
  CONSTRAINT fk_rereg_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rereg_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per academic year, so the roll-over can never run twice.
CREATE TABLE IF NOT EXISTS yearly_rollover_log (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  academic_year      SMALLINT UNSIGNED NOT NULL,
  promoted_count     INT UNSIGNED NOT NULL DEFAULT 0,
  removed_count      INT UNSIGNED NOT NULL DEFAULT 0,
  graduated_count    INT UNSIGNED NOT NULL DEFAULT 0,
  ran_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rollover_year (academic_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Singleton row (id always 1) - the institute's own receiving details,
-- shown to students during checkout. Editable by Admin only.
CREATE TABLE IF NOT EXISTS payment_settings (
  id                  TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  bank_name           VARCHAR(100) NULL,
  bank_account_name   VARCHAR(150) NULL,
  bank_account_number VARCHAR(34) NULL,
  bank_branch         VARCHAR(100) NULL,
  bank_swift          VARCHAR(20) NULL,
  ez_cash_number      VARCHAR(20) NULL,
  mcash_number        VARCHAR(20) NULL,
  card_bank_name      VARCHAR(100) NULL,
  card_account_name   VARCHAR(150) NULL,
  card_account_number VARCHAR(34) NULL,
  card_bank_branch    VARCHAR(100) NULL,
  updated_by          INT UNSIGNED NULL,
  updated_at          DATETIME NULL,
  CONSTRAINT chk_payment_settings_singleton CHECK (id = 1),
  CONSTRAINT fk_payment_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One cancelled day of a weekly class, or one extra class on a given day
CREATE TABLE IF NOT EXISTS class_events (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id    INT UNSIGNED NOT NULL,
  event_date  DATE NOT NULL,
  type        ENUM('CANCELLED', 'EXTRA') NOT NULL,
  start_time  TIME NULL,
  end_time    TIME NULL,
  venue       VARCHAR(150) NULL,
  note        VARCHAR(255) NULL,
  created_by  INT UNSIGNED NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_class_events_date (event_date),
  KEY idx_class_events_class (class_id),
  CONSTRAINT fk_class_events_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_class_events_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Messages sent from the public Contact Us page
CREATE TABLE IF NOT EXISTS contact_messages (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name   VARCHAR(120) NOT NULL,
  email       VARCHAR(190) NOT NULL,
  phone       VARCHAR(30)  NULL,
  topic       ENUM('ADMISSIONS', 'CLASSES', 'FEES', 'TECHNICAL', 'OTHER') NOT NULL DEFAULT 'OTHER',
  message     TEXT NOT NULL,
  status      ENUM('NEW', 'HANDLED') NOT NULL DEFAULT 'NEW',
  handled_by  INT UNSIGNED NULL,
  handled_at  DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_contact_status (status, created_at),
  CONSTRAINT fk_contact_handled_by FOREIGN KEY (handled_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Uploaded files (profile pictures, bank slips, tutor documents) stored in MySQL
CREATE TABLE IF NOT EXISTS uploaded_files (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id      CHAR(32)     NOT NULL,
  kind           ENUM('PROFILE_PICTURE', 'PAYMENT_RECEIPT', 'TUTOR_DOCUMENT') NOT NULL,
  mime_type      VARCHAR(100) NOT NULL,
  size_bytes     INT UNSIGNED NOT NULL,
  original_name  VARCHAR(255) NULL,
  data           MEDIUMBLOB   NOT NULL,
  uploaded_by    INT UNSIGNED NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_uploaded_files_public_id (public_id),
  KEY idx_uploaded_files_kind (kind),
  CONSTRAINT fk_uploaded_files_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- notification_log - the bell notifications and reminders sent to users
CREATE TABLE IF NOT EXISTS notification_log (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  recipient_id  INT UNSIGNED NOT NULL,
  channel       ENUM('EMAIL', 'SMS', 'IN_APP') NOT NULL,
  type          VARCHAR(40) NOT NULL,
  message       VARCHAR(500) NOT NULL,
  link          VARCHAR(255) NULL,
  sent_by       INT UNSIGNED NULL,
  sent_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dismissed_at  DATETIME NULL,
  read_at       DATETIME NULL,
  emailed_at    DATETIME NULL,
  email_tries   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  KEY idx_notification_recipient (recipient_id),
  KEY idx_notification_type (type),
  KEY idx_notification_email (emailed_at, sent_at),
  KEY idx_notification_unread (recipient_id, read_at),
  CONSTRAINT fk_notification_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_sent_by FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- announcement_dismissals - announcements a user cleared (a newer version shows again)
CREATE TABLE IF NOT EXISTS announcement_dismissals (
  user_id          INT UNSIGNED NOT NULL,
  announcement_id  INT UNSIGNED NOT NULL,
  version          INT UNSIGNED NOT NULL DEFAULT 1,
  dismissed_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, announcement_id),
  CONSTRAINT fk_announcement_dismiss_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_announcement_dismiss_item FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- class_waitlist - students who tried to join a full class; they are told when a seat frees up
CREATE TABLE IF NOT EXISTS class_waitlist (
  class_id     INT UNSIGNED NOT NULL,
  student_id   INT UNSIGNED NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notified_at  DATETIME NULL,
  PRIMARY KEY (class_id, student_id),
  KEY idx_waitlist_student (student_id),
  CONSTRAINT fk_waitlist_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_waitlist_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- announcement_reads - announcements a user has read (an edited announcement counts as unread again)
CREATE TABLE IF NOT EXISTS announcement_reads (
  user_id          INT UNSIGNED NOT NULL,
  announcement_id  INT UNSIGNED NOT NULL,
  version          INT UNSIGNED NOT NULL DEFAULT 1,
  read_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, announcement_id),
  CONSTRAINT fk_announcement_read_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_announcement_read_item FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- feedback_reads - how many messages of a ticket each person has read, and up to where they deleted it
CREATE TABLE IF NOT EXISTS feedback_reads (
  ticket_id     INT UNSIGNED NOT NULL,
  user_id       INT UNSIGNED NOT NULL,
  seen_count    INT UNSIGNED NOT NULL DEFAULT 0,
  hidden_count  INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticket_id, user_id),
  KEY idx_feedback_reads_user (user_id),
  CONSTRAINT fk_feedback_read_ticket FOREIGN KEY (ticket_id) REFERENCES feedback_complaints(id) ON DELETE CASCADE,
  CONSTRAINT fk_feedback_read_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- recent reports an admin removed from the list (the audit log itself is never changed)
CREATE TABLE IF NOT EXISTS report_history_hidden (
  audit_id   BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  hidden_by  INT UNSIGNED NULL,
  hidden_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_report_hidden_audit FOREIGN KEY (audit_id) REFERENCES audit_log(id) ON DELETE CASCADE,
  CONSTRAINT fk_report_hidden_by FOREIGN KEY (hidden_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- signup_codes - sign-up email codes waiting to be typed in (only a hash of the code)
CREATE TABLE IF NOT EXISTS signup_codes (
  email       VARCHAR(190) NOT NULL PRIMARY KEY,
  code_hash   CHAR(64)     NOT NULL,
  tries       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  sent_at     DATETIME     NOT NULL,
  expires_at  DATETIME     NOT NULL,
  KEY idx_signup_codes_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- revoked_sessions - sessions ended with Log out (a hash of the token)
CREATE TABLE IF NOT EXISTS revoked_sessions (
  token_hash  CHAR(64) NOT NULL PRIMARY KEY,
  expires_at  DATETIME NOT NULL,
  KEY idx_revoked_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- cookie_consents - cookie banner choices
CREATE TABLE IF NOT EXISTS cookie_consents (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  choice      ENUM('accepted', 'declined') NOT NULL,
  user_id     INT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cookie_consents_user (user_id),
  CONSTRAINT fk_cookie_consents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
