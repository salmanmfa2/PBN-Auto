# Panduan Lengkap Analisis Kinerja DJPb

Dokumen ini menjelaskan fungsi, alur data, tombol, perhitungan, otorisasi, dan format unggahan untuk modul **Analisis Kinerja DJPb**. Dokumen ditujukan untuk:

- User/operator modul
- Super Admin dan God User
- Tim IT yang mengubah database, API, autentikasi, atau desain antarmuka
- Tim desain grafis yang membuat ilustrasi/screenshot/manual pengguna

---

## 1. Ringkasan Modul

Analisis Kinerja DJPb menampilkan dan memperbarui data kinerja pegawai per periode triwulan. Modul memiliki tiga tab utama:

1. **Overview** — ringkasan seluruh dataset yang sedang difilter.
2. **Unit Eselon II** — agregasi unit Eselon II, drilldown Eselon III/IV, dan perbandingan QoQ.
3. **Daftar Pegawai** — seluruh baris pegawai, filter per kolom, koreksi, ekspor, dan Wildcard Compare.

Halaman dapat dibuka melalui `/analisis-kinerja` dan kartu **Analisis Kinerja DJPb** di landing page.

## 2. Otorisasi dan Akses

Otorisasi menu berasal dari tabel/policy `menu_access` dan dapat diubah oleh God User melalui **Set Auth Menu**.

### Level akun

| Level | Label |
|---|---|
| 0 | Guest |
| 1 | User |
| 2 | Special User |
| 3 | Super Admin |
| 4 | God User |

### Aturan modul

- God User/Level 4 selalu melewati batas view/edit menu.
- Semua menu dapat diberi Minimum View dan Minimum Edit melalui Set Auth Menu, termasuk Guest.
- Edit level tidak boleh lebih rendah dari View level.
- Default Analisis Kinerja adalah View 0 dan Edit 2.
- Hanya Super Admin/Level 3 ke atas yang dapat mengelola dataset, menghapus periode, atau sinkronisasi EPRIDE.
- Batch koreksi, koreksi sel tunggal, edit log, dan insight editor memerlukan hak Edit pada menu.
- Wildcard Compare menggunakan data daftar pegawai yang sudah tersedia dan bukan operasi penyimpanan; aksesnya mengikuti View menu.
- Logout, sesi kedaluwarsa, atau perubahan menu dapat mengarahkan pengguna ke alur login atau dialog No Auth.

## 3. Periode dan Dataset

Dataset disimpan per periode dengan format:

- `Q1-YYYY`
- `Q2-YYYY`
- `Q3-YYYY`
- `Q4-YYYY`

Contoh: `Q3-2026`.

### Pemilih periode

Di atas tab, tombol periode menampilkan:

- kode periode, misalnya `Q3-2026`
- jumlah pegawai pada periode tersebut

Memilih periode akan:

- memuat dashboard periode itu
- memuat Data Daftar Pegawai periode itu
- memperbarui periode sumber koreksi
- mengosongkan pratinjau/konflik sinkronisasi yang lama
- mencoba memuat data dari cache browser apabila tersedia
- mengisi ulang data dari server apabila cache tidak cocok atau kedaluwarsa

Untuk periode selain yang aktif, periode tetap disimpan sebagai dataset terpisah. Mengunggah ulang satu periode tidak menghapus periode lain.

### Tombol hapus periode

Tombol tempat sampah muncul pada setiap chip periode untuk Super Admin/Level 3 ke atas.

Alur:

1. Klik tombol hapus pada periode.
2. Konfirmasi dialog browser.
3. Server menghapus dataset, seluruh record pegawai pada periode itu, dan koreksi edit log terkait.
4. Cache dashboard/browser dibersihkan.
5. UI memuat periode yang masih tersedia atau menampilkan keadaan tanpa dataset.

Tindakan ini permanen dan tidak memiliki Undo.

---

## 4. Kelola Dataset

Tombol **Kelola Dataset** muncul untuk Super Admin/Level 3 ke atas.

### 4.1 Unggah Dataset Lengkap

Bagian kiri popup menerima satu CSV format lengkap kinerja.

#### Input

