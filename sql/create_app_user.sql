-- =============================================================================
-- Brilliant Institute - creates the least-privilege MySQL account the app
-- itself connects as (DB_USER / DB_PASSWORD in server/.env).
--
-- Run this once, as an admin/root user, AFTER sql/schema.sql has created the
-- brilliant_institute database and its tables:
--   mysql -u root -p < sql/schema.sql
--   mysql -u root -p < sql/create_app_user.sql   (after editing the password below)
--
-- The app account only gets SELECT/INSERT/UPDATE/DELETE on this one
-- database - never ALL PRIVILEGES and never access to other databases -
-- so that even a full SQL-injection-style compromise of the app can't drop
-- tables, create new users, or touch any other database on the server.
-- =============================================================================

CREATE USER IF NOT EXISTS 'brilliant_app_user'@'localhost'
  IDENTIFIED BY 'REPLACE_WITH_A_STRONG_PASSWORD';

GRANT SELECT, INSERT, UPDATE, DELETE ON brilliant_institute.* TO 'brilliant_app_user'@'localhost';

FLUSH PRIVILEGES;
