# Panduan Pengembang

Dokumen ini membantu kontributor baru—terutama pengembang pemula—memahami bagian yang perlu diubah, struktur proyek, dan tugas pengembangan yang umum.

## Cakupan Rilis

- Pembaruan web saat ini adalah **1.4.0**. Lihat [catatan pembaruan web 1.4.0](./Update%20Notes/Update%20Notes%201.4.0%20Web.md), [catatan pembaruan web 1.3.0](./Update%20Notes/Update%20Notes%201.3.0%20Web.md), [web 1.2.1](./Update%20Notes/Update%20Notes%201.2.1%20Web.md), dan [catatan pembaruan desktop](./Update%20Notes/Update%20Notes%201.2%20Desktop.md).
- Navigasi utama desktop hanya berisi PBN Analytics dan Insight Hub serta tidak memiliki sistem login. Menu tambahan dan alur akun hanya berlaku untuk web.
- Generate ND Undangan Pelantikan tersedia bagi pengguna web yang sudah masuk; alur semua sheet menjadi rute utama dan unduhan dokumen dapat dipilih berdasarkan unit dan moda. Analisis Kinerja DJPb dapat dilihat publik, termasuk Guest; Super Admin dan God User dapat mengunggah atau menyesuaikan data. Beberapa triwulan disimpan terpisah, dengan penggantian per triwulan dan perbandingan terhadap periode sebelumnya. Bahan Pendukung MPK dan Simulasi Mutasi masih placeholder web; versi **2.0** direncanakan sebagai milestone untuk alur tersebut.

## Gambaran Umum

- **Tujuan**: Platform pengelolaan data untuk pembersihan dataset PBN dan analitik. Backend menggunakan FastAPI (Python), sedangkan frontend menggunakan React 19, Vite, dan React Router (TypeScript).
- **Arsitektur**: Routing modular berbasis halaman menggunakan React Router v7. Setiap fitur utama memiliki rute sendiri di `frontend/src/pages/`, dengan hook dan layanan bersama.

## Mulai Cepat (Lokal)

- Penyiapan Windows pertama kali:
  - Pasang XAMPP dan jalankan layanan MySQL lokal. Siapkan dump skema/data referensi `pbncleaner` terbaru yang memiliki definisi tabel `fetch_pbnopen` dan `dt_employee` tanpa baris pegawai, tabel referensi yang sudah terisi, serta kolom `ref_unit_kerja.city` / `prov`. Dump disediakan terpisah dan tidak disimpan di repositori.
  - Jalankan `setup-developer.bat` satu kali. Skrip memeriksa/memasang Python 3.12 dan Node.js 22.12+, memasang dependensi backend/frontend, membangun frontend, meminta konfirmasi sebelum mengimpor ke database lokal `pbncleaner`, dan membuat `backend/.env` yang diabaikan Git.
  - Skrip tidak memasang XAMPP atau membuat akun Admin. Setelah setup, jalankan `run-app.bat` dan buat akun `salmanmfa` sebagai Super Admin; startup akan menaikkan akun tersebut ke Level 4. Pemeliharaan database tersedia bagi akun Level 4. Hanya administrator Level 4 yang dapat memberikan atau mengelola peran Level 4. Impor dapat mengganti isi database lokal; jangan arahkan ke produksi.
- Backend:
  - Buat dan aktifkan Python virtual environment di `backend/`.
  - Pasang dependensi: `pip install -r requirements.txt`.
  - Jalankan server pengembangan: `python run_server.py` (mendeteksi port kosong secara otomatis).
  - Health check: `GET http://localhost:8000/health`.
- Frontend:
  - Dari `frontend/`, jalankan `npm install`, kemudian `npm run dev` untuk pengembangan atau `npm run build` untuk build produksi.
  - Rute mencakup `http://localhost:5173/`, `/pbn-analytics`, `/insights`, `/insights-beta`, `/analisis-kinerja`, `/manajemen-plt-plh`, dan `/undangan-pelantikan`. Rute lama `/undangan-pelantikan-experimental` diarahkan ke alur utama.