| Input | Fungsi |
|---|---|
| Periode | Pilih Q1/Q2/Q3/Q4 |
| Tahun | Tahun periode, dibatasi 2000–2100 |
| Referensi Pegawai | `fetch_pbnopen` atau `dt_employee_q2_2026` |
| File CSV | CSV format penuh dengan delimiter titik koma `;` |

**Urutan dan nama header harus cocok persis**:

1. Nama
2. NIP
3. NHK
4. NPK
5. NHK Kalibrasi
6. NPK Kalibrasi
7. NKP Awal
8. Rating Hasil Kerja Awal
9. Rating Perilaku Kerja Awal
10. Predikat Kinerja Awal
11. Nilai Hukuman Disiplin
12. Nilai Dampak Pelanggaran Disiplin
13. Nilai Dampak Perilaku
14. Nilai Koreksi
15. NKO
16. NKP Akhir
17. Rating Hasil Kerja
18. Rating Perilaku Kerja
19. Predikat Kinerja

Header tidak boleh duplikat dan urutannya tidak boleh berbeda.

#### Validasi

Tombol **Validasi CSV**:

- membaca file tanpa menyimpan data
- memastikan seluruh header cocok
- memastikan setiap baris memiliki jumlah kolom yang benar
- meminta NIP 16 atau 18 digit
- menolak NIP duplikat
- memvalidasi nilai NHK/NPK/NHK Kalibrasi/NPK Kalibrasi/NKO pada rentang 0–120
- memvalidasi Nilai Koreksi pada rentang -20 sampai 20 saat unggah penuh
- memvalidasi format angka desimal
- mencocokkan pegawai ke sumber referensi

Hasil validasi menyebutkan:

- jumlah baris pegawai
- periode
- sumber referensi
- jumlah NIP yang tidak teridentifikasi
- jumlah nilai hukdis/dampak positif yang dinormalisasi

NIP yang tidak ditemukan di sumber referensi tetap disimpan sebagai `Unidentified`.

Nilai Hukuman Disiplin dan Dampak Pelanggaran Disiplin yang bernilai positif akan disimpan sebagai potongan negatif:

```text
-1 menjadi -1
 1 menjadi -1
```

#### Tombol Simpan Dataset Periode

**Simpan Dataset Periode** hanya muncul setelah validasi berhasil.

Konfirmasi browser menampilkan:

- periode tujuan
- jumlah baris
- sumber referensi pegawai

Setelah disimpan:

- dataset periode lama diganti
- data periode lain tetap tersedia
- nama, unit, eselon, dan referensi pegawai pada periode tersebut menjadi snapshot historis
- koreksi edit log seluruh periode dibersihkan
- cache dashboard dan daftar pegawai dibersihkan

### 4.2 Sinkronkan Koreksi dari EPRIDE

Bagian kanan popup digunakan untuk sinkronisasi Nilai Koreksi dari database EPRIDE.

#### Input

- Dataset tujuan = periode Analisis Kinerja yang sedang dipilih
- Tahun sumber EPRIDE
- TW sumber EPRIDE

Hanya form dengan `status='kirim'` dan `idUnit` tepat 13 digit yang dipakai.

Nilai:

- NULL pada koreksi sumber menjadi 0
- koreksi di luar -20 sampai 20 membatalkan seluruh sinkronisasi
- NIP dataset yang tidak ditemukan di sumber dipaksa menjadi koreksi 0
- NIP duplikat diproses mengikuti aturan koreksi di bawah

#### Tombol Periksa EPRIDE

**Periksa EPRIDE** menjalankan pratinjau tanpa perubahan database.

Pratinjau menampilkan:

- jumlah baris eligible
- jumlah NIP unik
- jumlah baris dengan idUnit tidak 13 digit yang diabaikan
- jumlah NIP yang akan diperbarui
- jumlah NIP yang cocok
- jumlah NIP tidak ditemukan
- jumlah NIP sumber yang tidak ada dalam dataset
- jumlah kelompok konflik

#### Konflik NIP

Konflik terjadi apabila satu NIP memiliki lebih dari satu nilai koreksi nonzero yang berbeda pada form EPRIDE.

Setiap konflik menampilkan:

