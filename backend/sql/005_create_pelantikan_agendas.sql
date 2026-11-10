-- Persistent agenda history and employee lookup snapshots for Undangan Pelantikan.
-- The original Excel and generated DOCX/ZIP files are not stored.

USE pbncleaner;

CREATE TABLE IF NOT EXISTS pelantikan_agendas (
  id VARCHAR(36) NOT NULL,
  created_by VARCHAR(80) NOT NULL,
  tanggal_pelantikan DATE NOT NULL,
  nd_undangan_pelantikan VARCHAR(255) NOT NULL,
  tanggal_nd_undangan_pelantikan DATE NOT NULL,
  jam_pelantikan VARCHAR(40) NOT NULL,
  dresscode VARCHAR(1000) NOT NULL,
  level_jabatan VARCHAR(255) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  uploaded_filename VARCHAR(255) NULL,
  uploaded_sheet VARCHAR(255) NULL,
  last_generated_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  INDEX ix_pelantikan_agendas_created_by (created_by),
  CONSTRAINT chk_pelantikan_agendas_status
    CHECK (status IN ('draft', 'ready', 'generated')),
  CONSTRAINT fk_pelantikan_agendas_user
    FOREIGN KEY (created_by) REFERENCES users (`user`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pelantikan_agenda_people (
  id INT NOT NULL AUTO_INCREMENT,
  agenda_id VARCHAR(36) NOT NULL,
  row_number INT NOT NULL,
  source_no TEXT NULL,
  source_nama_nip TEXT NULL,
  source_jabatan_saat_ini TEXT NULL,
  source_usul_jabatan_baru TEXT NULL,
  nip VARCHAR(32) NULL,
  nama TEXT NOT NULL,
  jabatan TEXT NOT NULL,
  unit_eselon_ii TEXT NOT NULL,
  eselon VARCHAR(32) NULL,
  lookup_status VARCHAR(24) NOT NULL,
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  modality VARCHAR(8) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pelantikan_agenda_people_row (agenda_id, row_number),
  INDEX ix_pelantikan_agenda_people_agenda_id (agenda_id),
  INDEX ix_pelantikan_agenda_people_nip (nip),
  CONSTRAINT chk_pelantikan_agenda_people_lookup
    CHECK (lookup_status IN ('matched', 'not_found', 'missing_nip', 'duplicate')),
  CONSTRAINT chk_pelantikan_agenda_people_modality
    CHECK (modality IS NULL OR modality IN ('daring', 'luring')),
  CONSTRAINT fk_pelantikan_agenda_people_agenda
    FOREIGN KEY (agenda_id) REFERENCES pelantikan_agendas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
