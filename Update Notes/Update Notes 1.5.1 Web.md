# Update Notes: Web 1.5.1

## Analisis Kinerja

- Added an Eselon-level filter to the Unit Eselon II tab. It filters the Unit Eselon II/III/IV metrics and period comparisons without changing the Overview filters.
- The Unit Eselon II Excel export follows the selected Eselon filter.
- Updated the Overview's **Rata-rata Nilai Koreksi** calculation to divide the sum of all correction values by the number of nonzero corrections, excluding zero values from the denominator. The average is unavailable when there are no nonzero corrections.
- Added a **Wildcard Compare** action to Daftar Pegawai. It accepts the full semicolon/comma Kinerja CSV format, matches NIPs against the active Daftar Pegawai filters/search, and shows only differing rows in a modal with optional CSV download. It is a one-time comparison and does not cache uploaded data.
- Repositioned the Unit Eselon II **Eselon** filter as a compact control inside the table action toolbar.

## Accounts and sessions

- Increased the authenticated session expiry from one hour to two hours. Session refresh and expiry checks use the same two-hour limit.

## Penyusunan Kandidat

- Batch and Single exports both generate PPTX presentations with a separate slide for each candidate where required. Single export no longer creates a ZIP of separate PPTX files.
- Batch candidate cards now replace the `Masa Kerja` tenure placeholders using each employee's `TMT Jabatan`, with durations calculated in years and months.
- Candidate records stage database-derived profile fields and Pertimbangan for manual review/editing before export. Export uses the staged values when they have been reviewed or changed; if no edit is made, the initial database values remain.
- The Single format includes the **Tour of Duty** field from `ref_history_jabatan.Jabatan` (up to three nonempty lines). Candidate staging now fetches this history initially, and legacy blank staged history falls back to the live history value. The Batch format does not include Tour of Duty.

## Insight Hub

- Insight Hub Beta now supports employee-name keyword search by `fetch_pbnopen.Nama Gelar` above the filter panel.
- The employee table supports choosing visible/exported columns, while retaining the default preview columns.
- Replaced the Pendidikan Dominan card with the live Employee Nearing Retirement count. Employees in Eselon IDs 2 and 11 use age 60; all other employees use age 58. The count includes employees retiring within the next 3 calendar months.

## Menu authorization

- Fixed the Set Auth Menu save button, which was disabled because it checked for 9 menu policies while the application has 11.
- Set Auth Menu now permits Guest/Level 0 as a Minimum Edit level for any menu policy. Edit level must still not be lower than View level. This enables temporary/local guest editing permissions without requiring a permanent account.