- Menjalankan aplikasi lokal dengan satu klik:
  - Klik dua kali `run-app-testing.bat` dari direktori utama proyek untuk menjalankan backend lokal dan frontend Vite di port terpisah.
  - Backend pengembangan memakai database dan penyimpanan dataset yang sama dengan aplikasi LAN sesuai konfigurasi. Perubahan data dan migrasi skema saat startup akan berlaku untuk aplikasi aktif; berhati-hatilah saat menguji perubahan.
- Menjalankan aplikasi di jaringan dengan satu klik:
  - Klik dua kali `run-app.bat` dari direktori utama proyek. Dengan `host: "auto"`, launcher mendeteksi IPv4 Wi-Fi/LAN saat ini, membangun URL API frontend, dan mengatur origin CORS yang sesuai.
  - Isi `host` di `config.json` dengan hostname atau alamat reservasi untuk mengganti deteksi otomatis.
  - Jika diperlukan, sajikan frontend hasil build dengan `serve-frontend.ps1`; rute aplikasi seperti `/login` dapat dibuka dan dimuat ulang secara langsung.

## Struktur Repositori (File Penting)

- `backend/` — aplikasi FastAPI
  - `main.py` — entry point aplikasi dan pendaftaran router.
  - `run_server.py` — launcher Uvicorn dengan deteksi port dinamis (mencari port kosong mulai dari 8000).
  - `app/api/cleaning.py` — endpoint pembersihan (auto-clean, hapus kolom, ganti nama, hapus duplikat, hapus baris, dan pengaturan header).
  - `app/services/cleaning_recommendation_service.py` — membandingkan sheet yang diunggah dengan workbook verifikasi dan memberikan rekomendasi tanpa mengubah dataset.
  - `templates/verification/` — workbook format sumber yang digunakan untuk rekomendasi metode pembersihan.
  - `app/api/insights.py` — endpoint dashboard PBN; permintaan filter menghitung ulang agregat dari seluruh dataset.
  - `app/api/insights_beta.py` — endpoint Insight Hub Beta berbasis database untuk `pbncleaner.fetch_pbnopen`.
  - `app/api/plt_plh.py` — API monitoring Plt./Plh., termasuk pencarian pegawai PBN Open khusus Admin.
  - `app/api/pelantikan_agenda.py` — API agenda milik pengguna, unggah/pencocokan roster, pilihan peserta, dan pembuatan ZIP.
  - `app/api/performance_kinerja.py` — dashboard/data/ekspor kinerja publik serta endpoint unggah/penyesuaian yang dilindungi peran.
  - `app/api/auth.py` — endpoint login, pendaftaran, sesi, preferensi pengguna, dan administrasi akun.
  - Router Admin di `auth.py` menyediakan endpoint pratinjau/terapkan/sinkronisasi database dengan allowlist khusus Level 4; hanya administrator Level 4 yang dapat memberikan Level 4 melalui manajemen akun.
  - `app/api/chat.py` — endpoint chat pengguna terautentikasi; kredensial penyedia tetap di backend.
  - `app/services/chat_service.py` — mengirim ringkasan kemampuan aplikasi yang ringkas dan dikelola di kode ke Groq pada setiap permintaan; README dan dokumentasi developer tidak dibaca ulang saat runtime. Selaraskan ringkasan tersebut dengan perilaku aplikasi yang telah diverifikasi ketika fitur berubah.
  - `app/services/dataset_service.py` — logika DataFrame utama. Mengarahkan proses ke cleaner programatis atau membaca file aturan teks lama.
  - `app/repositories/pbn_dashboard_repository.py` — memisahkan pembacaan dari tabel sumber pegawai bersama.
  - `app/services/pbn_dashboard_service.py` — memvalidasi kolom dashboard, menerapkan filter, serta menghitung jumlah pegawai dan distribusi grafik melalui repository.
  - Insight Hub Beta menggunakan ulang perhitungan dan skema respons dashboard yang sama; data dibaca dari `pbncleaner.fetch_pbnopen` melalui engine SQLAlchemy yang dikonfigurasi.
  - `app/services/performance_kinerja_service.py`, `app/models/performance_kinerja.py`, dan `app/schemas/performance_kinerja.py` — penyimpanan berbasis triwulan, query, perbandingan, cache, dan tipe API Analisis Kinerja.
  - `app/services/pbnopen_import_service.py` menangani penggantian sumber yang diizinkan, pemeliharaan tabel referensi dengan ID stabil, dan sinkronisasi pegawai berdasarkan NIP; perubahan dipratinjau dan diterapkan secara transaksional.
  - `app/services/auth_service.py` — siklus akun/sesi, aturan peran, dan preferensi tampilan tersimpan.
  - `app/history_db.py` — migrasi startup yang menaikkan akun `salmanmfa` ke Level 4 dan memperbarui constraint peran umum 1–4; migrasi SQLite mempertahankan sesi/preferensi.
  - `app/cleaners/` — modul cleaner programatis:
    - `pbn.py`, `pbn_edu.py`, `pbn_edu_hb.py`, `sitasi_esiii.py`, `sitasi_esiv.py` — masing-masing mengembalikan konfigurasi pembersihan.
  - `app/storage/dataset_store.py` — penyimpanan dataset dalam memori (UUID -> sheets). Data bersifat sementara dan akan hilang saat server dimulai ulang.
  - `app/history_db.py` — engine dan sesi SQLAlchemy bersama untuk MySQL/MariaDB, registrasi model, serta migrasi skema saat startup.
  - `app/models/auth.py` — model akun, sesi, dan preferensi pengguna.
  - `app/models/cleaning_history.py` — model SQLAlchemy untuk tabel riwayat pembersihan.
  - `app/models/plt_plh.py` dan `app/services/plt_plh_service.py` — record monitoring, masa kerja/status, ekspor Excel, dan lookup pejabat pengganti.
  - `app/models/pelantikan_agenda.py` dan `app/services/pelantikan_agenda_service.py` — snapshot agenda/peserta persisten dan pembuatan DOCX/ZIP.
  - `app/utils/employee_formatting.py` — pemformatan jabatan definitif bersama untuk alur berbasis pegawai.
  - `app/schemas/pbn_dashboard.py` — skema permintaan filter dashboard.
  - `app/services/history_service.py` — helper pencatatan dan pengambilan riwayat pembersihan.
  - `Cleaning Logic/` — direktori file aturan teks (fallback lama; utamakan cleaner programatis).
  - `sql/001_create_cleaning_history.sql` — skrip inisialisasi MySQL untuk database dan tabel.
  - `sql/002_create_plt_plh_monitoring.sql` — skema monitoring Plt./Plh., termasuk snapshot NIP opsional.
  - `sql/005_create_pelantikan_agendas.sql` — skema agenda Pelantikan dan snapshot peserta.

