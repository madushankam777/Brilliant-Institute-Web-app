USE brilliant_institute;

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

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE users ADD COLUMN reregistered_for_year SMALLINT UNSIGNED NULL AFTER grade', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'reregistered_for_year');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

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

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE classes ADD COLUMN start_date DATE NULL AFTER end_time', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'classes' AND COLUMN_NAME = 'start_date');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- payment methods the admin switches on (e.g. 'BANK_TRANSFER,CARD')
SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE payment_settings ADD COLUMN enabled_methods VARCHAR(100) NULL AFTER mcash_number', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_settings' AND COLUMN_NAME = 'enabled_methods');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 'LEFT' is set by the January roll-over; login already requires 'ACTIVE'
ALTER TABLE users
  MODIFY COLUMN status ENUM('ACTIVE', 'SUSPENDED', 'DELETED', 'LEFT') NOT NULL DEFAULT 'ACTIVE';

-- Bell notifications are not emails
ALTER TABLE notification_log
  MODIFY COLUMN channel ENUM('EMAIL', 'SMS', 'IN_APP') NOT NULL;

ALTER TABLE notification_log
  MODIFY COLUMN type ENUM('CLASS_REMINDER', 'FEE_DUE', 'LOW_ATTENDANCE', 'ANNOUNCEMENT',
                          'PAYMENT_APPROVED', 'PAYMENT_REJECTED', 'PAYMENT_SUBMITTED', 'PAYOUT_RECORDED',
                          'REREGISTRATION', 'ACCOUNT_CLOSED') NOT NULL;

SELECT 'database update complete' AS result;
