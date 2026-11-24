# Update Notes: Web 1.5.1

## Analisis Kinerja

- Added an Eselon-level filter to the Unit Eselon II tab. It filters the Unit Eselon II/III/IV metrics and period comparisons without changing the Overview filters.
- The Unit Eselon II Excel export follows the selected Eselon filter.
- Updated the Overview's **Rata-rata Nilai Koreksi** calculation to divide the sum of all correction values by the number of nonzero corrections, excluding zero values from the denominator. The average is unavailable when there are no nonzero corrections.

## Accounts and sessions

- Increased the authenticated session expiry from one hour to two hours. Session refresh and expiry checks use the same two-hour limit.

## Penyusunan Kandidat

- Batch and Single exports both generate PPTX presentations with a separate slide for each candidate where required. Single export no longer creates a ZIP of separate PPTX files.
- Batch candidate cards now replace the `Masa Kerja` tenure placeholders using each employee's `TMT Jabatan`, with durations calculated in years and months.
- Candidate records stage database-derived profile fields and Pertimbangan for manual review/editing before export. Export uses the staged values when they have been reviewed or changed; if no edit is made, the initial database values remain.
- The Single format includes the **Tour of Duty** field from `ref_history_jabatan.Jabatan` (up to three nonempty lines). Candidate staging now fetches this history initially, and legacy blank staged history falls back to the live history value. The Batch format does not include Tour of Duty.

## Menu authorization

- Fixed the Set Auth Menu save button, which was disabled because it checked for 9 menu policies while the application has 11.
