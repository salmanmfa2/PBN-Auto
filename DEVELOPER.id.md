# Panduan Pengembang

Dokumen ini membantu kontributor baru—terutama pengembang pemula—memahami bagian yang perlu diubah, struktur proyek, dan tugas pengembangan yang umum.

## Gambaran Umum

- **Tujuan**: Platform pengelolaan data modular. Fase pertama berfokus pada pembersihan dataset PBN. Fase berikutnya direncanakan mencakup pembuatan tautan dan modul analitik. Backend menggunakan FastAPI (Python), sedangkan frontend menggunakan React 19, Vite, dan React Router (TypeScript).
- **Arsitektur**: Routing modular berbasis halaman menggunakan React Router v7. Setiap fitur utama memiliki rute sendiri di `frontend/src/pages/`, dengan hook dan layanan bersama.

## Mulai Cepat (Lokal)

- Backend:
  - Buat dan aktifkan Python virtual environment di `backend/`.
  - Pasang dependensi: `pip install -r requirements.txt`.
  - Jalankan server pengembangan: `python run_server.py` (mendeteksi port kosong secara otomatis).
  - Health check: `GET http://localhost:8000/health`.
- Frontend:
  - Dari `frontend/`, jalankan `npm install`, kemudian `npm run dev` untuk pengembangan atau `npm run build` untuk build produksi.
  - Rute tersedia di `http://localhost:5173/`, `/pbn-analytics`, `/menu-builder`, dan `/insights`.
- Menjalankan aplikasi lokal dengan satu klik:
  - Klik dua kali `run-app-testing.bat` dari direktori utama proyek (menjalankan backend dan frontend dengan auto-reload).
- Menjalankan aplikasi di jaringan dengan satu klik:
  - Klik dua kali `run-app.bat` dari direktori utama proyek (menggunakan host dan port di `config.json`).
  - Jika diperlukan, sajikan frontend hasil build dengan `serve-frontend.ps1`.

## Struktur Repositori (File Penting)

- `backend/` — aplikasi FastAPI
  - `main.py` — entry point aplikasi dan pendaftaran router.
  - `run_server.py` — launcher Uvicorn dengan deteksi port dinamis (mencari port kosong mulai dari 8000).
  - `app/api/cleaning.py` — endpoint pembersihan (auto-clean, hapus kolom, ganti nama, hapus duplikat, hapus baris, dan pengaturan header).
  - `app/api/insights.py` — endpoint dashboard PBN; permintaan filter menghitung ulang agregat dari seluruh dataset.
  - `app/services/dataset_service.py` — logika DataFrame utama. Mengarahkan proses ke cleaner programatis atau membaca file aturan teks lama.
  - `app/services/pbn_dashboard_service.py` — memvalidasi kolom dashboard yang sudah dibersihkan, menerapkan filter, dan menghitung jumlah pegawai serta distribusi grafik.
  - `app/cleaners/` — modul cleaner programatis:
    - `pbn.py`, `pbn_edu.py`, `pbn_edu_hb.py`, `sitasi_esiii.py`, `sitasi_esiv.py` — masing-masing mengembalikan konfigurasi pembersihan.
  - `app/storage/dataset_store.py` — penyimpanan dataset dalam memori (UUID -> sheets). Data bersifat sementara dan akan hilang saat server dimulai ulang.
  - `app/history_db.py` — koneksi dan sesi SQLAlchemy MySQL untuk riwayat pembersihan.
  - `app/models/cleaning_history.py` — model SQLAlchemy untuk tabel riwayat pembersihan.
  - `app/schemas/pbn_dashboard.py` — skema permintaan filter dashboard.
  - `app/services/history_service.py` — helper pencatatan dan pengambilan riwayat pembersihan.
  - `Cleaning Logic/` — direktori file aturan teks (fallback lama; utamakan cleaner programatis).
  - `sql/001_create_cleaning_history.sql` — skrip inisialisasi MySQL untuk database dan tabel.

- `frontend/` — aplikasi React + Vite dengan React Router
  - `src/pages/` — komponen halaman untuk setiap rute:
    - `LandingPage.tsx` — halaman utama dengan pilihan fitur (rute `/`).
    - `AnalyticsPage.tsx` — antarmuka pembersihan dataset PBN (rute `/pbn-analytics`).
    - `MenuBuilderPage.tsx` — placeholder pembuat tautan (rute `/menu-builder`).
    - `InsightHubPage.tsx` — dashboard interaktif PBN Open + Edu + HB (rute `/insights`).
  - `src/App.tsx` — definisi rute React Router (tidak menampilkan UI; hanya mengatur routing).
  - `src/main.tsx` — entry point frontend yang membungkus App dengan `<BrowserRouter>`.
  - `src/hooks/useDataset.ts` — aksi dataset tingkat tinggi dan panggilan API yang digunakan UI.
  - `src/services/api.ts` — fungsi pembungkus HTTP untuk endpoint backend.
  - `src/features/cleaning/DataTable.tsx` — komponen tabel untuk halaman; menangani pagination, filter, dan pengurutan.
  - `src/pages/InsightHubPage.tsx` — kontrol dan grafik distribusi dashboard; menerima ID dataset dan nama sheet melalui URL.