- NIP
- nilai koreksi kandidat
- form_id
- idUnit
- submitted_at bila tersedia

Pengguna harus memilih satu kandidat untuk setiap NIP. Tombol Sinkronkan dinonaktifkan sampai semua konflik dipilih.

#### Tombol Sinkronkan

Setelah pratinjau cocok dan konflik selesai:

- nilai koreksi dataset diperbarui
- NKP Akhir dihitung ulang
- koreksi edit log lama dibersihkan sebagai bagian sinkronisasi penuh
- cache dibersihkan
- hasil ringkas menampilkan jumlah diperbarui, tidak berubah, dan input

### 4.3 Tombol Tutup Dataset

**× / Tutup** menutup popup pengelolaan dataset.

Di luar popup, klik area gelap di luar popup juga menutupnya.

---

## 5. Tab Overview

### 5.1 Periode aktif

Tab Overview membaca dataset pada periode yang dipilih di periode switcher.

### 5.2 Tombol Compare QoQ

**Compare QoQ** membandingkan periode aktif dengan periode kalender triwulan sebelumnya.

- Ada state aktif/nonaktif.
- Tidak tersedia apabila periode sebelumnya tidak ada.
- Perbandingan pada kartu, distribusi status, dan blok pengurangan ditampilkan secara terpisah.
- Nilai positive/negative diberi pembeda warna pada komponen perbandingan.

### 5.3 Filter Overview

Filter Overview memperbarui seluruh KPI dan tabel agregat:

- Unit Eselon II
- Unit Eselon III
- Unit Eselon IV
- Eselon

Filter bersifat independen dari filter Eselon pada tab Unit Eselon II.

Perubahan filter memanggil dashboard kembali dan menghitung ulang semua distribusi.

### 5.4 Empat KPI utama

#### Jumlah Pegawai

Jumlah record pegawai pada periode/dataset setelah filter.

#### Jumlah Koreksi (≠ 0)

Jumlah record dengan `Nilai Koreksi != 0`.

Komponen ini juga menampilkan:

- jumlah koreksi penambahan positif
- jumlah koreksi pengurangan negatif

#### Rata-rata Nilai Koreksi

Rata-rata hanya menghitung koreksi yang bukan nol:

```text
Rata-rata = Jumlah Nilai Koreksi
            ÷ Jumlah Nilai Koreksi yang bukan nol
```

Jika tidak ada koreksi bukan nol, nilai rata-rata adalah `null`/kosong.

#### Jumlah Penambahan

Jumlah koreksi positif.

### 5.5 Distribusi NKP

Overview menampilkan:

- distribusi Status NKP Perhitungan
- distribusi Status NKP Akhir
- tabel/perbandingan status yang dibedakan dari periode sebelumnya saat Compare QoQ aktif

Status Nilai dihitung dari nilai NKP Akhir:

| Rentang | Status |
|---|---|
| 115 ke atas | Sangat Istimewa |
| 110–114,99 | Istimewa |
| 100–109,99 | Tinggi |
| 90–99,99 | Sedang |
| di bawah 90 | Rendah |
| `NULL` | Tidak tersedia |

### 5.6 Block Hukdis dan Dampak Pengurangan

Menampilkan jumlah pegawai dengan:

- Hukuman Disiplin
- Dampak Pelanggaran Disiplin
- Dampak Perilaku

Nilai dihitung sebagai jumlah record yang memiliki nilai nonzero pada masing-masing metrik.

### 5.7 Catatan & Insight Pimpinan

Pada Overview terdapat satu catatan/insight global untuk modul.

- User dengan hak Edit dapat mengubah textarea.
- Tombol **Simpan Insight** menyimpan catatan.
- Catatan menampilkan pelaku dan waktu pembaruan terakhir.
- User tanpa hak Edit hanya melihat teks read-only.

---

## 6. Tab Unit Eselon II

### 6.1 Filter Eselon independen

Kontrol **Eselon** ditampilkan di dalam toolbar tab.

- Pilihan: Semua Eselon atau nilai Eselon yang tersedia.
- Filter ini hanya memengaruhi tab Unit Eselon II.
- Tidak mengubah filter Eselon pada Overview.
- Export Excel Unit Eselon II mengikuti filter Eselon yang dipilih.

