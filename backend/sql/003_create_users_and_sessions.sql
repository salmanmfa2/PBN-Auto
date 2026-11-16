-- Persistent application accounts and login sessions.
-- Run against the same MySQL server used by PBN Cleaner:
-- mysql -u <user> -p < backend/sql/003_create_users_and_sessions.sql

CREATE DATABASE IF NOT EXISTS pbncleaner
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE pbncleaner;

CREATE TABLE IF NOT EXISTS users (
  `user` VARCHAR(80) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  auth_level TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `password` VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user`),
  CONSTRAINT chk_users_auth_level CHECK (auth_level IN (1, 2, 3, 4))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
  id CHAR(36) NOT NULL,
  `user` VARCHAR(80) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_sessions_token_hash (token_hash),
  INDEX idx_user_sessions_user (`user`),
  CONSTRAINT fk_user_sessions_user
    FOREIGN KEY (`user`) REFERENCES users (`user`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_preferences (
  `user` VARCHAR(80) NOT NULL,
  theme VARCHAR(10) NOT NULL DEFAULT 'default',
  PRIMARY KEY (`user`),
  CONSTRAINT fk_user_preferences_user
    FOREIGN KEY (`user`) REFERENCES users (`user`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- First Super Admin is intentionally not seeded with a default credential.
-- After creating the tables, insert your own account directly in SQL:
-- INSERT INTO users (`user`, `name`, auth_level, `password`)
-- VALUES ('your-login', 'Your Name', 3, 'your-chosen-password');
-- The account 'salmanmfa' is promoted to Level 4 by app startup migration.
