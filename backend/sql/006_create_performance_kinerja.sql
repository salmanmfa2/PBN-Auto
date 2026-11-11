-- Active quarterly employee performance dataset and its imported values.
-- Previous quarters are replaced rather than retained.

USE pbncleaner;

CREATE TABLE IF NOT EXISTS performance_kinerja_datasets (
  id INT NOT NULL,
  period VARCHAR(7) NOT NULL,
  row_count INT NOT NULL DEFAULT 0,
  uploaded_at DATETIME NOT NULL,
  uploaded_by_user VARCHAR(80) NOT NULL,
  uploaded_by_name VARCHAR(200) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS performance_kinerja_records (
  nip VARCHAR(18) NOT NULL,
  dataset_id INT NOT NULL,
  nama TEXT NOT NULL,
  unit_eselon_ii VARCHAR(255) NOT NULL DEFAULT 'Unidentified',
  eselon VARCHAR(255) NOT NULL DEFAULT 'Unidentified',
  unit_eselon_iii VARCHAR(255) NOT NULL DEFAULT 'Unidentified',
  nhk DECIMAL(18,8) NULL,
  npk DECIMAL(18,8) NULL,
  nhk_kalibrasi DECIMAL(18,8) NULL,
  npk_kalibrasi DECIMAL(18,8) NULL,
  nkp_awal DECIMAL(18,8) NULL,
  rating_hasil_kerja_awal TEXT NULL,
  rating_perilaku_kerja_awal TEXT NULL,
  predikat_kinerja_awal TEXT NULL,
  nilai_hukuman_disiplin DECIMAL(18,8) NULL,
  nilai_dampak_pelanggaran_disiplin DECIMAL(18,8) NULL,
  nilai_dampak_perilaku DECIMAL(18,8) NULL,
  nilai_koreksi DECIMAL(18,8) NULL,
  nko DECIMAL(18,8) NULL,
  nkp_akhir DECIMAL(18,8) NULL,
  rating_hasil_kerja TEXT NULL,
  rating_perilaku_kerja TEXT NULL,
  predikat_kinerja TEXT NULL,
  PRIMARY KEY (nip),
  INDEX ix_performance_kinerja_records_dataset_id (dataset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS performance_kinerja_insights (
  id INT NOT NULL,
  content TEXT NOT NULL,
  updated_at DATETIME NOT NULL,
  updated_by_user VARCHAR(80) NOT NULL,
  updated_by_name VARCHAR(200) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
