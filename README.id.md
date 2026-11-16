# PBN Cleaner

Aplikasi web full-stack untuk pembersihan dataset PBN dan analitik.

Nama aplikasi web pada tab browser adalah **MPK Workspace**; PBN Cleaner tetap menjadi nama proyek dan repositori.

## Catatan Rilis

Pembaruan web saat ini adalah **1.4.0**: [Catatan pembaruan Web](./Update%20Notes/Update%20Notes%201.4.0%20Web.md), setelah [pembaruan Web 1.3.0](./Update%20Notes/Update%20Notes%201.3.0%20Web.md), [Web 1.2.1](./Update%20Notes/Update%20Notes%201.2.1%20Web.md), dan [Web 1.2](./Update%20Notes/Update%20Notes%201.2%20Web.md). Persyaratan desktop terkait didokumentasikan terpisah di [Catatan pembaruan Desktop](./Update%20Notes/Update%20Notes%201.2%20Desktop.md); catatan desktop tersebut tidak menyatakan build atau rilis desktop telah dibuat.

Navigasi utama aplikasi desktop hanya berisi **PBN Analytics** dan **Insight Hub**, tanpa sistem login. Akun web, monitoring Plt./Plh., pembuatan agenda Pelantikan, dan Analisis Kinerja DJPb hanya tersedia di web. Bahan Pendukung MPK dan Simulasi Mutasi masih berupa placeholder web; versi **2.0** direncanakan sebagai milestone untuk alur tersebut.

## Fitur

| Fitur | Status | Deskripsi |
|---|---|---|
| **PBN Analytics** | ✅ Aktif | Mengunggah, membersihkan, dan mengekspor dataset PBN dengan beberapa metode pembersihan |
| **Penghapusan Duplikat** | ✅ Aktif | Memilih kolom sebagai kunci unik serta menghapus duplikat dengan statistik hasil |
| **Pengelolaan Kolom** | ✅ Aktif | Menyembunyikan atau menghapus kolom serta mengganti nama kolom secara langsung dengan pratinjau tabel |
| **Ekspor** | ✅ Aktif | Mengunduh data dalam format `.csv` atau `.xlsx` |
| **Insight Hub** | ✅ Aktif | Dashboard PBN Open + Edu + HB dengan jumlah pegawai dan distribusi data |
| **Insight Hub Beta (web)** | ✅ Beta | Filter, grafik, dan tabel pegawai yang sama dari `pbncleaner.fetch_pbnopen`; God User dapat mengelola sumber dan tabel terkait melalui dialog Admin |
| **Analisis Kinerja DJPb (web)** | ✅ Aktif | Riwayat beberapa triwulan, perbandingan Unit Eselon II dengan triwulan sebelumnya, filter dan ekspor per periode; Super Admin dan God User dapat mengunggah atau menyesuaikan data |
| **Manajemen Plt./Plh.** | ✅ Aktif | Memantau penugasan, menghitung masa kerja/status, menampilkan notifikasi, memilih pejabat pengganti dari PBN Open, dan mengekspor data |
| **Generate ND Undangan Pelantikan (web)** | ✅ Aktif | Alur utama semua sheet, Lite View dan lebar kolom tersimpan, toggle Daring/Luring, pilihan unduhan dokumen per Unit/moda, serta lampiran ND Pengantar |
| **Akun dan peran web** | ✅ Aktif | Guest, User, Admin, Super Admin, serta God User Level 4 berbasis peran; sesi pengguna berlaku satu jam |
| **Workspace Admin** | ✅ Aktif | Pengelolaan akun oleh Super Admin; pemeliharaan tabel database hanya oleh God User |
| **Feedback pengguna (web)** | ✅ Aktif | Mengirim masukan untuk menu tertentu atau keseluruhan aplikasi; Admin dan Super Admin dapat melihat, menghapus satu masukan, atau menghapus semuanya |
| **Menu web lainnya** | 🛠️ Placeholder | Bahan Pendukung MPK dan Simulasi Mutasi belum diimplementasikan; menu ini tidak tersedia di desktop |
| **Tampilan** | ✅ Aktif | Tema Default, Dark, dan Light; pilihan pengguna yang login tersimpan pada akunnya |
| **Toolbar Aplikasi** | ✅ Aktif | Jam WIB, posisi dapat digeser dan menempel ke tepi layar terdekat, utilitas dapat disembunyikan, diagnostik API, dan Snake |
| **Chat AI** | ✅ Aktif | Chat web untuk pengguna login dengan Markdown, tombol hapus percakapan, dan panduan kemampuan aplikasi ringkas; memakai Groq dari backend tanpa membaca ulang dokumentasi setiap permintaan |