### 6.2 Cari Unit

Kotak pencarian mencari nama Unit Eselon II, III, atau IV tanpa case-sensitive.

### 6.3 Lite View

Tombol **Lite View** menyembunyikan kolom non-lite agar tampilan lebih ringkas.

- Nyala: Lite View aktif.
- Mati: seluruh kolom Unit ditampilkan.
- Hanya memengaruhi tampilan; tidak mengubah data.
- Lebar kolom dapat diatur ulang dan disimpan lokal pada browser untuk pengguna.

### 6.4 Tombol Atur Ulang Lebar Kolom

Mengembalikan lebar semua kolom Unit ke nilai bawaan.

Lebar tetap tersimpan lokal pada browser.

### 6.5 Tombol Bandingkan Seluruh Dataset

Membandingkan seluruh dataset Unit Eselon II periode aktif dengan periode sebelumnya.

Nonaktif jika tidak ada periode sebelumnya atau tidak ada data perbandingan.

### 6.6 Tombol Unduh Excel Unit

Mengunduh hierarki Unit Eselon II/III/IV sebagai `.xlsx`.

Export mengikuti:

- periode aktif
- filter Eselon independen Unit tab

### 6.7 Sorting tabel

Header kolom yang memiliki tanda `↑/↓/↕` dapat diklik untuk mengurutkan.

- Kolom numerik: kecil ke besar atau besar ke kecil.
- Kolom teks: A–Z atau Z–A.
- Kolom unit memiliki sticky left column agar tetap terlihat saat tabel digeser.

### 6.8 Menyusun ulang lebar kolom

Setiap kolom menyediakan:

- drag handle
- dukungan keyboard tombol kiri/kanan

Lebar disimpan pada browser sesuai akun.

### 6.9 Drilldown unit

Setiap baris Unit Eselon II memiliki tombol `+`/`−`:

- `+` membuka daftar Unit Eselon III.
- `−` menutup daftar Unit Eselon III.
- Unit Eselon III memiliki tombol drilldown ke Unit Eselon IV.
- Unit tanpa child tidak dapat dibuka.

### 6.10 Tombol Bandingkan pada baris unit

Setiap baris Unit dan child memiliki tombol Bandingkan.

Tombol membuka popup `Unit Comparison` dengan metrik periode aktif dan periode sebelumnya.

Popup menampilkan:

- jumlah
- rata-rata
- koreksi
- status
- selisih
- persentase perubahan bila tersedia

---

## 7. Tab Daftar Pegawai

Tab ini menampilkan record hasil ekstraksi Kinerja untuk periode aktif.

Kolom meliputi:

- Nama
- NIP
- Unit Eselon II/III/IV
- Eselon
- NHK
- NPK
- NHK Kalibrasi
- NPK Kalibrasi
- NKP Awal
- Rating dan predikat awal
- Hukuman Disiplin
- Dampak Pelanggaran
- Dampak Perilaku
- Nilai Koreksi
- NKO
- NKP Perhitungan
- Status NKP Perhitungan
- NKP Akhir
- Rating, perilaku, predikat akhir
- Status

### 7.1 Cari Nama atau NIP

Kotak pencarian memfilter record yang mengandung teks pada:

- Nama
- NIP

Nilai pencarian dihitung dengan debounce agar tidak memuat ulang server terlalu cepat.

### 7.2 Lite View

Mengurangi kolom tabel menjadi set Lite:

- beberapa kolom detail disembunyikan
- kolom nama, NIP, unit, eselon, nilai utama, koreksi, dan status tetap tersedia

### 7.3 Atur Ulang Lebar Kolom

Mengembalikan lebar kolom tabel pegawai ke konfigurasi bawaan.

### 7.4 Bersihkan Pencarian dan Filter

Mengosongkan:

- pencarian nama/NIP
- semua filter kolom
- semua rentang angka

Tidak mengubah periode atau Lite View.

### 7.5 Filter kolom

Kolom dapat memiliki:

- dropdown pilihan nilai, misalnya Unit/Eselon/Status
- slider rentang minimum/maksimum untuk nilai numerik

