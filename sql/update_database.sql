-- Student yearly re-registration + real bank payouts for tutors.
-- Run this as root in MySQL Workbench: the app's own DB user has no DDL rights.
-- Safe to run more than once - every step checks before it changes anything.

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

-- MySQL 8 has no "ADD COLUMN IF NOT EXISTS", so each column is checked first.
DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER $$
CREATE PROCEDURE add_column_if_missing(
  IN target_table VARCHAR(64),
  IN target_column VARCHAR(64),
  IN column_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = target_table AND COLUMN_NAME = target_column
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', target_table, '` ADD COLUMN `', target_column, '` ', column_definition);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- users: has this student confirmed next year, and when did they leave
CALL add_column_if_missing('users', 'reregistered_for_year', 'SMALLINT UNSIGNED NULL AFTER grade');
CALL add_column_if_missing('users', 'left_at', 'DATETIME NULL AFTER reregistered_for_year');

-- 'LEFT' is set by the January roll-over; login already requires 'ACTIVE'
ALTER TABLE users
  MODIFY COLUMN status ENUM('ACTIVE', 'SUSPENDED', 'DELETED', 'LEFT') NOT NULL DEFAULT 'ACTIVE';

-- tutor_payouts: where the money went, and whether it actually arrived
CALL add_column_if_missing('tutor_payouts', 'status',
  "ENUM('RECORDED', 'QUEUED', 'SENT', 'FAILED') NOT NULL DEFAULT 'RECORDED' AFTER amount");
CALL add_column_if_missing('tutor_payouts', 'method',
  "VARCHAR(30) NOT NULL DEFAULT 'MANUAL' AFTER status");
CALL add_column_if_missing('tutor_payouts', 'bank_name', 'VARCHAR(100) NULL AFTER method');
CALL add_column_if_missing('tutor_payouts', 'bank_account_holder', 'VARCHAR(150) NULL AFTER bank_name');
CALL add_column_if_missing('tutor_payouts', 'bank_account_last4', 'CHAR(4) NULL AFTER bank_account_holder');
CALL add_column_if_missing('tutor_payouts', 'bank_branch', 'VARCHAR(100) NULL AFTER bank_account_last4');
CALL add_column_if_missing('tutor_payouts', 'provider_reference', 'VARCHAR(100) NULL AFTER bank_branch');
CALL add_column_if_missing('tutor_payouts', 'failure_reason', 'VARCHAR(255) NULL AFTER provider_reference');
CALL add_column_if_missing('tutor_payouts', 'exported_at', 'DATETIME NULL AFTER failure_reason');
CALL add_column_if_missing('tutor_payouts', 'settled_at', 'DATETIME NULL AFTER exported_at');

DROP PROCEDURE IF EXISTS add_column_if_missing;

-- Bell notifications are not emails; 'IN_APP' says so instead of
-- borrowing the EMAIL channel for them.
ALTER TABLE notification_log
  MODIFY COLUMN channel ENUM('EMAIL', 'SMS', 'IN_APP') NOT NULL;

ALTER TABLE notification_log
  MODIFY COLUMN type ENUM('CLASS_REMINDER', 'FEE_DUE', 'LOW_ATTENDANCE', 'ANNOUNCEMENT',
                          'PAYMENT_APPROVED', 'PAYMENT_REJECTED', 'PAYMENT_SUBMITTED', 'PAYOUT_RECORDED',
                          'REREGISTRATION', 'ACCOUNT_CLOSED') NOT NULL;

-- Payouts recorded before this migration predate the transfer workflow, so
-- they stay RECORDED rather than being claimed as sent to a bank.
UPDATE tutor_payouts SET status = 'RECORDED' WHERE status IS NULL;

SELECT 'migration complete' AS result;