- `frontend/` — aplikasi React + Vite dengan React Router
  - `src/pages/` — komponen halaman untuk setiap rute:
    - `LandingPage.tsx` — halaman utama dengan pilihan fitur (rute `/`).
    - `AnalyticsPage.tsx` — antarmuka pembersihan dataset PBN (rute `/pbn-analytics`).
    - `InsightHubPage.tsx` — dashboard interaktif PBN Open + Edu + HB (rute `/insights`).
    - `LoginPage.tsx` / `AdminPage.tsx` — login web, inbox feedback, workspace akun Super Admin, dan dialog pemeliharaan database God User.
    - `PltPlhManagementPage.tsx` — UI monitoring khusus web.
    - `PelantikanAgendaPage.tsx` — UI agenda, pratinjau peserta, dan pembuatan dokumen khusus web.
  - `src/App.tsx` — rute, gerbang sesi/peran, dan pemasangan toolbar/chat bersama.
  - `frontend/index.html` — judul dokumen browser (`MPK Workspace`).
  - `src/contexts/AuthContext.tsx` — autentikasi, mode Guest, dan status sesi.
  - `src/components/AppToolbar.tsx` — jam yang dapat digeser, utilitas yang dapat disembunyikan, menu tema, dan dialog toolbar. Konten Patch Notes dalam aplikasi serta versi default dikelola di `PATCH_NOTES` dan `selectedPatchVersion` pada file ini.
  - `src/components/ChatWidget.tsx` — UI Groq chat terautentikasi dan tampilan Markdown.
  - `src/main.tsx` — entry point frontend yang membungkus App dengan `<BrowserRouter>`.
  - `src/hooks/useDataset.ts` — aksi dataset tingkat tinggi dan panggilan API yang digunakan UI.
  - `src/services/api.ts` — fungsi pembungkus HTTP untuk endpoint backend.
  - `src/features/cleaning/DataTable.tsx` — komponen tabel untuk halaman; menangani pagination, filter, dan pengurutan.
  - `src/pages/InsightHubPage.tsx` — kontrol dan grafik distribusi dashboard; menerima ID dataset dan nama sheet melalui URL.
  - `src/pages/PerformanceAnalysisPage.tsx` — pemilih triwulan di luar tiga tab Overview/Unit Eselon II/Daftar Pegawai, tampilan per periode, filter, dan dialog pengelolaan data Super Admin.