## Teknologi

**Frontend:** React 19 · Vite · TypeScript · Tailwind CSS v3 · React Router v7 · TanStack Table · Axios

**Backend:** Python 3.11+ · FastAPI · Pandas · openpyxl · Groq Python SDK · Uvicorn

**Deployment:** Skrip batch Windows · PowerShell · Hosting lokal atau intranet

## Struktur Proyek

```
Project PBNCleaner/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── upload.py          # POST /upload
│   │   │   ├── cleaning.py        # POST /clean/*
│   │   │   ├── dataset.py         # GET /dataset/:id, GET /export/*
│   │   │   ├── auth.py            # Login, preferensi, dan endpoint akun web
│   │   │   ├── chat.py            # Endpoint Groq chat terautentikasi
│   │   │   ├── plt_plh.py         # Monitoring Plt./Plh. dan pencarian pejabat
│   │   │   └── pelantikan_agenda.py # Agenda Pelantikan dan pembuatan dokumen
│   │   ├── cleaners/
│   │   │   ├── pbn.py             # PBN Open mode
│   │   │   ├── pbn_edu.py         # PBN Open + Edu mode
│   │   │   ├── pbn_edu_hb.py      # PBN Open + Edu + HB mode
│   │   │   ├── sitasi_esiii.py    # Sitasi Es.III mode
│   │   │   └── sitasi_esiv.py     # Sitasi Es.IV mode
│   │   ├── services/
│   │   │   └── dataset_service.py # DataFrame logic & mode routing
│   │   ├── schemas/
│   │   │   └── dataset.py         # Skema Pydantic
│   │   └── storage/
│   │       └── dataset_store.py   # Penyimpanan dalam memori
│   ├── main.py                    # FastAPI app entry
│   ├── run_server.py              # Uvicorn launcher with port detection
│   └── requirements.txt
│
├── frontend/
│   └── src/
│       ├── pages/                 # React Router pages
│       │   ├── LandingPage.tsx    # / route (feature selector)
│       │   ├── AnalyticsPage.tsx  # /pbn-analytics route
│       │   ├── InsightHubPage.tsx  # /insights route
│       │   ├── PltPlhManagementPage.tsx # Monitoring khusus web
│       │   ├── PelantikanAgendaPage.tsx # Alur agenda khusus web
│       │   ├── LoginPage.tsx      # Login/registrasi/Guest web
│       │   └── AdminPage.tsx      # Administrasi akun web
│       ├── components/
│       │   ├── AppToolbar.tsx      # Jam, tema, dan toolbar utilitas
│       │   ├── ChatWidget.tsx      # Groq chat pengguna login
│       │   ├── ErrorBanner.tsx
│       │   └── Spinner.tsx
│       ├── contexts/
│       │   └── AuthContext.tsx    # Status sesi dan Guest
│       ├── features/
│       │   ├── upload/
│       │   │   └── UploadZone.tsx
│       │   └── cleaning/
│       │       ├── DataTable.tsx
│       │       ├── ColumnManager.tsx
│       │       └── DuplicateRemover.tsx
│       ├── hooks/
│       │   └── useDataset.ts      # All app state & API calls
│       ├── services/
│       │   └── api.ts             # Axios API layer
│       ├── types/
│       │   └── index.ts           # TypeScript interfaces
│       ├── App.tsx                # React Router setup
│       └── main.tsx               # BrowserRouter wrapper
│
├── config.json                    # Mode host jaringan dan konfigurasi port terpusat
├── resolve-network-config.ps1     # Mendeteksi host LAN aktif dan origin CORS
├── run-app-testing.bat            # Local dev launcher
├── run-app.bat                    # Network deployment launcher
├── setup-developer.bat            # Penyiapan pengembang Windows satu kali
├── deploy-windows.ps1             # Environment setup
└── serve-frontend.ps1             # Frontend server for production
```

