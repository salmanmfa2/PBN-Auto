-- Schema for the Manajemen Plt./Plh. monitoring module.
-- Run against the same MySQL server used by PBN Cleaner:
-- mysql -u <user> -p < backend/sql/002_create_plt_plh_monitoring.sql

CREATE DATABASE IF NOT EXISTS pbncleaner
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE pbncleaner;

CREATE TABLE IF NOT EXISTS plt_plh_monitoring_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  jabatan_kosong TEXT NOT NULL,
  pejabat_pengganti TEXT NOT NULL,
  jabatan_definitif_pengganti TEXT NOT NULL,
  nomor_surat TEXT NOT NULL,
  tmt DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_plt_plh_records_tmt (tmt),
  INDEX idx_plt_plh_records_active_tmt (is_active, tmt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- This module currently uses one shared edit password, as requested.
-- The password is stored as plain text in this table and is not an account password.
CREATE TABLE IF NOT EXISTS plt_plh_edit_password (
  id TINYINT UNSIGNED NOT NULL,
  edit_password VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_plt_plh_edit_password_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed the initial password only when the singleton setting does not exist.
-- Re-running this script will not overwrite a password changed directly in MySQL.
INSERT INTO plt_plh_edit_password (id, edit_password)
VALUES (1, '3154')
ON DUPLICATE KEY UPDATE id = VALUES(id);

-- Tenure and status are derived from TMT at query time so they stay current.
-- Boundaries: under 5 completed months = Aktif; 5 to under 6 = Mendekati 6 Bulan;
-- 6 completed months or more = Lebih dari 6 Bulan. Deactivated records are Inaktif.
CREATE OR REPLACE VIEW v_plt_plh_monitoring_records AS
SELECT
  records.id,
  records.jabatan_kosong,
  records.pejabat_pengganti,
  records.jabatan_definitif_pengganti,
  records.nomor_surat,
  records.tmt,
  FLOOR(TIMESTAMPDIFF(MONTH, records.tmt, CURDATE()) / 12) AS masa_kerja_tahun,
  MOD(TIMESTAMPDIFF(MONTH, records.tmt, CURDATE()), 12) AS masa_kerja_bulan,
  CONCAT(
    FLOOR(TIMESTAMPDIFF(MONTH, records.tmt, CURDATE()) / 12),
    ' Y ',
    MOD(TIMESTAMPDIFF(MONTH, records.tmt, CURDATE()), 12),
    ' M'
  ) AS masa_kerja,
  CASE
    WHEN records.is_active = FALSE THEN 'Inaktif'
    WHEN TIMESTAMPDIFF(MONTH, records.tmt, CURDATE()) < 5 THEN 'Aktif'
    WHEN TIMESTAMPDIFF(MONTH, records.tmt, CURDATE()) < 6 THEN 'Mendekati 6 Bulan'
    ELSE 'Lebih dari 6 Bulan'
  END AS status,
  records.is_active,
  records.created_at,
  records.updated_at
FROM plt_plh_monitoring_records AS records;

-- Rows for the home/dashboard notification section.
CREATE OR REPLACE VIEW v_plt_plh_monitoring_notifications AS
SELECT *
FROM v_plt_plh_monitoring_records
WHERE status IN ('Mendekati 6 Bulan', 'Lebih dari 6 Bulan');
 -- 