- `config.json` — konfigurasi deployment terpusat; `host: "auto"` mengaktifkan deteksi alamat LAN dinamis, sedangkan port dan origin CORS loopback tetap dapat diatur.
- `resolve-network-config.ps1` — resolver host bersama untuk launcher/deployment jaringan; mengutamakan Wi-Fi aktif dan menghitung origin CORS frontend.

## Pemeliharaan Database Admin (Web)

- Popup database Admin yang sudah ada tetap digunakan. Super Admin level 3 dapat membukanya, tetapi akan melihat `You have no authority to view this page.`; endpoint API juga mewajibkan Level 4 untuk operasi database. Hak Super Admin lainnya tetap tersedia bagi Level 3.
- Level 4 adalah peran, bukan batasan username. `init_history_db()` menaikkan akun `salmanmfa` dan memperbarui constraint database saat startup. Level 4 mencakup kemampuan Super Admin serta pemeliharaan database; hanya administrator Level 4 yang dapat memberikan atau mengelola akun Level 4. Cadangkan MySQL/MariaDB bersama dan uji migrasi pada salinan sebelum deployment.
- Katalog backend menggunakan allowlist: penggantian `fetch_pbnopen` atau `fetch_pbnopen_q2_2026`; sinkronisasi `dt_employee` hanya dari `fetch_pbnopen` atau `dt_employee_q2_2026` hanya dari `fetch_pbnopen_q2_2026`; pembaruan lima tabel `ref_*` bersama berdasarkan primary ID. Browser tidak mengirim nama skema/tabel mentah.
- Pratinjau CSV memvalidasi seluruh kolom dan melaporkan jumlah baris sebelum diterapkan. Penggantian sumber dan pembaruan referensi berjalan dalam transaksi. ID referensi tetap stabil; ID yang masih dipakai salah satu tabel pegawai tidak dapat dihapus. Sinkronisasi memetakan label melalui referensi bersama, mempertahankan `employee_id` untuk NIP yang cocok, menambah NIP baru, dan menghapus pegawai yang tidak lagi ada di sumber. Sumber kosong ditolak agar tabel tidak terhapus tanpa sengaja.
- Pemeriksaan terfokus: dari `backend/`, jalankan `python -m unittest discover -s tests -p 'test_pbnopen_import.py'`, `python -m unittest discover -s tests -p 'test_auth_service.py'`, dan `python -m unittest discover -s tests -p 'test_auth_migration.py'`. Tes migrasi mencakup SQLite; migrasi MySQL/MariaDB tetap perlu diuji pada salinan database.

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

- Sitasi Es.III menerapkan `_to_proper_case` pada `Keterangan` setelah menghapus enam karakter awal. Sitasi Es.IV menerapkan helper yang sama pada `Pertimbangan` setelah kolom sumber ditemukan/diganti nama. Helper tidak mengubah nilai non-teks dan nilai kosong.