- `config.json` — konfigurasi deployment terpusat (IP, port, dan origin CORS), dibaca oleh backend dan skrip PowerShell.

## Aturan Auto-Clean: Cara Kerja dan Penambahan Mode

- File aturan berada di `backend/Cleaning Logic/`. Setiap file berisi deskripsi teks sederhana. Parser mendukung direktif berikut:
  - `Skiprows : N` — menghapus N baris pertama sebelum pemrosesan.
  - `Delete Column : 1,2,5-10` — kolom yang dihapus berdasarkan posisi mulai dari 1; rentang dengan `-` dan daftar dengan koma didukung.
  - `Rows to be Deletd  : if Null in Column X` — menghapus baris jika kolom X bernilai null.
  - `Col <N> -> New Name` — petunjuk penggantian nama kolom berdasarkan posisi jika pembacaan header bermasalah.

- Untuk menambahkan mode auto-clean (disarankan menggunakan cleaner programatis):
  1. Buat modul baru di `backend/app/cleaners/mymode.py` (salin struktur dari `pbn.py`). Kembalikan dictionary dengan kunci `skiprows`, `delete_positions`, dan `rename_columns`.
  2. Impor dan daftarkan modul di `backend/app/cleaners/__init__.py` dalam mapping `CLEANER_MODULES`.
  3. Mode tersebut akan tersedia otomatis di routing backend melalui `dataset_service.py`.
  4. Tambahkan nama mode ke dropdown di `frontend/src/pages/AnalyticsPage.tsx` (cari `<select>` pada bagian "Auto Clean").
  5. Uji dengan mengunggah file dan memilih mode baru dari dropdown.

  **Pilihan file teks lama:** Jika memilih aturan teks, tambahkan file di `backend/Cleaning Logic/` dan petakan melalui `_load_auto_clean_rules()` di `backend/app/services/dataset_service.py`. Cleaner programatis lebih disarankan karena lebih jelas dan efisien.

## Template Ekspor PowerPoint

- Pembuatan PPT ditangani oleh `backend/app/services/powerpoint_service.py`.
- File template berada di `backend/templates/`:
  - `template.pptx` — tata letak Sitasi Es.III
  - `template_es4.pptx` — tata letak Sitasi Es.IV
- Layanan memilih template berdasarkan `mode` yang dipilih dan menyusun ulang baris berdasarkan struktur tabel dalam template.
- Template Es.IV dirancang untuk 6 baris data per slide ditambah satu baris header. Menggunakan struktur Es.III sebelumnya akan membuat hasil ekspor tidak sesuai.
- Jika template diubah, pastikan jumlah kolom dan rumus jumlah baris di exporter tetap sesuai desain.

## Pemetaan Ekspor Es.IV

- `No` -> `index`
- `Nama/NIP` -> `Nama/NIP`
- `Usia` -> `Usia`
- `Gol` -> `Pangkat/Gol/TMT`
- `Jabatan Saat Ini` -> `Jabatan Lama`
- `TMT (Lama Jab)` -> `TMT Jabatan Lama`
- `Usul Jabatan Baru` -> `Jabatan Baru`
- `Homebase, Tour of Area` -> `Tour of Area`
- Tabel slide mengharapkan 8 kolom dan 7 baris total (header + 6 profil).

## Perilaku Parser dan Titik Ekstensi

- Parser di `dataset_service.py` mengembalikan dictionary berisi `skiprows`, `delete_positions` (daftar integer), `delete_rows_null_columns` (daftar posisi kolom), dan `rename_columns` (posisi -> nama). Layanan kemudian:
  - Menerapkan `skiprows` dengan memotong DataFrame.
  - Menghapus baris yang memiliki nilai null pada kolom yang ditentukan.
  - Mengganti nama kolom berdasarkan posisinya.
  - Menghapus kolom berdasarkan posisinya.
- Untuk menambahkan direktif (misalnya memangkas spasi atau mengubah tipe data), perluas `_load_auto_clean_rules` untuk membaca direktif baru, lalu perbarui `apply_auto_clean` agar menerapkannya.

## Database Riwayat Pembersihan