Filter diterapkan server-side dan disimpan dalam state browser untuk akun.

### 7.6 Sorting tabel

Klik header untuk mengubah urutan.

- kolom numerik berubah dari kecil ke besar atau sebaliknya
- kolom teks berubah A–Z atau Z–A

### 7.7 Pagination

Navigasi tabel menampilkan halaman dan jumlah record.

- default: 50 record per halaman
- maksimum API: 200 record per permintaan
- halaman berpindah otomatis ke halaman terakhir jika filter mengurangi hasil

### 7.8 Edit Nilai Koreksi

Hanya tersedia untuk akun yang memenuhi hak Edit.

Klik nilai koreksi pada baris untuk membuka popup **Edit Nilai Koreksi**.

Nilai diterima:

- rentang -5 sampai 5, termasuk batas
- maksimal 8 angka desimal

Setelah disimpan:

- nilai koreksi diperbarui
- NKP Akhir dihitung ulang
- status NKP Akhir dihitung ulang
- satu edit log ditambahkan
- cache browser dibersihkan
- baris/Overview/Unit diperbarui

### 7.9 Unduh Template Excel Koreksi

Hanya untuk hak Edit.

Tombol **Unduh Template Excel** di popup Batch Input Koreksi menghasilkan workbook dengan:

- kolom `nip`
- kolom `nilai_koreksi`

NIP harus berupa teks agar digit 16/18 tidak hilang.

### 7.10 Batch Input Koreksi

Tombol **Batch input koreksi** membuka popup batch.

File yang diterima:

- hanya `.xlsx`
- maksimal 5.000 baris
- maksimal 5 MB
- header persis `nip, nilai_koreksi`

Validasi:

- NIP harus valid dan dikenal pada periode aktif
- koreksi harus angka
- koreksi harus -5 sampai 5
- maksimal 8 angka desimal
- NIP duplikat ditolak
- unknown NIP ditolak
- seluruh file diterapkan atomik atau tidak sama sekali

Setelah berhasil:

- record berubah dihitung ulang
- semua koreksi yang berubah masuk edit log
- record yang tidak berubah tidak membuat log
- cache dibersihkan

### 7.11 Koreksi Edit Log

Tombol **Koreksi Edit Log** membuka riwayat perubahan koreksi.

Kolom log:

- waktu
- periode
- nama pegawai
- NIP
- nilai lama
- nilai baru
- editor
- tombol Undo

**Undo dari sini**:

1. meminta konfirmasi
2. mengembalikan nilai koreksi lama
3. menghitung ulang NKP Akhir
4. menghapus edit yang dipilih dan semua edit sesudahnya untuk NIP/periode yang sama

Undo tidak membatalkan koreksi pada NIP/periode lain.

### 7.12 Wildcard Compare

Tombol **Wildcard Compare** membandingkan satu file Kinerja acak dengan record yang sedang dipilih oleh:

- pencarian Nama/NIP
- filter tabel
- filter rentang
- periode aktif

#### Format file

Gunakan **format CSV Kinerja penuh**:

- header persis sesuai unggah dataset penuh
- semicolon `;` atau comma `,` diterima
- delimiter dibaca dari baris header
- header dapat acak urutan
- NIP wajib ada
- NIP 16 atau 18 digit
- NIP duplikat ditolak

Baris yang kosong diabaikan.

#### Kolom yang dibandingkan

Hanya nilai berikut yang disertakan sebagai perbedaan:

- NHK
- NPK
- NKP Awal
- Nilai Hukuman Disiplin
- Nilai Dampak Pelanggaran Disiplin
- Nilai Dampak Perilaku
- Nilai Koreksi
- NKO
- NKP Akhir
- Status, dihitung dari NKP Akhir CSV

Nama, unit, eselon, dan kolom lain tidak dibandingkan pada fitur saat ini.

#### Hasil

Summary menampilkan:

- jumlah NIP cocok
- jumlah baris berbeda

Tabel hasil menampilkan satu baris untuk setiap kombinasi NIP dan kolom berbeda:

| Kolom | Arti |
|---|---|
| NIP | NIP yang cocok |
| Nama | Nama pada record database saat ini |
| Kolom Berbeda | Nama metrik |
| Nilai Sekarang | Nilai pada Analisis Kinerja |
| Nilai CSV | Nilai pada file acak |

