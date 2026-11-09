# PBN Cleaner

Aplikasi web full-stack untuk pembersihan dataset PBN dan analitik.

## Catatan Rilis

Pembaruan web saat ini adalah **1.2**: [Catatan pembaruan Web](./Update%20Notes/Update%20Notes%201.2%20Web.md). Persyaratan desktop terkait didokumentasikan terpisah di [Catatan pembaruan Desktop](./Update%20Notes/Update%20Notes%201.2%20Desktop.md); catatan desktop tersebut tidak menyatakan build atau rilis desktop telah dibuat.

Navigasi utama aplikasi desktop hanya berisi **PBN Analytics** dan **Insight Hub**, tanpa sistem login. Menu placeholder tambahan pada catatan web hanya berlaku untuk web. Versi **2.0** direncanakan sebagai milestone setelah menu placeholder tersebut berfungsi.

## Fitur

| Fitur | Status | Deskripsi |
|---|---|---|
| **PBN Analytics** | ✅ Aktif | Mengunggah, membersihkan, dan mengekspor dataset PBN dengan beberapa metode pembersihan |
| **Penghapusan Duplikat** | ✅ Aktif | Memilih kolom sebagai kunci unik serta menghapus duplikat dengan statistik hasil |
| **Pengelolaan Kolom** | ✅ Aktif | Menyembunyikan atau menghapus kolom serta mengganti nama kolom secara langsung dengan pratinjau tabel |
| **Ekspor** | ✅ Aktif | Mengunduh data dalam format `.csv` atau `.xlsx` |
| **Insight Hub** | ✅ Aktif | Dashboard PBN Open + Edu + HB dengan jumlah pegawai dan distribusi data |
| **Insight Hub Beta (web)** | ✅ Beta | Filter, grafik, dan tabel pegawai yang sama dari `pbncleaner.fetch_pbnopen`; Super Admin dapat mengganti sumber melalui CSV yang divalidasi kolomnya |
| **Manajemen Plt./Plh.** | ✅ Aktif | Memantau penugasan, menghitung masa kerja/status, menampilkan notifikasi, dan mengekspor data |
| **Akun dan peran web** | ✅ Aktif | Guest, User, Admin, dan Super Admin; sesi pengguna berlaku satu jam |
| **Workspace Admin** | ✅ Aktif | Pengelolaan akun oleh Super Admin dan administrasi monitoring Plt./Plh. |
| **Menu web tambahan** | 🛠️ Placeholder | Generate ND Undangan Pelantikan dan Analisis Kinerja DJPb hanya menampilkan “On development”; tidak tersedia di desktop |
| **Tampilan** | ✅ Aktif | Tema Default, Dark, dan Light; pilihan pengguna yang login tersimpan pada akunnya |
| **Toolbar Aplikasi** | ✅ Aktif | Jam WIB, posisi dapat digeser, utilitas dapat disembunyikan, diagnostik API, dan Snake |
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
│   │   │   └── chat.py            # Endpoint Groq chat terautentikasi
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
├── config.json                    # Centralized config (IP, ports, CORS)
├── run-app-testing.bat            # Local dev launcher
├── run-app.bat                    # Network deployment launcher
├── deploy-windows.ps1             # Environment setup
└── serve-frontend.ps1             # Frontend server for production
```

## Mulai Cepat

### Prasyarat

- Python 3.11+
- Node.js 18+

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

Untuk deployment jaringan, ubah `config.json`. Isi `host` dengan alamat server dan tambahkan URL frontend yang sesuai ke `cors_origins`:

```json
{
  "host": "YOUR_SERVER_HOST_OR_IP",
  "backend_port": 8000,
  "frontend_port": 8081,
  "cors_origins": [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://YOUR_SERVER_HOST_OR_IP:8081",
    "http://YOUR_SERVER_HOST_OR_IP"
  ]
}
```

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
| `/manajemen-plt-plh` | PltPlhManagementPage | Tabel monitoring Plt./Plh., notifikasi, dan ekspor |

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
| `POST` / `PUT` / `PATCH` / `DELETE` | `/plt-plh/records` | Membuat, mengubah, mengaktifkan/menonaktifkan, atau menghapus record (memerlukan login Admin atau Super Admin) |
| `GET` | `/plt-plh/notifications` | Menampilkan record aktif yang mencapai ambang notifikasi enam bulan |
| `GET` | `/plt-plh/records/export` | Mengunduh seluruh record sebagai `.xlsx` |
| `POST` | `/auth/register` | Mendaftarkan akun User level 1 |
| `POST` | `/auth/login` | Masuk dan menerima bearer token |
| `GET` | `/auth/me` | Mengambil akun yang sedang masuk |
| `POST` | `/auth/logout` | Mencabut sesi saat ini |
| `GET` / `PUT` | `/auth/preferences/theme` | Membaca atau memperbarui tema akun yang sedang masuk |
| `GET` / `POST` / `PUT` / `DELETE` | `/admin/users` | Mengelola akun (khusus Super Admin) |
| `POST` | `/chat` | Membuat jawaban chat Groq untuk pengguna yang sudah masuk |

### Akun dan peran

Aplikasi web mendukung Guest, User (level 1), Admin (level 2), dan Super Admin (level 3). Pendaftaran publik langsung membuat akun level 1. Guest dan User dapat melihat data monitoring Plt./Plh.; hanya Admin dan Super Admin yang dapat mengubahnya. Workspace Admin hanya dapat diakses akun Admin dan Super Admin yang sudah masuk; pengelolaan akun hanya dapat dilakukan Super Admin. Fitur pembersihan dataset tetap tersedia untuk Guest dan User.

Toolbar menyediakan tema Default (tampilan gelap bawaan), Dark, dan Light. Pilihan terakhir pengguna yang sudah masuk disimpan di `user_preferences` dan mengikuti akunnya; pilihan Guest hanya disimpan di browser tersebut. Tombol Patch Notes, catatan yang belum diperbaiki, Snake, API Test, dan Admin dikelompokkan di balik tombol tampil/sembunyikan toolbar; tombol masuk/keluar tetap terlihat.

Super Admin pertama **tidak dibuat otomatis**. Setelah tabel akun dibuat, masukkan Super Admin pertama secara manual menggunakan contoh SQL berkomentar dalam `backend/sql/003_create_users_and_sessions.sql`, lalu masuk dan gunakan workspace Super Admin. Sesuai kebutuhan proyek saat ini, password akun disimpan sebagai teks biasa di MySQL. Ini tidak sesuai untuk produksi atau penerapan yang sensitif; jangan membuka akses database dan jangan menggunakan password nyata/yang dipakai ulang.

### Sitasi Es.III (Lite)

`Sitasi Es.III (Lite)` menggunakan aturan pembersihan dan tata letak profil PowerPoint yang sama dengan `Sitasi Es.III`, tetapi mempertahankan baris yang kolom keduanya kosong. Saat dataset Lite yang sudah dibersihkan diekspor ke Excel, baris judul bagian (teks pada `No` dan kolom lainnya kosong) akan digabung melintang. Ekspor CSV dan pratinjau aplikasi tetap menampilkan teks judul di `No` dengan sel lainnya kosong; CSV tidak mendukung format sel gabungan. Mode `Sitasi Es.III` standar tidak berubah.

Pembersihan Sitasi Es.III mengubah `Keterangan` menjadi proper case setelah enam karakter pertamanya dihapus. Pembersihan Sitasi Es.IV mengubah `Pertimbangan` menjadi proper case. Proper case menjadikan huruf pertama setiap kata sebagai huruf kapital; nilai yang kosong tetap kosong.

Untuk **PBN Open + Edu + HB**, Auto Clean menghapus karakter apostrof lurus dan backtick dari nilai sel teks, lalu mengubah nilai tanggal pada `TMT JF Keterampilan`, `TMT JF Keahlian`, `TMT JF Ahli Muda`, `TMT JF Ahli Madya`, `TMT Es4`, `TMT Es3`, `TMT Es2`, dan `TMT Jabatan` menjadi tanggal. Nilai tanggal berisi teks yang tidak dapat diuraikan tetap dipertahankan setelah dibersihkan dan ditampilkan dalam peringatan.

### Chat AI

Pengguna yang sudah masuk dapat membuka tombol chat kecil di pojok kanan bawah. Jawaban asisten dirender dengan Markdown dan tombol Clear menghapus percakapan sementara yang terlihat. Asisten diarahkan untuk tidak mengarang fitur aplikasi yang belum dikonfirmasi, tetapi jawaban tetap dapat keliru. Permintaan chat dikirim oleh backend ke Groq; API key Groq harus diatur melalui `GROQ_API_KEY` di `backend/.env`, dan `GROQ_MODEL` dapat digunakan untuk mengganti model bawaan `openai/gpt-oss-120b`. Jangan letakkan key di kode frontend atau variabel environment frontend. Pesan dan konteks percakapan yang dikirim akan diteruskan ke Groq untuk membuat jawaban; jangan masukkan password atau data pribadi sensitif.

### Rekomendasi metode pembersihan

Setelah unggahan, aplikasi membandingkan sheet terpilih dengan workbook referensi di `backend/templates/verification/` dan menyorot metode yang direkomendasikan untuk template PBN Open, PBN Open + Edu + HB, Sitasi Es.III, dan Sitasi Es.IV yang tersedia. Rekomendasi tidak menjalankan pembersihan secara otomatis. PBN Open + Edu dan Sitasi Es.III (Lite) belum memiliki template verifikasi tersendiri sehingga tidak direkomendasikan secara otomatis.

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
