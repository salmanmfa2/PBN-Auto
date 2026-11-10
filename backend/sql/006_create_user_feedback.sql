-- Persistent user feedback submissions for the Admin workspace.
-- Run against the same MySQL database used by PBN Cleaner.

CREATE DATABASE IF NOT EXISTS pbncleaner
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE pbncleaner;

CREATE TABLE IF NOT EXISTS user_feedback (
  id INT NOT NULL AUTO_INCREMENT,
  submitted_by VARCHAR(80) NULL,
  menu VARCHAR(100) NOT NULL,
  feedback TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX ix_user_feedback_created_at (created_at),
  INDEX ix_user_feedback_submitted_by (submitted_by),
  CONSTRAINT fk_user_feedback_user
    FOREIGN KEY (submitted_by) REFERENCES users (`user`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