Tombol **Unduh perbedaan CSV** mengunduh NIP, Nama, Kolom, Nilai Sekarang, dan Nilai CSV.

Wildcard Compare:

- tidak menyimpan file
- tidak menyimpan hasil
- tidak mengubah dataset
- tidak membuat koreksi edit log
- dijalankan satu kali pada saat tombol **Bandingkan Sekarang** ditekan

### 7.13 Unduh Daftar Pegawai Excel

Tombol unduh Excel menghasilkan file `daftar-pegawai-kinerja.xlsx`.

Export mengikuti:

- periode aktif
- pencarian
- filter kolom
- rentang numerik
- urutan tabel

### 7.14 Close Wildcard Modal

Tombol **×**, **Tutup**, atau klik area luar popup menutup modal apabila proses perbandingan sedang tidak berjalan.

---

## 8. Perhitungan Performa

### NKP Perhitungan

Dasar:

```text
NKP Awal dan NKO
```

Jika `NKP Awal >= NKO`:

```text
NKP Perhitungan = 70% × NKP Awal + 30% × NKO
```

Jika `NKP Awal < NKO`:

```text
NKP Perhitungan = 90% × NKP Awal + 10% × NKO
```

Status NKP Perhitungan menggunakan pembulatan tampilan dua desimal sebelum dikategorikan.

### NKP Akhir

Untuk koreksi manual dan sinkronisasi:

```text
Adjusted Base =
  NKP Awal
  - abs(Nilai Hukuman Disiplin)
  - abs(Nilai Dampak Pelanggaran Disiplin)
  + Nilai Koreksi
```

Jika `Adjusted Base > NKO`:

```text
NKP Akhir = 70% × Adjusted Base + 30% × NKO
```

Jika `Adjusted Base <= NKO`:

```text
NKP Akhir = 90% × Adjusted Base + 10% × NKO
```

Jumlah Dampak Perilaku tidak masuk formula.

### Pemberian Koreksi (%)

Pada tabel perbandingan Unit Eselon II, Pemberian Koreksi dipakai untuk menampilkan koreksi dalam bentuk persentase-perbandingan.

### Rata-rata Koreksi

Rata-rata koreksi hanya memakai koreksi bukan nol:

```text
sum(nilai koreksi bukan nol) / jumlah nilai koreksi bukan nol
```

### Gap Status

```text
Gap Status =
  Jumlah NKP Akhir Sangat Istimewa
  - Jumlah NKP Perhitungan Sangat Istimewa
```

Arti warna:

- positif: hijau
- nol: warna netral
- negatif: merah

### Perbandingan QoQ

Perbandingan memakai periode triwulan kalender sebelumnya, tidak sekadar periode terdekat yang tersedia.

Untuk status:

- menghitung persentase distribusi status pada periode aktif
- menghitung persentase distribusi pada periode sebelumnya
- menampilkan perubahan dalam persentase poin

---

## 9. Pengelolaan Data dan Cache

### Cache dashboard browser

Data Daftar Pegawai dan dashboard dapat disimpan sementara di browser hingga 5 menit.

Cache dicapai berdasarkan:

- akun browser
- periode
- pencarian/filter/sorting

Cache dibersihkan atau tidak dipakai saat:

- upload dataset berhasil
- EPRIDE sync berhasil
- koreksi manual berhasil
- koreksi batch berhasil
- undo koreksi berhasil
- periode dihapus

Cache tidak menyimpan hasil Wildcard Compare.

### Tampilan loading

Modul menampilkan progress bar proses pemuatan awal dengan tugas:

- dashboard
- employee records
- period status
- insight

Setiap tugas menampilkan waktu atau status gagal.

---

## 10. Aturan NIP

- NIP dari Kinerja boleh 16 atau 18 digit.
- Nilai NIP harus berupa teks pada CSV agar Excel/CSV tidak menghilangkan digit nol atau membulatkan angka.
- NIP yang mengandung separator atau whitespace dinormalisasi sesuai parser.
- Wildcard Compare dan koreksi batch menolak NIP yang tidak valid atau tidak ditemukan.
- NIP duplikat ditolak pada unggah penuh dan batch koreksi.

