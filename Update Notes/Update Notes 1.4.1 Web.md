# Update Notes: Web 1.4.1

This update documents web changes not included in the finalized [Web 1.4.0 notes](./Update%20Notes%201.4.0%20Web.md). It does not describe a new desktop build.

## Analisis Kinerja DJPb

### EPRIDE correction synchronization

- Super Admins can synchronize correction values directly from EPRIDE and choose the source year and TW independently from the target performance dataset period.
- Available submitted EPRIDE periods are checked when the **Kelola dataset** panel opens. The list includes eligible submitted forms with detail rows and a valid 13-digit `idUnit`.
- A preview shows the selected source data before applying it. Conflicting nonzero corrections can be resolved per NIP; synchronization fetches the source again and validates those choices before updating the dataset.

### NKP Perhitungan

- Each employee now has a persisted `NKP Perhitungan`, calculated as 70% NKP Awal + 30% NKO when NKP Awal >= NKO, or 90% NKP Awal + 10% NKO otherwise. `Status NKP Perhitungan` uses the existing five score bands.
- Status classification follows the score rounded to the two decimal places shown in the employee table. Startup migration backfills older scores and refreshes saved statuses, including values that display as 115.00.
- The Unit Eselon II analysis counts employees with `Status NKP Perhitungan` of `Sangat Istimewa`. The score and status are available in Daftar Pegawai, including Lite View, and in exports.

### Unit analysis and comparison

- **Gap Status** is now the Unit's `NKP Akhir Sangat Istimewa` count minus its `NKP Perhitungan Sangat Istimewa` count. Positive values are green, zero uses the default text color, and negative values are red. Gap Status is also available in Unit Eselon II Lite View.
- Unit comparisons now show status distributions for NKP Perhitungan and NKP Akhir instead of the obsolete NKP Awal status distribution. The Gap Status comparison label reflects the updated calculation.
- The Overview Compare toggle uses a scales icon.

### Table usability

- Unit Eselon II and Daftar Pegawai tables now scroll inside height-limited containers with frozen column headers. The employee table's column-filter row remains visible with its header.
- The scrollable tables support both Full View and Lite View; horizontal scrolling remains available for wide tables.