**Rekomendasi metode pembersihan**
- `GET /clean/recommend-method/{dataset_id}?sheet_name=...` membandingkan sheet dengan workbook yang tersedia di `backend/templates/verification/`.
- Workbook PBN menggunakan header yang sama, sehingga recommender juga membandingkan pola isi pada kolom tambahan Homebase/Pendidikan. Template Sitasi dibedakan melalui posisi header tabel.
- Recommender hanya menyarankan metode dan tidak menjalankan pembersihan. PBN Open + Edu belum memiliki workbook verifikasi tersendiri sehingga tidak disarankan otomatis.

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
- Pembacaan database dipisahkan ke `app/repositories/pbn_dashboard_repository.py`; akses SQL/sumber data tetap di repository, sedangkan filter/agregasi dashboard berada di `pbn_dashboard_service.py`. Insight Hub dan Insight Hub Beta berbagi perilaku layanan tersebut.

## Analisis Kinerja DJPb

- Pemilih periode tingkat atas terpisah dari tiga tab analisis (Overview, Unit Eselon II, dan Daftar Pegawai). Triwulan terbaru dipilih secara default; dashboard, data, filter, dan ekspor mengikuti periode terpilih.
- Setiap periode disimpan sebagai dataset terpisah. Unggah ulang triwulan yang sama hanya mengganti triwulan tersebut; periode lain tetap tersedia. Identitas record adalah `(dataset_id, nip)`, dan setiap periode unik di `performance_kinerja_datasets`.
- Perbandingan Unit Eselon II hanya menggunakan triwulan kalender yang tepat sebelumnya, termasuk pergantian tahun Q4 ke Q1. Jika periode tersebut tidak tersedia, perbandingan tidak ditampilkan. Detail dibuka dari baris unit atau tombol perbandingan seluruh dataset dan mencakup nilai saat ini/sebelumnya, delta, perubahan persentase jika relevan, serta distribusi status NKP. Perubahan persentase ditampilkan tebal, merah untuk nilai negatif, dan hijau untuk nilai positif. Ikon cetak membuka tampilan cetak khusus laporan yang dapat disimpan sebagai PDF.
- Urutan awal unit mengikuti `unit_kerja_id` dari kecil ke besar; ID yang tidak tersedia ditempatkan di bawah. Header metrik numerik dapat mengurutkan naik/turun, diterapkan terpisah pada tingkat Eselon II, III, dan IV; nilai numerik kosong tetap di bawah.
- Tabel unit dapat dibuka bertingkat dari Unit Eselon II ke III dan IV; perbandingan tersedia pada setiap tingkat. Lite View menampilkan Unit, Pegawai, Rata-rata NPK, Koreksi (+/−), Pemberian Koreksi (%), Rata-rata NKP Akhir, NKP Akhir Sangat Istimewa, dan Bandingkan. Pemberian Koreksi (%) dihitung dari jumlah pegawai dengan koreksi bukan nol dibagi jumlah pegawai unit. Metrik numerik dapat diurutkan; lebar kolom menyesuaikan ruang yang tersedia, dapat diubah dengan pointer atau keyboard, dan disimpan di local storage browser.
- Unggah kinerja menyimpan snapshot nama pegawai, Eselon, unit, dan `unit_kerja_id` dari referensi terpilih (`fetch_pbnopen` sebagai default atau `dt_employee_q2_2026` untuk Q2-2026). Untuk `fetch_pbnopen`, label Unit Kerja dipetakan melalui `ref_unit_kerja`; tabel historis menyimpan ID secara langsung. Eselon ID historis dipetakan melalui `ref_eselon`. `Unit Eselon IV` tersedia sebagai filter dropdown di Daftar Pegawai dan disertakan dalam ekspor. Migrasi startup menambahkan kolom snapshot yang belum ada; record lama tanpa ID unit berada di bagian bawah urutan default.
- Grafik status Overview menampilkan jumlah dan persentase dari triwulan terpilih. Filter pegawai memakai nilai yang tersedia di dataset terpilih, dengan rentang numerik untuk metrik terkait. Form unggah dan penyesuaian Super Admin berada di balik tombol/dialog pengelolaan data yang ringkas.
- Tab Overview menyediakan toggle `Compare` yang menampilkan perbandingan triwulan kalender sebelumnya langsung di kartu dan grafik yang ada, beserta delta dan perubahan persentase. Filter Unit Eselon II dan Eselon yang dipilih berlaku untuk kedua triwulan; jika triwulan sebelumnya tidak tersedia, tampilan periode aktif tetap muncul dengan pemberitahuan.
- Perhitungan dashboard dan metadata filter disimpan dalam cache per dataset terpilih hingga lima menit. Unggah dan penyesuaian yang berhasil membatalkan cache data terkait agar permintaan berikutnya memakai data terbaru.
- `init_history_db()` memutakhirkan skema dataset aktif tunggal sebelumnya tanpa menghilangkan datanya dari periode yang tercatat. Cadangkan database MySQL/MariaDB bersama sebelum startup pertama setelah perubahan skema diterapkan. Launcher pengembangan juga memakai database yang dikonfigurasi, sehingga unggahan dan migrasi startup tidak terisolasi dari aplikasi LAN.
- Tes migrasi skema lama memakai SQLite; migrasi belum dijalankan pada database MySQL/MariaDB aktif. Uji pada salinan database dan simpan cadangan sebelum menerapkannya pada instalasi bersama.
- `backend/sql/006_create_performance_kinerja.sql` menjelaskan skema instalasi baru. Instalasi lama dimutakhirkan melalui migrasi startup; `CREATE TABLE IF NOT EXISTS` saja tidak memutakhirkan tabel yang sudah ada.
- Pengujian backend terfokus: dari `backend/`, jalankan `python -m unittest discover -s tests -p 'test_performance_kinerja.py'`. Pemeriksaan frontend: dari `frontend/`, jalankan `npm run build` dan `npm run lint`.

