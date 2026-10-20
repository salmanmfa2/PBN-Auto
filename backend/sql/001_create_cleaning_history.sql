-- MySQL schema for PBNCleaner cleaning history
-- Run with: mysql -u <user> -p < backend/sql/001_create_cleaning_history.sql

CREATE DATABASE IF NOT EXISTS pbncleaner
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE pbncleaner;

CREATE TABLE IF NOT EXISTS cleaning_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset_id VARCHAR(64) NOT NULL,
  sheet_name VARCHAR(255) NULL,
  action VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'success',
  rows_before INT NULL,
  rows_after INT NULL,
  columns_before INT NULL,
  columns_after INT NULL,
  detail_json JSON NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_cleaning_history_dataset (dataset_id),
  INDEX idx_cleaning_history_action (action),
  INDEX idx_cleaning_history_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dataset_runs (
  dataset_id VARCHAR(64) NOT NULL,
  run_name VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (dataset_id),
  INDEX idx_dataset_runs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dataset_files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset_id VARCHAR(64) NOT NULL,
  version_number INT UNSIGNED NOT NULL DEFAULT 1,
  file_role VARCHAR(16) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(100) NULL,
  file_size_bytes BIGINT UNSIGNED NULL,
  storage_path VARCHAR(1024) NOT NULL,
  google_drive_file_id VARCHAR(255) NULL,
  google_drive_web_url VARCHAR(1024) NULL,
  google_drive_folder_id VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100) NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dataset_files_drive_file (google_drive_file_id),
  UNIQUE KEY uq_dataset_files_version (dataset_id, version_number),
  INDEX idx_dataset_files_dataset (dataset_id),
  INDEX idx_dataset_files_active (dataset_id, is_deleted, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