## Mulai Cepat

### Prasyarat

- Python 3.11+ (penyiapan Windows memasang Python 3.12 jika diperlukan)
- Node.js 22.12+ (penyiapan Windows memasang rilis LTS saat ini jika diperlukan)
- XAMPP MySQL dan dump skema serta data referensi `pbncleaner` terbaru untuk pengembangan lokal

### Penyiapan pengembang Windows satu kali

Setelah meng-clone repositori, pasang XAMPP jika belum tersedia dan jalankan server MySQL-nya. Siapkan dump skema dan data referensi SQL `pbncleaner` terbaru yang berisi definisi tabel `fetch_pbnopen` dan `dt_employee`, tabel referensi pegawai yang sudah terisi, serta kolom `ref_unit_kerja.city` dan `ref_unit_kerja.prov`. Biarkan tabel sumber pegawai kosong; unggah `fetch_pbnopen` dan sinkronkan `dt_employee` dari halaman Admin. Berkas SQL di `backend/sql/` membuat tabel milik aplikasi, tetapi tidak berisi skema sumber dan data referensi tersebut.

Jalankan `setup-developer.bat` satu kali. Skrip memasang Python/Node.js bila diperlukan, menyiapkan dependensi backend dan frontend, membangun frontend, mengimpor dump setelah konfirmasi eksplisit, dan mengatur `backend/.env` yang diabaikan Git. Skrip memvalidasi skema tabel dan data referensi terisi tanpa mensyaratkan data pegawai. Setelah penyiapan berhasil, jalankan aplikasi dengan `run-app.bat`. Untuk mengunggah data pegawai, buat Super Admin lokal terlebih dahulu sesuai bagian [Akun dan peran](#akun-dan-peran); dump ini memang tidak berisi akun pengguna. Impor dump dapat mengganti data pada database lokal `pbncleaner`; jangan arahkan penyiapan ini ke database produksi.

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
python run_server.py              # Finds free port starting from 8000
```

Dokumentasi API tersedia di: http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Aplikasi tersedia di `http://localhost:5173` dengan routing aktif.

### 3. Deployment Jaringan

Deployment jaringan secara bawaan mendeteksi host secara otomatis. Launcher mengutamakan alamat IPv4 Wi-Fi aktif, menggunakannya untuk URL aplikasi/API/CORS, dan memilih port backend kosong berikutnya bila diperlukan. Tidak perlu mengubah IP secara manual. Untuk memakai nama DNS stabil atau alamat reservasi manual, ganti nilai `"auto"` dengan hostname/alamat tersebut di `config.json`.

```json
{
  "host": "auto",
  "backend_port": 8000,
  "frontend_port": 8081,
  "cors_origins": [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8081",
    "http://127.0.0.1:8081"
  ]
}
```

`resolve-network-config.ps1` mengutamakan adapter Wi-Fi aktif, lalu adapter fisik aktif dengan default route terbaik. Jika DHCP memberikan alamat berbeda, jalankan ulang launcher dan bagikan URL baru yang ditampilkan; config tidak perlu diedit. Jika alamat IPv4 yang dapat dipakai tidak ditemukan, isi `host` secara eksplisit. Launcher jaringan menambahkan origin frontend terpilih ke allowlist CORS backend saat startup. Untuk URL stabil, utamakan reservasi DHCP atau DNS internal daripada menetapkan IP statis yang belum dicadangkan.

Kemudian jalankan perintah berikut dari direktori utama proyek:

```bash
# One-click local dev
run-app-testing.bat

# One-click network deployment
run-app.bat
```

## Routing

Aplikasi menggunakan **React Router v7** untuk navigasi berbasis URL:

| Rute | Komponen | Deskripsi |
|---|---|---|
| `/` | LandingPage | Pemilih fitur dengan kartu untuk setiap modul |
| `/pbn-analytics` | AnalyticsPage | Pembersihan dataset PBN (aktif) |
| `/insights` | InsightHubPage | Dashboard analitik PBN Open + Edu + HB |
| `/insights-beta` | InsightHubPage | Analitik PBN Open dari database |
| `/manajemen-plt-plh` | PltPlhManagementPage | Tabel monitoring Plt./Plh., notifikasi, dan ekspor |
| `/undangan-pelantikan` | PelantikanAgendaPage | Alur semua sheet utama dan riwayat agenda |
| `/undangan-pelantikan/:agendaId` | PelantikanAgendaPage | Membuka kembali agenda, termasuk agenda lama satu sheet |
| `/undangan-pelantikan-experimental` | Redirect | Rute lama diarahkan ke alur utama |
| `/admin` | AdminPage | Workspace Admin; pengelolaan akun khusus Super Admin |
| `/login` | LoginPage | Masuk, mendaftar, atau melanjutkan sebagai Guest |

Pengguna dapat menandai rute atau membagikan URL secara langsung untuk membuka fitur tertentu.

Frontend membaca `VITE_API_URL` (nilai bawaan: `http://localhost:8000`).

Untuk mengubahnya, edit `frontend/.env` atau `frontend/.env.production`:

```env
VITE_API_URL=http://localhost:8000
```

## Referensi API

| Metode | Path | Deskripsi |
|---|---|---|
| `POST` | `/upload` | Mengunggah file CSV atau Excel |
| `POST` | `/clean/remove-columns` | Menghapus kolom yang tidak diperlukan |
| `POST` | `/clean/rename-columns` | Mengganti nama kolom |
| `POST` | `/clean/remove-duplicates` | Menghapus baris duplikat |
| `GET` | `/clean/history/{id}` | Mengambil riwayat pembersihan dataset |
| `GET` | `/clean/recommend-method/{dataset_id}?sheet_name=Sheet1` | Merekomendasikan metode pembersihan dengan membandingkan sheet unggahan terhadap template verifikasi |
| `GET` | `/dataset/{id}` | Mengambil pratinjau dataset saat ini |
| `GET` | `/export/csv/{id}` | Mengunduh data sebagai CSV |
| `GET` | `/export/excel/{id}` | Mengunduh data sebagai Excel |
| `GET` | `/plt-plh/records` | Menampilkan semua record monitoring Plt./Plh. |
| `GET` | `/plt-plh/employees?q=...` | Mencari pegawai PBN Open untuk pemilihan pejabat pengganti (Admin atau Super Admin) |
| `POST` | `/plt-plh/records` | Membuat record (memerlukan login Admin atau Super Admin) |
| `PUT` | `/plt-plh/records/{record_id}` | Mengubah record (memerlukan login Admin atau Super Admin) |
| `PATCH` | `/plt-plh/records/{record_id}/active` | Mengaktifkan atau menonaktifkan record (memerlukan login Admin atau Super Admin) |
| `DELETE` | `/plt-plh/records/{record_id}` | Menghapus record (memerlukan login Admin atau Super Admin) |
| `GET` | `/plt-plh/notifications` | Menampilkan record aktif yang mencapai ambang notifikasi enam bulan |
| `GET` | `/plt-plh/records/export` | Mengunduh seluruh record sebagai `.xlsx` |
| `POST` | `/auth/register` | Mendaftarkan akun User level 1 |
| `POST` | `/auth/login` | Masuk dan menerima bearer token |
| `GET` | `/auth/me` | Mengambil akun yang sedang masuk |
| `POST` | `/auth/logout` | Mencabut sesi saat ini |
| `GET` / `PUT` | `/auth/preferences/theme` | Membaca atau memperbarui tema akun yang sedang masuk |
| `GET` / `POST` / `PUT` / `DELETE` | `/admin/users` | Mengelola akun (khusus Super Admin) |
| `GET` | `/admin/database/tables` | Mencantumkan target tabel yang diizinkan (khusus God User) |
| `POST` | `/admin/database/{target_key}/preview` | Memvalidasi CSV dan menampilkan dampak tanpa perubahan (khusus God User) |
| `POST` | `/admin/database/{target_key}/apply` | Mengganti sumber atau memperbarui tabel referensi secara transaksional (khusus God User) |
| `POST` | `/admin/database/{target_key}/sync/preview` | Mempratinjau sinkronisasi tabel pegawai (khusus God User) |
| `POST` | `/admin/database/{target_key}/sync` | Menyinkronkan tabel pegawai dari sumber yang dipasangkan (khusus God User) |
| `POST` | `/chat` | Membuat jawaban chat Groq untuk pengguna yang sudah masuk |
| `POST` / `GET` / `DELETE` | `/feedback` | Mengirim feedback (pengguna login), atau melihat/menghapus semua feedback (Admin dan Super Admin) |
| `DELETE` | `/feedback/{feedback_id}` | Menghapus satu feedback (Admin dan Super Admin) |
| `GET` / `POST` | `/undangan-pelantikan/agendas` | Menampilkan agenda pengguna yang masuk atau membuat agenda |
| `GET` / `PUT` / `DELETE` | `/undangan-pelantikan/agendas/{agenda_id}` | Membaca, memperbarui, atau menghapus agenda milik pengguna |
| `POST` | `/undangan-pelantikan/agendas/{agenda_id}/sheets` | Menampilkan nama sheet dari workbook Excel yang diunggah |
| `POST` | `/undangan-pelantikan/agendas/{agenda_id}/upload` | Mengunggah roster Excel dan mencocokkan NIP dengan PBN Open |
| `POST` | `/undangan-pelantikan/agendas/{agenda_id}/upload-sheets` | Mengimpor semua, sheet pilihan, sheet terpisah, atau satu sheet pada alur utama |
| `POST` | `/undangan-pelantikan/agendas/{agenda_id}/upload-all-sheets` | Menggabungkan sheet roster valid, melaporkan sheet yang dilewati dan NIP duplikat, lalu mencocokkan NIP dengan PBN Open |
| `PUT` | `/undangan-pelantikan/agendas/{agenda_id}/people` | Menyimpan pilihan peserta dan moda |
| `POST` | `/undangan-pelantikan/agendas/{agenda_id}/generate` | Membuat dokumen undangan berkelompok dalam ZIP |
| `POST` | `/undangan-pelantikan/agendas/{agenda_id}/generate-selected` | Membuat dokumen unit/moda terpilih yang lengkap sebagai DOCX atau ZIP |
| `POST` | `/undangan-pelantikan/agendas/{agenda_id}/appendix` | Membuat DOCX lampiran ND Pengantar dari peserta terpilih |

### Akun dan peran

Aplikasi web mendukung Guest, User (level 1), Admin (level 2), Super Admin (level 3), dan God User (level 4). Pendaftaran publik langsung membuat akun level 1. Level 4 adalah peran umum, bukan batasan username; migrasi startup menaikkan akun `salmanmfa` ke level 4. Hanya administrator Level 4 yang dapat memberikan atau mengelola akun Level 4. Peran ini mencakup kemampuan Super Admin dan akses pemeliharaan tabel database. Super Admin level 3 yang membuka popup Database Management akan melihat `You have no authority to view this page.`; endpoint backend tetap memeriksa hak akses secara independen. Guest dan User dapat melihat data monitoring Plt./Plh.; Admin, Super Admin, dan God User dapat mengubahnya. Workspace Admin dapat diakses Admin ke atas, sedangkan pengelolaan akun tersedia untuk Super Admin dan God User. Fitur pembersihan dataset tetap tersedia untuk Guest dan User.

Toolbar menyediakan tema Default (tampilan gelap bawaan), Dark, dan Light. Pilihan terakhir pengguna yang sudah masuk disimpan di `user_preferences` dan mengikuti akunnya; pilihan Guest hanya disimpan di browser tersebut. Tombol Patch Notes, catatan yang belum diperbaiki, Snake, API Test, dan Admin dikelompokkan di balik tombol tampil/sembunyikan toolbar; tombol masuk/keluar tetap terlihat.

Super Admin pertama **tidak dibuat otomatis**. Setelah tabel akun dibuat, masukkan akun awal secara manual menggunakan contoh SQL berkomentar dalam `backend/sql/003_create_users_and_sessions.sql`. Akun `salmanmfa` akan dipromosikan ke Level 4 oleh migrasi startup; akun lain dapat diberi Level 4 melalui manajemen akun oleh administrator Level 4. Sesuai kebutuhan proyek saat ini, password akun disimpan sebagai teks biasa di MySQL. Ini tidak sesuai untuk produksi atau penerapan yang sensitif; jangan membuka akses database dan jangan menggunakan password nyata/yang dipakai ulang.

Pembersihan Sitasi Es.III mengubah `Keterangan` menjadi proper case setelah enam karakter pertamanya dihapus. Pembersihan Sitasi Es.IV mengubah `Pertimbangan` menjadi proper case. Proper case menjadikan huruf pertama setiap kata sebagai huruf kapital; nilai yang kosong tetap kosong.

Untuk **PBN Open + Edu + HB**, Auto Clean menghapus karakter apostrof lurus dan backtick dari nilai sel teks, lalu mengubah nilai tanggal pada `TMT JF Keterampilan`, `TMT JF Keahlian`, `TMT JF Ahli Muda`, `TMT JF Ahli Madya`, `TMT Es4`, `TMT Es3`, `TMT Es2`, dan `TMT Jabatan` menjadi tanggal. Nilai tanggal berisi teks yang tidak dapat diuraikan tetap dipertahankan setelah dibersihkan dan ditampilkan dalam peringatan.

### Chat AI

Pengguna yang sudah masuk dapat membuka tombol chat kecil di pojok kanan bawah. Jawaban asisten dirender dengan Markdown dan tombol Clear menghapus percakapan sementara yang terlihat. Asisten diarahkan untuk tidak mengarang fitur aplikasi yang belum dikonfirmasi, tetapi jawaban tetap dapat keliru. Permintaan chat dikirim oleh backend ke Groq; API key Groq harus diatur melalui `GROQ_API_KEY` di `backend/.env`, dan `GROQ_MODEL` dapat digunakan untuk mengganti model bawaan `openai/gpt-oss-120b`. Jangan letakkan key di kode frontend atau variabel environment frontend. Pesan dan konteks percakapan yang dikirim akan diteruskan ke Groq untuk membuat jawaban; jangan masukkan password atau data pribadi sensitif.

### Rekomendasi metode pembersihan

Setelah unggahan, aplikasi membandingkan sheet terpilih dengan workbook referensi di `backend/templates/verification/` dan menyorot metode yang direkomendasikan untuk template PBN Open, PBN Open + Edu + HB, Sitasi Es.III, dan Sitasi Es.IV yang tersedia. Rekomendasi tidak menjalankan pembersihan secara otomatis. PBN Open + Edu belum memiliki template verifikasi tersendiri sehingga tidak direkomendasikan secara otomatis.

## Pengaturan MySQL (Riwayat Pembersihan)

Operasi pembersihan kini dicatat di tabel MySQL `cleaning_history`.

1. Buat file `.env` di dalam `backend/` berdasarkan `backend/.env.example`.
2. Atur salah satu pilihan berikut:
  - `CLEANING_DB_URL=******host:3306/pbncleaner`
  - atau variabel `MYSQL_*` secara terpisah.
3. Jalankan skrip inisialisasi SQL:

```bash
mysql -u <user> -p < backend/sql/001_create_cleaning_history.sql
```

Modul Plt./Plh. menggunakan database yang sama. Skemanya tersedia di `backend/sql/002_create_plt_plh_monitoring.sql`.

Jalankan juga inisialisasi skemanya satu kali:

```bash
mysql -u <user> -p < backend/sql/002_create_plt_plh_monitoring.sql
```

Riwayat agenda Pelantikan dan snapshot peserta menggunakan database yang sama. Instalasi baru dapat membuat tabelnya dengan `backend/sql/005_create_pelantikan_agendas.sql`; startup aplikasi juga membuat tabel model dan menambahkan kolom snapshot yang belum tersedia. Pemilihan pejabat pengganti Plt./Plh. membaca tabel `pbncleaner.fetch_pbnopen` yang sudah ada dan menyimpan NIP terpilih pada record monitoring; tidak ada tabel lookup pegawai baru.

Buat juga tabel akun dan sesi:

```bash
mysql -u <user> -p < backend/sql/003_create_users_and_sessions.sql
```

Selanjutnya, masukkan Super Admin pertama dengan mengedit dan menjalankan contoh SQL berkomentar di dalam skrip tersebut. Tidak ada akun yang dibuat otomatis. Jalankan backend seperti biasa; tabel mapped yang belum tersedia, termasuk preferensi tema pengguna, juga dibuat saat startup.

### Contoh: Unggah

```bash
curl -X POST http://localhost:8000/upload \
  -F "file=@data.csv"
```

Respons:
```json
{
  "dataset_id": "uuid",
  "columns": ["Name", "Email", "Notes"],
  "rows": [...],
  "row_count": 1000,
  "column_count": 3
}
```

### Contoh: Hapus Kolom

```bash
curl -X POST http://localhost:8000/clean/remove-columns \
  -H "Content-Type: application/json" \
  -d '{"dataset_id": "uuid", "columns_to_keep": ["Name", "Email"]}'
```

### Contoh: Ganti Nama Kolom

```bash
curl -X POST http://localhost:8000/clean/rename-columns \
  -H "Content-Type: application/json" \
  -d '{"dataset_id": "uuid", "rename_map": {"Customer Name": "customer_name"}}'
```

### Contoh: Hapus Duplikat

```bash
curl -X POST http://localhost:8000/clean/remove-duplicates \
  -H "Content-Type: application/json" \
  -d '{"dataset_id": "uuid", "columns": ["Email"]}'
```

Respons mencakup statistik berikut:
```json
{
  "original_rows": 1000,
  "removed_rows": 150,
  "remaining_rows": 850,
  "preview": {...}
}
```

## Catatan Arsitektur

### Penyimpanan Dalam Memori

Dataset disimpan di dictionary Python dengan UUID sebagai kunci. Artinya:

- Tidak memerlukan pengaturan database
- Data akan hilang saat server dimulai ulang
- Cocok untuk penggunaan satu sesi

Untuk menyimpan data secara persisten, ganti `DatasetStore` (`app/storage/dataset_store.py`) dengan implementasi berbasis Redis atau database. Lapisan layanan sudah dipisahkan dari lapisan penyimpanan.

### Pengembangan Mendatang

Arsitektur sudah disiapkan untuk fitur v2 yang direncanakan:

- Direktori `features/dashboard/` disediakan untuk pembuatan grafik dan KPI
- Lapisan layanan dapat diperluas dengan `profiling_service.py` dan `chart_service.py`
- TanStack Table mendukung pin kolom, pengelompokan, dan virtual scrolling untuk dataset berukuran besar

## Build Produksi

```bash
# Frontend
cd frontend && npm run build        # outputs to frontend/dist/

# Backend (production server)
cd backend
python .\run_server.py
```

Untuk hosting di jaringan internal, frontend hasil build dapat disajikan dari direktori utama proyek menggunakan:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve-frontend.ps1
```

Untuk containerisasi, tambahkan `Dockerfile` untuk setiap layanan dan `docker-compose.yml` di direktori utama.
