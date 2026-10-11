-- update an existing database - run once as root in MySQL Workbench; safe to run again
USE brilliant_institute;

-- student_reregistration_keys - one-time keys that let a returning student confirm next year's place
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

-- yearly_rollover_log - one row per academic year, so the January roll-over never runs twice
CREATE TABLE IF NOT EXISTS yearly_rollover_log (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  academic_year      SMALLINT UNSIGNED NOT NULL,
  promoted_count     INT UNSIGNED NOT NULL DEFAULT 0,
  removed_count      INT UNSIGNED NOT NULL DEFAULT 0,
  graduated_count    INT UNSIGNED NOT NULL DEFAULT 0,
  ran_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rollover_year (academic_year)
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

-- New columns. MySQL 8 has no "ADD COLUMN IF NOT EXISTS", so each one checks
-- information_schema first and runs a harmless SELECT if it already exists.

-- users.reregistered_for_year - the year the student confirmed their place
SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE users ADD COLUMN reregistered_for_year SMALLINT UNSIGNED NULL AFTER grade', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'reregistered_for_year');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- users.left_at - when the student left the institute
SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE users ADD COLUMN left_at DATETIME NULL AFTER reregistered_for_year', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'left_at');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- payouts made before this update get the plain 'RECORDED' status
SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE tutor_payouts
     ADD COLUMN status ENUM(''RECORDED'', ''QUEUED'', ''SENT'', ''FAILED'') NOT NULL DEFAULT ''RECORDED'' AFTER amount,
     ADD COLUMN method VARCHAR(30) NOT NULL DEFAULT ''MANUAL'' AFTER status,
     ADD COLUMN bank_name VARCHAR(100) NULL AFTER method,
     ADD COLUMN bank_account_holder VARCHAR(150) NULL AFTER bank_name,
     ADD COLUMN bank_account_last4 CHAR(4) NULL AFTER bank_account_holder,
     ADD COLUMN bank_branch VARCHAR(100) NULL AFTER bank_account_last4,
     ADD COLUMN provider_reference VARCHAR(100) NULL AFTER bank_branch,
     ADD COLUMN failure_reason VARCHAR(255) NULL AFTER provider_reference,
     ADD COLUMN exported_at DATETIME NULL AFTER failure_reason,
     ADD COLUMN settled_at DATETIME NULL AFTER exported_at', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tutor_payouts' AND COLUMN_NAME = 'status');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- classes.start_date - the first class date
SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE classes ADD COLUMN start_date DATE NULL AFTER end_time', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'classes' AND COLUMN_NAME = 'start_date');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 'LEFT' is set by the January roll-over; login already requires 'ACTIVE'
ALTER TABLE users
  MODIFY COLUMN status ENUM('ACTIVE', 'SUSPENDED', 'DELETED', 'LEFT') NOT NULL DEFAULT 'ACTIVE';

-- Bell notifications are not emails
ALTER TABLE notification_log
  MODIFY COLUMN channel ENUM('EMAIL', 'SMS', 'IN_APP') NOT NULL;

-- notification kinds are plain text now, so a new kind never needs another update
ALTER TABLE notification_log
  MODIFY COLUMN type VARCHAR(40) NOT NULL;

-- notification bell: where a click takes you, and "cleared" that follows you to every device
SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE notification_log ADD COLUMN link VARCHAR(255) NULL AFTER message', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_log' AND COLUMN_NAME = 'link');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE notification_log ADD COLUMN dismissed_at DATETIME NULL AFTER sent_at', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_log' AND COLUMN_NAME = 'dismissed_at');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- announcements a user cleared (one row per user and announcement; a newer version shows again)
CREATE TABLE IF NOT EXISTS announcement_dismissals (
  user_id          INT UNSIGNED NOT NULL,
  announcement_id  INT UNSIGNED NOT NULL,
  version          INT UNSIGNED NOT NULL DEFAULT 1,
  dismissed_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, announcement_id),
  CONSTRAINT fk_announcement_dismiss_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_announcement_dismiss_item FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- pay-by time for a new enrolment (unpaid places are released then), and when the 2-day warning went out
SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE enrollments ADD COLUMN payment_due_at DATETIME NULL AFTER balance', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrollments' AND COLUMN_NAME = 'payment_due_at');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE enrollments ADD COLUMN payment_warned_at DATETIME NULL AFTER payment_due_at', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrollments' AND COLUMN_NAME = 'payment_warned_at');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- students who tried to join a full class - they are told when a seat frees up
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

-- every bell notification is emailed too - when the email went out, and how many tries failed
SET @add_email = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_log' AND COLUMN_NAME = 'emailed_at');
SET @ddl = IF(@add_email,
  'ALTER TABLE notification_log ADD COLUMN emailed_at DATETIME NULL AFTER dismissed_at, ADD COLUMN email_tries TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER emailed_at, ADD KEY idx_notification_email (emailed_at, sent_at)',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- older notifications are not emailed now (only the first time this runs)
SET @ddl = IF(@add_email, 'UPDATE notification_log SET emailed_at = sent_at WHERE id > 0 AND sent_at <= NOW()', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- shows that the script finished
SELECT 'database update complete' AS result;