---

## 11. Format Gambar dan Rekomendasi Desain Grafis

Untuk tim desain grafis, rekomendasi visual:

### Screenshot yang perlu disiapkan

1. Halaman header dan periode switcher.
2. Popup Kelola Dataset—Unggah.
3. Popup Kelola Dataset—Sinkronisasi EPRIDE.
4. Overview dengan KPI utama.
5. Compare QoQ aktif.
6. Unit Eselon II dengan Eselon filter dan drilldown terbuka.
7. Daftar Pegawai desktop dan lite view.
8. Popup Edit Nilai Koreksi.
9. Popup Batch Koreksi.
10. Koreksi Edit Log.
11. Wildcard Compare awal, hasil berbeda, dan hasil kosong.

### Warna status

Gunakan warna yang konsisten dengan aplikasi:

- Sky: aksi aktif, filter, navigasi
- Emerald: sukses dan nilai positif
- Violet: Wildcard Compare
- Amber: peringatan dan koreksi/candidate conflict
- Rose: error, pengurangan, dan hapus
- Slate: panel dan teks sekunder

### Komponen berulang

- Header card periode
- Toolbar capsule
- Panel statistik
- Dialog fixed 90vh
- Tabel sticky header
- Tombol icon + text
- Status badge
- Empty-state dan error-state

---

## 12. Daftar Tombol Lengkap

| Area | Tombol | Fungsi |
|---|---|---|
| Header | Kelola Dataset | Membuka popup unggah/sinkronisasi |
| Periode | Tombol periode | Mengganti dataset triwulan |
| Periode | Ikon tempat sampah | Menghapus periode, Super Admin+ |
| Popup Dataset | × | Menutup popup |
| Upload | Periode dropdown | Memilih Q1–Q4 |
| Upload | Tahun | Memilih tahun periode |
| Upload | Referensi Pegawai | Memilih fetch_pbnopen atau dt_employee_q2_2026 |
| Upload | File CSV | Memilih file Kinerja |
| Upload | Validasi CSV | Memvalidasi tanpa menyimpan |
| Upload | Simpan Dataset Periode | Menerapkan dataset setelah validasi |
| EPRIDE | Tahun Sumber | Memilih tahun form EPRIDE |
| EPRIDE | TW Sumber | Memilih TW sumber |
| EPRIDE | Pilihan konflik radio | Memilih nilai koreksi kandidat |
| EPRIDE | Periksa EPRIDE | Membuat pratinjau sinkronisasi |
| EPRIDE | Sinkronkan periode | Menerapkan koreksi setelah pratinjau |
| Tab | Overview / Unit Eselon II / Daftar Pegawai | Berpindah tab |
| Overview | Compare QoQ | Membuka/mematikan perbandingan triwulan |
| Overview | Unit Eselon II dropdown | Filter unit |
| Overview | Unit Eselon III dropdown | Filter unit III |
| Overview | Unit Eselon IV dropdown | Filter unit IV |
| Overview | Eselon dropdown | Filter Eselon |
| Overview | Simpan Insight | Menyimpan catatan pimpinan |
| Unit | Eselon dropdown | Filter Eselon independen tab Unit |
| Unit | Cari nama unit | Menyaring hierarki unit |
| Unit | Lite View | Tampilan ringkas |
| Unit | Reset lebar kolom | Mengembalikan lebar kolom |
| Unit | Bandingkan seluruh dataset | Membandingkan seluruh Unit dengan periode sebelumnya |
| Unit | Unduh Excel | Mengekspor Unit Eselon II/III/IV |
| Unit | Header sortable | Mengurutkan kolom |
| Unit | `+`/`−` | Membuka/menutup drilldown III/IV |
| Unit | Bandingkan baris | Membuka popup perbandingan unit/baris |
| Daftar | Cari Nama/NIP | Memfilter pegawai |
| Daftar | Lite View | Tampilan ringkas |
| Daftar | Reset lebar kolom | Mengembalikan lebar kolom |
| Daftar | Bersihkan pencarian/filter | Mengosongkan pencarian dan filter |
| Daftar | Batch input koreksi | Membuka popup batch |
| Daftar | Koreksi Edit Log | Membuka riwayat dan Undo |
| Daftar | Wildcard Compare | Membuka pembanding CSV |
| Daftar | Unduh daftar Excel | Mengekspor record terfilter |
| Daftar | Header sortable | Mengurutkan kolom |
| Daftar | Filter kolom dropdown | Memilih nilai kolom |
| Daftar | Slider Min/Maks | Memfilter nilai numerik |
| Daftar | Nilai koreksi sebagai tombol | Membuka editor koreksi tunggal |
| Daftar | Sebelumnya/Berikutnya | Pergantian halaman |
| Koreksi Tunggal | × / Batal | Menutup tanpa menyimpan |
| Koreksi Tunggal | Simpan | Menyimpan koreksi dan menghitung ulang |
| Batch Koreksi | × / Batal | Menutup popup |
| Batch Koreksi | Unduh Template Excel | Mengunduh template nip/nilai_koreksi |
| Batch Koreksi | Pilih file .xlsx | Memilih workbook koreksi |
| Batch Koreksi | Validasi dan Terapkan | Menerapkan batch atomik |
| Edit Log | × | Menutup popup |
| Edit Log | Undo dari sini | Mengembalikan koreksi dan menghapus log sesudahnya |
| Edit Log | Sebelumnya/Berikutnya | Pergantian halaman log |
| Wildcard | Pilih file .csv | Memilih CSV acak |
| Wildcard | Bandingkan Sekarang | Membandingkan satu kali |
| Wildcard | Unduh perbedaan CSV | Mengekspor baris berbeda |
| Wildcard | × / Tutup | Menutup popup |
| Unit Comparison | × / Tutup | Menutup popup perbandingan |