## Lookup Pegawai Plt./Plh.

- Record monitoring disimpan di `plt_plh_monitoring_records`; skema instalasi baru tersedia di `backend/sql/002_create_plt_plh_monitoring.sql`.
- `GET /plt-plh/employees?q=...` hanya untuk Admin/Super Admin dan mencari nama atau NIP di tabel `pbncleaner.fetch_pbnopen` yang sudah ada. Query memerlukan minimal dua karakter dan mengembalikan maksimal 20 opsi.
- Saat pegawai dipilih, nama dan jabatan definitif berformat diisikan otomatis serta NIP disimpan sebagai snapshot pada record monitoring. Kolom monitoring lainnya tetap diisi manual.
- `format_job_with_unit` di `app/utils/employee_formatting.py` juga digunakan oleh pembuatan dokumen Pelantikan. Unit Eselon II yang telah diformalkan hanya ditambahkan jika Eselon diketahui dan bukan II.
- `init_history_db()` menambahkan kolom nullable `pejabat_pengganti_nip` pada tabel monitoring lama. Jangan membuat tabel pegawai kedua atau migrasi skema lookup terpisah.

## Alur Agenda Pelantikan

- `/undangan-pelantikan` adalah alur semua sheet utama; `/undangan-pelantikan/:agendaId` membuka kembali agenda yang sudah ada, termasuk agenda lama satu sheet. URL lama `/undangan-pelantikan-experimental` diarahkan ke rute utama. Impor dapat menggabungkan semua sheet, sheet terpilih, memisahkan sheet, atau memakai satu sheet. Setiap API agenda memerlukan pengguna yang sudah masuk dan memeriksa kepemilikan agenda.
- Agenda dan snapshot peserta disimpan di `pelantikan_agendas` dan `pelantikan_agenda_people`. Gunakan `backend/sql/005_create_pelantikan_agendas.sql` untuk instalasi baru; startup menambahkan kolom mode alur, strategi impor, dan provenance yang belum ada pada instalasi lama.
- Pilihan level jabatan adalah Administrator dan Tinggi Pratama. Pilihan dresscode adalah Wastra Nusantara, PSL Lengkap, atau nilai khusus dari pengguna. Hitung mundur kartu menggunakan tanggal Jakarta dan menampilkan Berakhir untuk tanggal lampau.
- Unggah roster menerima `.xlsx` dan `.xls` hingga 50 MB. Impor melewati sheet kosong/non-roster dengan pemberitahuan, menyimpan nama sheet/baris sumber, dan menyelesaikan duplikat NIP menurut urutan tab/baris workbook; kemunculan pertama dapat dipilih.
- Impor gabungan menyatukan Unit Eselon II yang sama dari sheet berbeda tetapi tetap memisahkan moda Daring/Luring; tombol alih moda sekali klik mempercepat pergantian. Pegawai yang dipetakan ke DKI Jakarta melalui `ref_unit_kerja.prov` secara default mendapat Luring; pegawai lain mendapat Daring. Mode terpisah juga menjaga sheet sumber sebagai grup pratinjau/dokumen tersendiri. Roster dokumen memakai `Jabatan` saat ini dari database; usulan jabatan baru di workbook hanya menjadi referensi pratinjau dan tidak disalin.
- Kemunculan NIP duplikat tetap terlihat dan dapat dipilih secara individual, tetapi kemunculan kedua tidak dapat disimpan/dibuatkan dokumen; Pilih Semua hanya memilih maksimal satu baris per NIP. Backend menerapkan aturan unik yang sama.
- Roster mendukung Lite View berisi Pilih, No, Nama/NIP, Jabatan Saat ini/Grade, Usul Jabatan Baru/Grade, Kota, Pencocokan, dan Pelantikan, serta lebar kolom yang dapat diatur dan tersimpan di browser. Kartu pratinjau menampilkan kota hasil pencocokan dan dapat difilter berdasarkan status pencocokan atau moda. Dokumen dapat dipilih berdasarkan unit dan moda (serta sheet sumber untuk impor terpisah). Satu dokumen terpilih diunduh sebagai DOCX; beberapa dokumen terpilih diunduh bersama sebagai ZIP. Backend memvalidasi kelengkapan setiap grup dokumen.
- Pratinjau juga dapat membuat satu DOCX lampiran ND Pengantar dari peserta terpilih. Baris diurutkan Luring sebelum Daring, lalu berdasarkan ID unit; template berada di `backend/templates/undangan_pelantikan/template_lampiran_pengantar.docx`.
- Monitoring Pelantikan menyediakan ekspor Excel dengan empat kolom dan jumlah per unit.
- Workbook sumber dan dokumen yang dihasilkan tidak disimpan. Agenda dan snapshot peserta tetap tersimpan agar pemilik dapat melanjutkan proses; unggahan ulang mengganti snapshot peserta pada agenda tersebut.
- Jaga konsistensi penulisan penerima serta aturan jabatan pada `pelantikan_agenda_service.py` dan `employee_formatting.py`.

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
- Deployment jaringan (mendeteksi host LAN aktif dan membaca port dari config.json):
```
run-app-testing.bat        # Local dev (backend with --reload)
run-app.bat                # Deployment jaringan (deteksi host otomatis; config.json tetap bisa dioverride)
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

## Cakupan Saat Ini dan Milestone Berikutnya

- **Web 1.4.0:** Mencakup seluruh fitur web 1.3.0, alur Generate ND terkini beserta peningkatannya, riwayat/perbandingan/cache multi-triwulan Analisis Kinerja, dan kontrol dashboard terkait yang dijelaskan di atas.
- **Batas persistensi data:** Dataset pembersihan yang diunggah tetap berada dalam memori dan hilang saat backend dimulai ulang; periode kinerja, agenda, record monitoring, akun, dan feedback memakai database MySQL/MariaDB yang dikonfigurasi.
- **Placeholder web:** Bahan Pendukung MPK dan Simulasi Mutasi belum menjalankan alur kerja sesuai namanya.
- **Milestone versi 2.0:** Menjadikan alur kerja placeholder yang tersisa berfungsi setelah kebutuhannya ditentukan. Jangan menganggap versi 2.0 sudah diimplementasikan.
- **Desktop:** Menu navigasi utamanya hanya PBN Analytics dan Insight Hub; tidak ada login desktop, workspace Admin, atau menu placeholder web.

Jika diperlukan, pengujian unit untuk `dataset_service._load_auto_clean_rules` dapat ditambahkan untuk memastikan perilaku parser, begitu pula panduan kontribusi yang mencakup alur kerja Git tim.
