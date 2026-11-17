# Update Notes: Web 1.4.0

This update documents web changes added after Web 1.3.0. It does not describe a new desktop build; desktop navigation and release scope remain separate.

## Generate ND Undangan Pelantikan

- The all-sheets workflow is now the primary Generate ND route. It supports combining all sheets, combining selected sheets, isolating sheets, or processing a single sheet. The former experimental URLs redirect to the primary workflow; existing single-sheet agendas remain resumable.
- Agenda history and editing are streamlined, with read-only details by default and icon-only edit/save/cancel controls. The Daring/Luring choice is available as a quick toggle. Employees mapped to DKI Jakarta default to Luring; other employees default to Daring.
- Duplicate NIP occurrences remain individually visible, but duplicate selections are blocked when saving or generating; Select All selects no more than one occurrence per NIP.
- The roster has a Lite View and adjustable column widths saved in the browser. Lite View emphasizes the eight compact roster fields. Preview groups retain their unit and modality, show the matched city, and can be filtered by match status or modality; isolated-sheet workflows also retain the source sheet.
- Users can select which complete generated documents to download. A single selected Unit × modality document downloads as DOCX; multiple selected documents are packaged as ZIP. For isolated-sheet imports, source sheet is also part of the group. The backend checks that requested participant selections form complete document groups.
- The preview can generate one ND Pengantar appendix DOCX for selected participants. Rows are ordered Luring before Daring and then by unit ID.
- Pelantikan monitoring can be exported to Excel with participant details and per-unit counts.

## Analisis Kinerja DJPb

- Performance data is retained by quarter. A period selector sits above and outside the Overview, Unit Eselon II, and Daftar Pegawai tabs; the newest available quarter is selected by default. Dashboard views, records, filters, and exports follow the selected period.
- Uploading a quarter that already exists replaces only that quarter. Other quarters remain available.
- Overview status distributions show counts and percentages for the selected and preceding quarter; status changes are percentage-point differences between each status share. Analysis controls use compact icon toolbars; employee filters use values present in the selected dataset, and supported numeric metrics have range filters.
- The Overview `Compare` toggle compares cards and charts in place with the immediately preceding calendar quarter. Unit Eselon II, III, IV, and Eselon filters apply to both periods; missing prior-quarter data is explained while the selected-period dashboard remains visible. Positive changes are green, negative changes red, and unchanged values neutral.
- Overview and Daftar Pegawai dropdown options update dynamically based on the other active filters; the employee list also considers numeric ranges and name/NIP search.
- Super Admin upload and adjustment forms are accessed from a compact data-management control rather than taking up space in the dashboard.
- Full-dataset uploads snapshot matched employee details from `fetch_pbnopen` by default or the selected historical `dt_employee_q2_2026` reference. Unit Eselon II and Daftar Pegawai use those snapshots instead of re-reading the default employee table, so the chosen source remains consistent across analysis tabs.
- Unit Eselon II rows can open a comparison with the immediately preceding calendar quarter, and a separate control compares the entire selected dataset. The comparison includes available numeric metrics, deltas, percentage changes where meaningful, and NKP status distributions. If the exact prior calendar quarter is missing, no comparison is shown. Percentage changes are bold, red when negative, and green when positive; the print icon opens a report-only browser print view for PDF export.
- Unit rows default to ascending `unit_kerja_id` order with missing IDs last. Numeric columns can be sorted in either direction at Unit Eselon II, III, and IV levels. The ID is snapshotted from `ref_unit_kerja` for `fetch_pbnopen` uploads or directly from `dt_employee_q2_2026`.
- Unit Eselon II search matches names across Eselon II, III, and IV and preserves the matching hierarchy path.
- Lite View and Full View include `Pemberian Koreksi (%)`, calculated as employees with a nonzero correction divided by unit employee count. This value can also be sorted numerically.
- Dashboard calculations and filter metadata are cached per period for up to five minutes. Successful uploads and adjustments invalidate the affected cache.

## Admin database management

- Added the Level 4 God User role with Super Admin capabilities and database-maintenance access. The role is username-independent; startup promotes `salmanmfa`, and Level 4 administrators can assign Level 4 to other accounts.
- The existing Admin database popup now contains an allowlisted table selector, preview, and explicit apply/sync actions. Level 3 Super Admins see `You have no authority to view this page.` in the popup and are independently denied by the database APIs.
- Current and Q2-2026 `fetch_pbnopen` source tables can be replaced from a validated CSV. Corresponding `dt_employee` tables are sync-only and map shared reference tables by label while preserving `employee_id` for matching NIPs.
- The five shared `ref_*` tables can be updated by primary ID. Existing IDs are preserved and an ID still used by either employee table cannot be removed. Source replacement, reference updates, and employee synchronization are transactional and use preview counts before applying.
- The role migration was verified with SQLite fixtures, including session/preference foreign keys. It has not been run against the live MySQL/MariaDB database; back up and test against a copy before deployment.

## Developer setup

- Added a one-time Windows bootstrap (`setup-developer.bat` / `setup-developer.ps1`) for prerequisite checks, backend/frontend dependency setup, a production frontend build, local XAMPP database import, and creation of the Git-ignored backend `.env`.
- The bootstrap requires a separately supplied schema/reference-data dump and explicit confirmation before importing into local `pbncleaner`. The dump should include empty `fetch_pbnopen` and `dt_employee` tables and populated reference tables; employee data is uploaded and synchronized later through Admin. It is not a production database migration tool.

## Backend and database notes

- PBN dashboard database reads are separated into a repository, while filtering and aggregation remain in the service layer. Insight Hub and Insight Hub Beta continue to share dashboard behavior.
- Startup schema migration changes performance records from NIP-only identity to `(dataset_id, nip)` and makes the period unique. It preserves the existing dataset in its recorded quarter; it does not intentionally discard prior data.
- The updated `backend/sql/006_create_performance_kinerja.sql` describes fresh installations. Existing installations are migrated by `init_history_db()` at startup. The legacy-schema migration was verified with SQLite fixtures, not against the live MySQL/MariaDB database. Back up and test on a database copy before deploying schema changes; the development launcher uses the configured database as well.

## Unchanged scope

- Bahan Pendukung MPK and Simulasi Mutasi remain web placeholders.
- This is a web update only; it does not claim that a desktop build was produced.
