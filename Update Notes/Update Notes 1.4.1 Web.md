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
- Daftar Pegawai Lite View now shows only Nama, Unit Eselon II, Eselon, NKP Awal, Nilai Koreksi, NKO, Nilai Perhitungan, Status NKP perhitungan, NKP Akhir, and Status.
- Daftar Pegawai columns can be resized with a pointer or keyboard, with per-user browser persistence, a reset control, and automatic fit to the table when Lite View is activated.

### Manual correction editing

- Admins and Super Admins can click a `Nilai Koreksi` value in Daftar Pegawai to edit it. Manual values may be between -5 and 5 inclusive, and saving recalculates NKP Akhir with the existing formula.
- The **Koreksi Edit Log** records the previous/new value, period, NIP, editor, and timestamp. Undo restores the value before the selected edit and removes that edit plus later edits for the same NIP and period.
- A successful full dataset upload or EPRIDE sync clears correction-edit logs for every period; failed operations keep the history.
- The **Batch input koreksi** action downloads a two-column `nip`/`nilai_koreksi` Excel template and applies valid rows to the displayed period. NIP cells must be text; apostrophe/backtick prefixes are accepted. Each changed row is recalculated and logged. Validation is all-or-nothing, with duplicate/unknown NIPs rejected. The synchronous batch is capped at 5,000 rows and 5 MB.
- Super Admins can delete a dataset period from the period selector after confirmation; the period's employee data and correction-edit logs are removed together. Switching periods, exporting either performance workbook, and saving manual corrections now show a spinning loader while the request is running.

### Browser persistence

- Employee query results are stored in per-user IndexedDB and shown immediately after reload while the server is rechecked. The active tab, period, employee filters, search, sort, page, and Lite View are also restored.
- Cached edit logs are checked against the server before Undo is enabled.

## Menu access controls

- Each web menu has configurable minimum access levels for **View** and **Edit**. All nine menu cards remain visible; opening a menu without View permission shows a **No Auth** dialog, and direct routes and API requests are also enforced.
- View-only access keeps data browsing and exports available while disabling data-changing controls. Edit access enables the menu's permitted changes, subject to existing protections for sensitive operations.
- Only God User (Auth Level 4) can update menu policies. Admin Page defaults to Super Admin (Level 3), and Auth Level 2 is displayed as **Special User**.
- Fixed the **Set Auth Menu** button: its dialog now opens independently instead of being nested inside the Database Management dialog.