- Setiap aksi pembersihan dicatat ke MySQL oleh `backend/app/api/cleaning.py`.
- Metadata yang disimpan mencakup ID dataset, aksi, status, jumlah baris dan kolom sebelum dan sesudah proses, serta detail permintaan.
- Endpoint riwayat: `GET /clean/history/{dataset_id}?limit=100`.
- Konfigurasikan MySQL melalui `backend/.env` (template: `backend/.env.example`).

## Dashboard PBN Open + Edu + HB

- Di PBN Analytics, terapkan metode pembersihan `PBN Open + Edu + HB`, lalu pilih **Open Dashboard**. Tautan meneruskan ID dataset aktif dan nama sheet terpilih ke `/insights`.
- `POST /insights/pbn/dashboard/{dataset_id}?sheet_name=...` menerima filter opsional `age_min`, `age_max`, `tenure_min`, `tenure_max`, `eselon`, `education`, `region`, `unit`, dan `rumpun`. Daftar kategori kosong berarti “semua”.
- `POST /insights/pbn/dashboard/{dataset_id}/people?sheet_name=...` menerapkan filter yang sama dan mengembalikan baris pegawai yang sesuai untuk popup **View table**.
- Layanan dashboard menghitung agregat dari seluruh DataFrame dalam memori (bukan hanya pratinjau 500 baris) setiap kali filter berubah. Daftar Eselon atau pendidikan yang kosong berarti “semua”.
- Kolom keluaran yang diperlukan adalah `Sex`, `Usia (th.)`, `TMT Jabatan`, `Eselon`, `Pendidikan Terakhir (Short)`, `Rumpun Pdd Terakhir`, `Region Homebase`, `Unit Eselon II`, dan `Agama`. Pencocokan header mengabaikan kapitalisasi dan tanda baca.
- Cleaner mempertahankan nilai `TMT Jabatan` apa adanya. Dashboard mem-parsing nilai (termasuk teks tanggal dengan apostrof di depan) untuk menghitung masa jabatan tanpa mengubah data hasil pembersihan. Masa jabatan dihitung dalam tahun kalender penuh hingga tanggal saat ini. Baris dengan usia/TMT kosong tetap disertakan pada tampilan rentang penuh dan dikecualikan jika rentang terkait dipersempit.
- Popup menampilkan `index`, `Nama`, `Eselon`, `Jabatan`, `Pendidikan Terakhir (Th.)`, `Jurusan`, dan `Universitas/Sekolah Tinggi`; `Pendidikan Terakhir (Short)` digunakan jika header pendidikan yang diminta tidak tersedia.

## Arsitektur Frontend untuk Pengembang Pemula

- Aplikasi menggunakan **React Router v7** dengan setiap halaman sebagai komponen rute terpisah di `src/pages/`.
- Pratinjau tabel di `AnalyticsPage` menggunakan `@tanstack/react-table`. Hal penting:
  - `pageIndex` dan `pageSize` harus dicatat dalam state komponen dan disinkronkan dengan tabel melalui `onPaginationChange` agar nilainya tidak ter-reset.
  - Pratinjau tabel hanya memuat N baris pertama (server menggunakan `PREVIEW_LIMIT` = 500) agar antarmuka tetap responsif.
- **Navigasi:** Gunakan hook `useNavigate()` dari React Router untuk berpindah rute. Contoh:
  ```tsx
  const navigate = useNavigate();
  navigate('/pbn-analytics');
  ```
- **State dan API:** Hook `useDataset.ts` mengelola seluruh state dataset dan mengatur panggilan API. Untuk menambahkan halaman fitur:
  1. Buat komponen halaman baru di `src/pages/MyFeaturePage.tsx`.
  2. Impor hook `useDataset` untuk mengakses state dan aksi dataset.
  3. Tambahkan rute di `src/App.tsx`.
  4. Jika memerlukan endpoint baru, tambahkan ke `src/services/api.ts` dan hubungkan ke `useDataset.ts`.

## Tips Pengujian dan Debugging

- Reproduksi permintaan API secara lokal menggunakan curl/Postman atau UI. Endpoint utama:
  - `POST /upload` — unggah file (form multipart `file`).
  - `POST /clean/apply-auto-clean` — body: `{"dataset_id": "...", "mode": "Sitasi Es.IV", "sheet_name": "Sheet1"}`.
  - `GET /dataset/{dataset_id}` — mengambil pratinjau.
  - `GET /health` — health check.
- Jika perubahan pada layanan backend menyebabkan error, FastAPI akan mengembalikan status 422/500 beserta pesan `detail`. Frontend menampilkan pesan tersebut sebagai banner error.

## Catatan Persistensi dan Produksi

