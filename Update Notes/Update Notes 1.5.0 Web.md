# Update Notes: Web 1.5.0

This note consolidates Web 1.5.0 implementation work not already covered by the Web 1.4.1 notes. The toolbar Patch Notes panel now includes a Web 1.5.0 entry, while the application version label remains 1.4.1; this does not announce that 1.5.0 has shipped.

## Analisis Mutasi/Promosi

- Added the experimental **Analisis Mutasi/Promosi** menu and Administrator/Pengawas workspace workflow.
- Workspaces support title, TMT, description, status, editing, and deletion. Each workspace owns its dataset; uploaded and cleaned files are persisted and restored when the in-memory cache is cleared.
- Administrator workspaces use Sitasi Es.III cleaning; Pengawas workspaces use Sitasi Es.IV cleaning. Data Load derives NIP from `Nama/NIP` and checks it against `pbncleaner.dt_employee`, preserving NIP values as text to avoid Excel precision loss.
- Employee lookups enrich the cleaned data with `Masa Jabatan`, calculated from `dt_employee.TMT Jabatan` through the current date.
- `Kategori` is assigned using the workspace-specific `dt_employee.eselon_id` mapping:

| Workspace | Eselon IDs | Category |
|---|---|---|
| Administrator | 11, 3 | Mutasi |
| Administrator | 4, 5, 6 | Promosi |
| Administrator | 2 | Demosi |
| Pengawas | 4 | Mutasi |
| Pengawas | 6 | Perpindahan dari Fungsional |
| Pengawas | 5, 7, 8, 9, 10 | Promosi |
| Pengawas | 1, 2, 3, 11 | Demosi |

- Unmatched or unmapped rows show `Pilih/Unidentified`. Users can choose a category manually for either workspace type; manual values persist, override automatic classification, and remain after reanalysis or restore.
- Added the **Talent Finder** tab for both workspace types. It is independent of CSV upload and searches `dt_employee` with Eselon and Rumpun checkbox filters plus a name search.
- Talent Finder counts matches before loading results, then fetches paginated and server-sortable rows. Columns include Nama, Eselon, Usia, Jabatan, Pendidikan, Jurusan, Universitas/Sekolah Tinggi, Lama Eselon, Lama Jabatan, and Homebase. `Lama Eselon` uses the TMT field corresponding to the employee's Eselon.
- The Overview and Daftar Pegawai tabs remain placeholders.

## Fragment Petikan

- Added an experimental **Fragment Petikan** menu and PDF splitting workflow. PDFs up to 100 MB can be split into user-selected page-count fragments and downloaded together as a ZIP.
- The default name is extracted from the first text match between configurable start/end markers (`Sdr.` and `(NIP` by default) in each fragment. Image-only/scanned text is not OCR-processed.
- Output files use the format `1_<name>_Petikan.pdf`. Names are sanitized and limited to 50 characters; duplicate names receive a sequence suffix. Fragments without a name match use `Tanpa Nama`.
- Users can exclude individual pages or page ranges, for example `1,3-5`. Any final partial fragment is included and reported.

## Insight Hub

- Refreshed the cleaned-dataset Insight Hub and live-database Insight Hub Beta with a responsive filter workspace, searchable checkbox filters, range inputs for age and tenure, and active-filter controls.
- Added cross-filtering from eligible charts and a filtered employee list with search and CSV export.
- Chart views support switching between chart and table representations where applicable.
- Removed the legacy Insight Hub menu and route; Insight Hub Beta remains available.

## Accounts and sessions

- New and reset passwords are stored as Argon2 hashes using `pwdlib`. Existing plaintext passwords are upgraded to a hash after a successful login.
- Registration and Admin account creation reject usernames containing whitespace and report the validation error before submission.
- Added session status and refresh endpoints. The toolbar shows remaining session time and supports explicit refresh with token rotation while retaining the one-hour session limit.

## Landing page and interface

- Added an alternative landing-page layout alongside the legacy layout. Users can switch layouts from the toolbar; the choice is stored per user for signed-in accounts and locally for guests.
- Refined the UI across all application modules for a more consistent experience.
- Added a standalone Jabatan analysis UI prototype, but it is intentionally not connected to the active Kinerja route or API. It remains deferred until the employee-to-unit mapping and historical-period rules are confirmed.

## Data sync and Kinerja details

- Employee-table synchronization recognizes long-form Kanwil source labels and maps them to existing canonical `ref_unit_kerja` labels, preserving reference IDs rather than creating duplicate units.
- Unit Kinerja metrics now expose correction percentage for display and comparison.
- Split Kinerja and Pelantikan backend services into workflow-focused packages. Removed their compatibility facades and changed API/auth callers to import the modules they use directly. This is a maintainability refactor; no runtime performance gain is claimed without measurement.