---

## 13. File Utama untuk Maintenance IT

| Kebutuhan | File |
|---|---|
| UI tab/toolbar/dialog | `frontend/src/pages/PerformanceAnalysisPage.tsx` |
| API route dan autentikasi | `backend/app/api/performance_kinerja.py` |
| Dashboard, agregasi, cache | `backend/app/services/kinerja/dashboard.py` |
| Upload dan snapshot pegawai | `backend/app/services/kinerja/uploads.py` |
| Koreksi manual/batch/EPRIDE/log | `backend/app/services/kinerja/corrections.py` |
| Record, filter, Wildcard Compare | `backend/app/services/kinerja/records.py` |
| Export Excel | `backend/app/services/kinerja/exports.py` |
| Formula/status/nilai | `backend/app/services/kinerja/common.py` |
| Schema request/response | `backend/app/schemas/performance_kinerja.py` |
| Model database | `backend/app/models/performance_kinerja.py` |
| Hak menu | `backend/app/services/menu_access_service.py` |
| Router/prefix | `frontend/src/App.tsx`, `frontend/src/services/api.ts` |

---

## 14. Checklist Pengujian untuk IT

1. Coba login sebagai Guest, User, Super Admin, dan God User.
2. Pastikan tombol Super Admin dan Edit hanya muncul sesuai hak.
3. Unggah CSV lengkap valid dan invalid.
4. Pastikan header random pada Wildcard Compare diterima hanya pada urutan acak yang sama.
5. Pastikan NIP 16/18 digit tidak berubah menjadi float/Excel scientific notation.
6. Uji EPRIDE dengan form unik, duplikat, nilai 0, dan konflik nonzero.
7. Uji koreksi tunggal -5, 0, dan 5.
8. Uji batch koreksi dengan unknown NIP dan duplicate NIP.
9. Uji Undo dan pastikan edit sesudahnya untuk NIP/periode yang sama ikut terhapus.
10. Uji perubahan periode dan pastikan snapshot tidak berubah antarperiod.
11. Uji Semua filter, search, sorting, pagination, dan export.
12. Uji Wildcard Compare pada filter yang menghasilkan beberapa NIP dan hasil CSV.
13. Pastikan cache browser dibersihkan setelah unggah, sinkronisasi, koreksi, dan Undo.
14. Pastikan tidak ada perubahan data dari Wildcard Compare.