- Saat ini `DatasetStore` berjalan di memori; data akan hilang ketika server dimulai ulang. Untuk produksi, ganti `DatasetStore` dengan penyimpanan persisten (S3, database, atau disk lokal).

## Lokasi Perubahan untuk Tugas Umum

- **Menambahkan modul/fitur baru:**
  1. Buat komponen halaman di `frontend/src/pages/YourFeaturePage.tsx`.
  2. Tambahkan rute di `frontend/src/App.tsx` di dalam `<Routes>`.
  3. Hubungkan halaman melalui `frontend/src/pages/LandingPage.tsx` menggunakan `useNavigate()`.
  4. Buat endpoint backend di `backend/app/api/` jika diperlukan.
  5. Tambahkan fungsi API di `frontend/src/services/api.ts`.
  6. Hubungkan UI ke API melalui `frontend/src/hooks/useDataset.ts` (atau buat hook baru).

- **Menambah/mengubah aturan auto-clean:**
  - Untuk aturan sederhana: tambahkan file teks di `backend/Cleaning Logic/` dan petakan di `backend/app/services/dataset_service.py`.
  - Untuk logika kompleks: buat modul di `backend/app/cleaners/` (ikuti pola `pbn.py`), daftarkan di `backend/app/cleaners/__init__.py`, lalu petakan di `backend/app/services/dataset_service.py`.

- **Mengubah perilaku API:**
  - Handler: `backend/app/api/cleaning.py` (logika endpoint).
  - Logika bisnis: `backend/app/services/dataset_service.py` (operasi DataFrame dan routing mode).

- **Mengubah routing atau navigasi:**
  - Rute: `frontend/src/App.tsx`.
  - Landing/beranda: `frontend/src/pages/LandingPage.tsx` (ubah kartu fitur atau tambahkan tautan).
  - Navigasi dalam halaman: gunakan hook `useNavigate()`.

- **Mengubah tampilan tabel/pagination:**
  - `frontend/src/features/cleaning/DataTable.tsx` (mengatur tabel TanStack Table, pagination, filter, dan pengurutan).

## Perintah Cepat

- Server backend (dengan deteksi port otomatis):
```
cd backend
python -m venv .venv
\.venv\Scripts\activate    # Windows
pip install -r requirements.txt
python run_server.py       # Auto-finds free port starting from 8000
```
- Server frontend pengembangan (dengan HMR dan auto-reload):
```
cd frontend
npm install
npm run dev                # Opens at http://localhost:5173
```
- Deployment jaringan (membaca IP/port dari config.json):
```
run-app-testing.bat        # Local dev (backend with --reload)
run-app.bat                # Network deployment (configure config.json first)
```
- Pemeriksaan build:
```
cd frontend
npm run build              # TypeScript check + Vite build to dist/
```

## Jika Mengalami Kendala

- Periksa log `backend` untuk stack trace FastAPI (error muncul di terminal tempat `python run_server.py` dijalankan).
- Gunakan network devtools browser untuk melihat request dan response yang tepat (DevTools > Network).
- Periksa state dan props komponen menggunakan React DevTools (pasang ekstensi React DevTools).
- Cari informasi tentang:
  - Rute aktif (lihat `frontend/src/App.tsx`).
  - Mode auto-clean yang tersedia di dropdown (lihat `frontend/src/pages/AnalyticsPage.tsx`).
  - Detail endpoint API (lihat handler di `backend/app/api/` dan fungsi pembungkus di `frontend/src/services/api.ts`).

---

## Langkah Berikutnya dan Modul Mendatang

**Fase saat ini (1):** PBN Analytics ✅ Aktif

**Fase 2 (akan datang):** Secure Link Builder
- Rute: `/menu-builder`
- Halaman placeholder tersedia di `frontend/src/pages/MenuBuilderPage.tsx`
- Memerlukan endpoint backend untuk CRUD tautan
- Memerlukan integrasi database (PostgreSQL)

**Fase 3:** Insights Hub
- Rute: `/insights`
- Dashboard PBN Open + Edu + HB aktif dengan jumlah pegawai dan distribusi yang mengikuti filter.
- Pengembangan mendatang dapat menambahkan modul analitik dan visualisasi lainnya.

**Rencana peningkatan:**
- Mengganti `DatasetStore` dalam memori dengan PostgreSQL agar data persisten
- Menambahkan autentikasi dan otorisasi pengguna
- Menambahkan kontrol akses berbasis peran (RBAC) untuk modul
- Menambahkan fitur berbagi tautan dengan perlindungan kata sandi (untuk Link Builder)

Jika diperlukan, pengujian unit untuk `dataset_service._load_auto_clean_rules` dapat ditambahkan untuk memastikan perilaku parser, begitu pula panduan kontribusi yang mencakup alur kerja Git tim.
