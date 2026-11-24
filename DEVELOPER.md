Developer Guide

This file helps new contributors (especially juniors) understand where to make changes, how the project is organized, and common development tasks.

**Release scope**
- The current web update is **1.4.1**. See [web update notes 1.4.1](./Update%20Notes/Update%20Notes%201.4.1%20Web.md), [planned web update 1.4.2](./Update%20Notes/Update%20Notes%201.4.2%20Web.md), [web update notes 1.4.0](./Update%20Notes/Update%20Notes%201.4.0%20Web.md), [web update notes 1.3.0](./Update%20Notes/Update%20Notes%201.3.0%20Web.md), [web update notes 1.2.1](./Update%20Notes/Update%20Notes%201.2.1%20Web.md), and [desktop update notes](./Update%20Notes/Update%20Notes%201.2%20Desktop.md).
- Desktop main navigation is limited to PBN Analytics and Insight Hub and has no login system. The additional web menus and account workflow are web-only.
- Generate ND Undangan Pelantikan is available to signed-in web users; its all-sheets workflow is the primary route, and document downloads can be selected by unit and modality. Analisis Kinerja DJPb is publicly readable, including Guest mode; Super Admins and the reserved God User can upload or adjust data. It retains multiple quarters, with per-quarter replacement and prior-quarter comparisons. Bahan Pendukung MPK and Simulasi Mutasi remain web placeholders; version **2.0** is the planned milestone for those workflows.

**Overview**
- **Purpose**: A data management platform for PBN dataset cleaning and analytics. Backend is FastAPI (Python), frontend is React 19 + Vite with React Router (TypeScript).
- **Architecture**: Modular page-based routing using React Router v7. Each major feature lives in its own route under `frontend/src/pages/` with shared hooks and services.

**Quick start (local)**
- First-time Windows setup:
  - Install XAMPP and start its local MySQL service. Prepare a current `pbncleaner` schema/reference-data dump with the `fetch_pbnopen` and `dt_employee` table definitions but no employee rows, populated reference tables, and `ref_unit_kerja.city` / `prov`. The dump is supplied separately and is not stored in the repository.
  - Run `setup-developer.bat` once. It checks/installs Python 3.12 and Node.js 22.12+, installs backend/frontend dependencies, builds the frontend, asks before importing into the local `pbncleaner` database, and writes the Git-ignored `backend/.env`.
  - The setup does not install XAMPP or create an Admin account. After setup, run `run-app.bat` and create the `salmanmfa` account as a Super Admin; startup promotes it to Level 4. Database maintenance is available to Level 4 accounts. Only Level 4 administrators can assign or manage Level 4 accounts. Imports can replace local database contents; never target production.
- Backend:
  - Create and activate a Python virtualenv in `backend/`.
  - Install dependencies: `pip install -r requirements.txt`.
  - Run the dev server: `python run_server.py` (auto-detects free port).
  - Health: `GET http://localhost:8000/health`.
- Frontend:
  - From `frontend/`: `npm install` then `npm run dev` for development or `npm run build` for production build.
  - Routes include `http://localhost:5173/`, `/pbn-analytics`, `/insights`, `/insights-beta`, `/analisis-kinerja`, `/manajemen-plt-plh`, and `/undangan-pelantikan`. The old `/undangan-pelantikan-experimental` paths redirect to the primary workflow.
- One-click local launch:
  - Double-click `run-app-testing.bat` from the repo root to start local backend and Vite frontend servers on separate ports.
  - The development backend uses the same database and dataset storage configured for the LAN app. Development writes and startup schema migrations are shared with the live app; use care when testing changes.
- One-click network launch:
  - Double-click `run-app.bat` from the repo root. With `host: "auto"`, the launcher detects the current Wi-Fi/LAN IPv4 address, builds the frontend API URL, and configures the matching CORS origin.
  - Set `host` in `config.json` to a hostname or reserved address to override automatic detection.
  - Serve the built frontend with `serve-frontend.ps1` if needed; it supports direct navigation and refreshes on app routes such as `/login`.

**Repository layout (important files)**
- `backend/` — FastAPI app
  - `main.py` — app entrypoint and router registration.
  - `run_server.py` — Uvicorn launcher with dynamic port detection (finds free port starting from 8000).
  - `app/api/cleaning.py` — cleaning endpoints (apply auto-clean, remove columns, rename, remove duplicates, delete rows, header actions).
  - `app/services/cleaning_recommendation_service.py` — compares an uploaded sheet with the verification workbooks and returns a recommendation without modifying the dataset.
  - `templates/verification/` — source-format workbooks used by cleaning-method recommendation.
  - `app/api/insights.py` — PBN dashboard endpoint; filter requests return recalculated full-dataset aggregates.
  - `app/api/insights_beta.py` — database-backed Insight Hub Beta endpoints for `pbncleaner.fetch_pbnopen`.
  - `app/api/plt_plh.py` — Plt./Plh. monitoring API, including the Admin-only PBN Open employee search.
  - `app/api/pelantikan_agenda.py` — owner-scoped agenda, roster upload/matching, participant choices, and ZIP generation API.
  - `app/api/performance_kinerja.py` — public performance dashboard/records/exports, Admin manual-correction and edit-log/undo endpoints, and Super Admin dataset upload/EPRIDE correction-check and sync endpoints.
  - `app/api/auth.py` — login, public registration, session, user-preference, and admin-account endpoints.
  - `app/api/feedback.py` — authenticated feedback submission and Admin-only feedback management.
  - The `auth.py` Admin router exposes Level 4-only, allowlisted database preview/apply/sync endpoints; only Level 4 administrators can assign Level 4 through account management.
  - `app/api/chat.py` — authenticated chat endpoint; provider credentials remain backend-only.
  - `app/services/chat_service.py` — sends a concise, code-maintained capability summary to Groq on each request; it does not reread README or developer documentation at runtime. Keep that summary aligned with verified app behavior when features change.
  - `app/services/dataset_service.py` — core DataFrame logic. Routes to programmatic cleaners or parses legacy text rule files.
  - `app/repositories/pbn_dashboard_repository.py` — isolates reads from the shared employee-source table.
  - `app/services/pbn_dashboard_service.py` — validates cleaned dashboard columns, applies filters, and calculates employee totals and chart distributions using the repository.
  - Insight Hub Beta reuses the same dashboard service calculations and response schemas; it reads `pbncleaner.fetch_pbnopen` from the configured SQLAlchemy engine.
  - `app/services/kinerja/` — performance workflows split across shared calculations, uploads, corrections, dashboard/cache, record data, queries, and exports. Keep `__init__.py` lightweight; API/auth callers import the specific modules they use.
  - `app/models/performance_kinerja.py` and `app/schemas/performance_kinerja.py` — persisted performance data models and API types.
  - `app/services/pbnopen_import_service.py` — allowlisted source replacement, key-preserving reference-table maintenance, and NIP-based employee synchronization, with preview and transactional apply paths.
  - `app/services/auth_service.py` — account/session lifecycle, role invariants, and persisted appearance preferences.
  - `app/history_db.py` — startup migration promotes `salmanmfa` to Level 4 and updates the generic 1–4 role constraint; the SQLite migration preserves related session/preference rows.
  - `app/cleaners/` — programmatic cleaner modules:
    - `pbn.py`, `pbn_edu.py`, `pbn_edu_hb.py`, `sitasi_esiii.py`, `sitasi_esiv.py` — each returns a cleaning config dict.
  - `app/storage/dataset_store.py` — in-memory dataset store (UUID -> sheets). Note: data is ephemeral (restarts clear data).
  - `app/history_db.py` — shared SQLAlchemy MySQL/MariaDB engine and session, model registration, and startup schema migrations.
  - `app/models/auth.py` — account, session, and per-user preference models.
  - `app/models/cleaning_history.py` — SQLAlchemy model for cleaning history table.
  - `app/models/plt_plh.py` and `app/services/plt_plh_service.py` — monitoring records, derived tenure/status, Excel export, and replacement-employee lookup.
  - `app/models/pelantikan_agenda.py` and `app/services/pelantikan_agenda/` — persistent agenda/participant snapshots and modular roster, document, and export workflows.
  - `app/models/user_feedback.py` and `app/services/feedback_service.py` — persisted user feedback and Admin inbox operations.
  - `app/utils/employee_formatting.py` — shared definitive job-title formatting for employee-backed workflows.
  - `app/schemas/pbn_dashboard.py` — dashboard filter request schema.
  - `app/services/history_service.py` — logging and retrieval helpers for cleaning history.
  - `Cleaning Logic/` — directory containing text rule files (legacy fallback; prefer programmatic cleaners).
  - `sql/001_create_cleaning_history.sql` — MySQL bootstrap script for database and table.
  - `sql/002_create_plt_plh_monitoring.sql` — Plt./Plh. monitoring schema, including the optional NIP snapshot.
  - `sql/005_create_pelantikan_agendas.sql` — Pelantikan agenda and participant snapshot schema.
  - `sql/006_create_user_feedback.sql` — persistent feedback submissions and submitter reference.

- `frontend/` — React + Vite app with React Router
  - `src/pages/` — page components for each route:
    - `LandingPage.tsx` — landing page with feature selector cards (`/` route).
    - `AnalyticsPage.tsx` — PBN dataset cleaning interface (`/pbn-analytics` route).
    - `InsightHubPage.tsx` — PBN Open + Edu + HB interactive dashboard (`/insights` route).
    - `LoginPage.tsx` / `AdminPage.tsx` — web authentication entry, feedback inbox, Super Admin account workspace, and the God User database-maintenance dialog.
    - `PltPlhManagementPage.tsx` — web-only monitoring UI.
    - `PelantikanAgendaPage.tsx` — web-only agenda, participant preview, and document-generation UI.
  - `src/App.tsx` — React Router routes, session gate, role gate, and shared toolbar/chat/feedback widget mounting.
  - `frontend/index.html` — browser document title (`MPK Workspace`).
  - `src/contexts/AuthContext.tsx` — authentication, Guest mode, and session state.
  - `src/components/AppToolbar.tsx` — draggable clock, collapsible tools, theme menu, and toolbar dialogs. The in-app Patch Notes content and default selected version are maintained in `PATCH_NOTES` and `selectedPatchVersion` here.
  - `src/components/ChatWidget.tsx` — authenticated Groq chat UI and Markdown rendering.
  - `src/components/FeedbackWidget.tsx` — compact menu-tagged feedback form beside Groq chat.
  - `src/main.tsx` — app entry point wrapping App with `<BrowserRouter>`.
  - `src/hooks/useDataset.ts` — high-level dataset actions and API calls used across UI.
  - `src/services/api.ts` — HTTP wrapper functions to backend endpoints.
  - `src/features/cleaning/DataTable.tsx` — table viewer; handles paging, filtering, sorting.
  - `src/pages/InsightHubPage.tsx` — dashboard controls and distribution charts; receives the current dataset ID and sheet name in the URL.
  - `src/pages/PerformanceAnalysisPage.tsx` — quarter selector outside the Overview/Unit Eselon II/Daftar Pegawai tabs, period-aware views, filters, and Super Admin data-management dialog.

- `config.json` — centralized deployment config; `host: "auto"` enables dynamic LAN address discovery, while ports and loopback CORS origins remain configurable.
- `resolve-network-config.ps1` — shared host resolver used by network launch/deployment scripts; it prefers active Wi-Fi and computes the corresponding frontend CORS origin.

**Admin database maintenance (web)**
- The existing Admin database popup is retained. Level 3 Super Admins can open it but see `You have no authority to view this page.`; API routes independently require Level 4 for database operations. Level 3 retains its other Super Admin capabilities.
- Level 4 is a role, not a username restriction. `init_history_db()` promotes the `salmanmfa` account and updates the database check constraint at startup. Level 4 has Super Admin capabilities plus database maintenance; only a Level 4 administrator can assign or manage Level 4 accounts. Back up shared MySQL/MariaDB data and test migrations on a copy before deployment.
- Web menu policies persist minimum View/Edit levels. All menu cards remain visible, while the shared route guard and API dependencies enforce access; only God User (Level 4) can change policies. Admin defaults to Super Admin (Level 3), and Level 2 is labeled Special User. Existing sensitive-operation role checks remain in force.
- The God User-only **Set Auth Menu** dialog is rendered at the Admin page level, independently of the Database Management dialog.
- The backend catalog is an allowlist: replace `fetch_pbnopen` or `fetch_pbnopen_q2_2026`; sync `dt_employee` only from `fetch_pbnopen` or `dt_employee_q2_2026` only from `fetch_pbnopen_q2_2026`; update the five shared `ref_*` tables by primary ID. The browser never supplies raw schema/table names.
- CSV previews validate the complete column set and report row counts before apply. Source replacement and reference updates are transactional. Reference IDs remain stable, and removing an ID still used by either employee table is rejected. Employee sync maps source labels through the shared references, including the verified expanded Kanwil label alias to its existing abbreviated reference value; it preserves `employee_id` for matching NIPs, inserts new NIPs, and removes obsolete employees. An empty source is rejected to avoid accidental table clearing.
- Focused checks: from `backend/`, run `python -m unittest discover -s tests -p 'test_pbnopen_import.py'`, `python -m unittest discover -s tests -p 'test_auth_service.py'`, and `python -m unittest discover -s tests -p 'test_auth_migration.py'`. The migration test covers SQLite; MySQL/MariaDB migration behavior still requires validation against a database copy.

**Auto-clean rules — how they work & how to add modes**
- Rule files live under `backend/Cleaning Logic/`. Each rule file is a small plain-text description (examples present in repo). Supported directives (parser understands these):
  - `Skiprows : N` — drop the first N rows before processing.
  - `Delete Column : 1,2,5-10` — columns to delete by 1-based position; ranges supported with `-` and commas.
  - `Rows to be Deletd  : if Null in Column X` — drop rows where column X is null.
  - `Col <N> -> New Name` — column rename hints if header parsing is broken.

- To add a new auto-clean mode (recommended: use programmatic cleaner):
  1. Create a new module in `backend/app/cleaners/mymode.py` (copy structure from `pbn.py`). Return a dict with keys: `skiprows`, `delete_positions`, `rename_columns`.
  2. Import and register it in `backend/app/cleaners/__init__.py` in the `CLEANER_MODULES` mapping.
  3. The mode automatically appears in backend routing via `dataset_service.py`.
  4. Add the mode name to the dropdown selector in `frontend/src/pages/AnalyticsPage.tsx` (search for `<select>` in "Auto Clean" section).
  5. Test by uploading a file and selecting your new mode from the dropdown.
  
  **Legacy text-file option:** If you prefer, add a rule file in `backend/Cleaning Logic/` and map it in `backend/app/services/dataset_service.py` via `_load_auto_clean_rules()`. Programmatic cleaners are preferred for clarity and performance.

- Sitasi Es.III applies `_to_proper_case` to `Keterangan` after removing the first six characters. Sitasi Es.IV applies the same helper to `Pertimbangan` after resolving/renaming the source column. The helper leaves non-string and missing values unchanged.

**Cleaning method recommendation**
- `GET /clean/recommend-method/{dataset_id}?sheet_name=...` compares a sheet to the available workbooks under `backend/templates/verification/`.
- PBN workbooks share the same headers, so the recommender also compares non-empty data patterns in the additional Homebase/Education columns. Sitasi templates are distinguished by the positions of their table headers.
- The recommender only returns a suggested method; it does not apply cleaning. PBN Open + Edu currently has no distinct verification workbook and is not automatically suggested.

**PowerPoint export templates**
- PPT generation is handled in `backend/app/services/powerpoint_service.py`.
- Template files live in `backend/templates/`:
  - `template.pptx` — Sitasi Es.III layout
  - `template_es4.pptx` — Sitasi Es.IV layout
- The service chooses the template from the selected `mode` and reconstructs rows based on the table structure in the template.
- For Es.IV, the template is intentionally laid out for 6 data rows per slide plus one header row; using the previous Es.III structure will produce a misfit export.
- If a template is changed, ensure the number of columns and the row formula in the exporter still match the design.

**Es.IV export mapping**
- `No` -> `index`
- `Nama/NIP` -> `Nama/NIP`
- `Usia` -> `Usia`
- `Gol` -> `Pangkat/Gol/TMT`
- `Jabatan Saat Ini` -> `Jabatan Lama`
- `TMT (Lama Jab)` -> `TMT Jabatan Lama`
- `Usul Jabatan Baru` -> `Jabatan Baru`
- `Homebase, Tour of Area` -> `Tour of Area`
- The slide table expects 8 columns and 7 rows total (header + 6 profiles).

**Parser behavior & extension points**
- The parser implemented in `dataset_service.py` returns a dict with keys: `skiprows`, `delete_positions` (list of ints), `delete_rows_null_columns` (list), and `rename_columns` (pos -> name). The service then:
  - Applies `skiprows` by slicing the DataFrame.
  - Drops rows with nulls for specified columns.
  - Renames columns by position.
  - Drops columns by position.
- If you need more directives (e.g., trim whitespace, type coercion), extend `_load_auto_clean_rules` to parse the new directive, and update `apply_auto_clean` to apply it.

**Cleaning history database**
- Every cleaning action is logged to MySQL from `backend/app/api/cleaning.py`.
- Stored metadata includes dataset id, action, status, row/column counts before and after, and request details.
- History endpoint: `GET /clean/history/{dataset_id}?limit=100`.
- Configure MySQL via `backend/.env` (template: `backend/.env.example`).

**PBN Open + Edu + HB dashboard**
- In PBN Analytics, apply the `PBN Open + Edu + HB` cleaning mode, then use **Open Dashboard**. The link passes the active dataset ID and selected sheet to `/insights`.
- `POST /insights/pbn/dashboard/{dataset_id}?sheet_name=...` accepts optional `age_min`, `age_max`, `tenure_min`, `tenure_max`, `eselon`, `education`, `region`, `unit`, and `rumpun` filters. Empty categorical lists mean “all”.
- `POST /insights/pbn/dashboard/{dataset_id}/people?sheet_name=...` applies the same filters and returns only the matched people for the dashboard's **View table** popup.
- The dashboard service aggregates the full in-memory DataFrame (not the 500-row preview) after every filter change. Empty Eselon or education lists mean “all”.
- Required output columns are `Sex`, `Usia (th.)`, `TMT Jabatan`, `Eselon`, `Pendidikan Terakhir (Short)`, `Rumpun Pdd Terakhir`, `Region Homebase`, `Unit Eselon II`, and `Agama`. Header matching ignores case and punctuation.
- PBN Open + Edu + HB cleaning removes apostrophe and backtick characters from string cell values, then converts the eight TMT fields (`TMT JF Keterampilan`, `TMT JF Keahlian`, `TMT JF Ahli Muda`, `TMT JF Ahli Madya`, `TMT Es4`, `TMT Es3`, `TMT Es2`, and `TMT Jabatan`) to datetime values. Unparseable non-empty date values are preserved and reported in the cleaning response/UI. The dashboard calculates tenure from `TMT Jabatan`; rows with missing age/TMT are retained for the full-range view and excluded if that range is narrowed.
- The popup displays `index`, `Nama`, `Eselon`, `Jabatan`, `Pendidikan Terakhir (Th.)`, `Jurusan`, and `Universitas/Sekolah Tinggi`; `Pendidikan Terakhir (Short)` is used if the requested education label is not present.
- Database reads are isolated in `app/repositories/pbn_dashboard_repository.py`; keep SQL/source access there and dashboard filtering/aggregation in `pbn_dashboard_service.py`. Insight Hub and Insight Hub Beta share the service behavior.

## Analisis Kinerja DJPb

- Each performance record stores `NKP Perhitungan` (70% NKP Awal + 30% NKO when NKP Awal >= NKO; otherwise 90% + 10%) and `Status NKP Perhitungan`, classified using the existing five score bands (>=115, >=110, >=100, >=90, and below 90) after rounding the score to its displayed two decimal places. Full uploads calculate these fields, startup migrations backfill scores and refresh persisted statuses, and both fields appear in Daftar Pegawai Lite View and exports. Missing inputs produce a null score and `Tidak tersedia` status.
- The top-level period selector is separate from the three analysis tabs (Overview, Unit Eselon II, and Daftar Pegawai). The latest available quarter is selected by default; dashboard, records, filters, and exports follow the selected quarter.
- Each period is stored as a separate dataset. Uploading an already-present quarter replaces only that quarter; other periods remain available. Record identity is `(dataset_id, nip)`, and each period is unique in `performance_kinerja_datasets`.
- Super Admins can delete a period from the period selector after confirmation. Deletion atomically removes the dataset, its employee rows, and its correction-edit logs; the selected period falls back to the latest remaining dataset. Period changes, workbook exports, and manual correction saves show a spinner while requests are in progress.
- The Unit Eselon II comparison uses only the immediately preceding calendar quarter (including Q4-to-Q1 year rollover). If that exact quarter is absent, no comparison is shown. Comparison details are opened from the unit row or the whole-dataset comparison button and include current/prior values, deltas, percentage changes where meaningful, and status distributions for NKP Perhitungan and NKP Akhir. Percentage changes are bold, red for negative values, and green for positive values. The dialog's print button opens the browser print flow and print styles isolate the report for saving as PDF.
- Unit rows default to ascending `unit_kerja_id` order, with missing IDs last. Numeric column headers toggle ascending/descending order, applied independently at Eselon II, III, and IV; null numeric values remain last.
- The unit table expands from Unit Eselon II to III and IV; comparisons are available at each level. Search matches names at all three hierarchy levels, keeps the matching path visible, and automatically opens ancestor rows. Lite View includes Unit, Pegawai, Rata-rata NPK, Koreksi (+/−), Pemberian Koreksi (%), Rata-rata NKP Akhir, NKP Akhir Sangat Istimewa, Gap Status, and Bandingkan. Pemberian Koreksi (%) is the number of employees with a nonzero correction divided by unit employee count. Numeric columns can be sorted, and widths expand to use available space and can be resized with pointer or keyboard controls; widths are saved in browser local storage. Unit and employee actions use compact icon toolbars with tooltips.
- Full performance uploads snapshot the matched employee name, Eselon, units, and `unit_kerja_id` from the selected reference (`fetch_pbnopen` by default, or `dt_employee_q2_2026` for Q2-2026). For `fetch_pbnopen`, the Unit Kerja label is resolved through `ref_unit_kerja`; the historical table stores the ID directly. The historical table's Eselon ID is resolved through `ref_eselon`. Unit Eselon II and Daftar Pegawai use stored snapshots rather than looking up the current employee table, so each period keeps the reference used when it was uploaded. Changing the source invalidates the current validation; uploads do not modify employee/reference tables. `Unit Eselon IV` is exposed as a dropdown filter in Daftar Pegawai and included in its export. Startup migrations add missing snapshot fields to existing records; legacy rows without a source unit ID remain at the bottom of the default unit ordering.
- CSV values remain authoritative unless a Super Admin explicitly syncs corrections. The admin selects the target dataset and EPRIDE source year/TW independently; available source periods include submitted forms (`status='kirim'`) with at least one exactly 13-digit `idUnit`. Correction values come from `dt_nkp_detil.nip`/`nilai_koreksi`, joined to `dt_nkp_form` through `nkp_form_id = id`. NULL corrections become zero; values outside -20 to 20 block the entire sync. Duplicate NIPs with one distinct nonzero value use that value (including a zero/nonzero pair). Different nonzero values are shown with form metadata and require one per-NIP choice for that sync; sync re-fetches the source and rejects choices that no longer match. Dataset NIPs not found in the eligible source are set to zero, while a source with no eligible rows is rejected without changing the dataset. Successful syncs recalculate NKP Akhir from `adjusted base = NKP Awal - abs(Nilai Hukuman Disiplin) - abs(Nilai Dampak Pelanggaran Disiplin) + Nilai Koreksi`. When adjusted base is greater than NKO, NKP Akhir is `70% × adjusted base + 30% × NKO`; otherwise it is `90% × adjusted base + 10% × NKO`. Nilai Dampak Perilaku is not included, and imported NKP Awal remains unchanged.
- Admins and Super Admins can edit `Nilai Koreksi` from a Daftar Pegawai cell; manual values must be between -5 and 5 inclusive, and each change records the old/new value, period, NIP, editor, and timestamp while recalculating NKP Akhir with the existing formula. **Koreksi Edit Log** supports undoing a selected edit: it restores that edit's previous value and deletes it plus later edits for the same NIP and period. A successful full upload or EPRIDE sync clears all correction-edit logs across periods in the same transaction; failed operations preserve them.
- Admins and Super Admins can batch-edit corrections from an `.xlsx` template with exactly `nip` and `nilai_koreksi` columns. NIPs must be text (leading apostrophe/backtick markers are normalized); corrections use the same inclusive -5..5 range. The server validates the complete file, rejects duplicates, unknown NIPs, malformed values, and files over 5,000 rows/5 MB, then updates records and per-employee edit logs atomically. This is a synchronous request rather than a background job; a few hundred rows are processed in one short database transaction.
- Employee query results are cached in per-user IndexedDB and restored immediately on reload while the server is rechecked. The selected tab, period, filters, search, sort, page, and Lite View are persisted in browser local storage. Cached correction logs are revalidated with the server before undo is enabled.
- Daftar Pegawai columns can be resized by dragging their header edges or focusing an edge and using the left/right arrow keys. Widths are stored per user in browser local storage, can be reset to defaults, and are auto-fitted to the table container when Lite View is activated.
- Daftar Pegawai Lite View shows only Nama, Unit Eselon II, Eselon, NKP Awal, Nilai Koreksi, NKO, Nilai Perhitungan, Status NKP perhitungan, NKP Akhir, and Status; exports remain complete.
- Overview status charts show counts and percentages for both quarters; status comparisons use percentage-point changes in each status share rather than raw-count deltas. Employee filters use values available in the selected dataset, with numeric range filters for applicable metrics. The Super Admin upload and EPRIDE sync controls are behind a compact data-management button/dialog. Configure `EPRIDE_DB_HOST`, `EPRIDE_DB_PORT`, `EPRIDE_DB_USER`, `EPRIDE_DB_PASSWORD`, and `EPRIDE_DB_NAME` in the backend environment; do not put credentials in source files.
- Overview dropdown choices update from records matching the other active unit/Eselon filters. The `Compare` toggle keeps values in the existing cards and charts, showing the immediately preceding calendar quarter, deltas, and percentage changes. Unit Eselon II, III, IV, and Eselon filters apply to both quarters; if the prior quarter is unavailable, the current-period view remains and an explanatory notice is shown.
- Daftar Pegawai dropdown choices update from records matching the other active column filters, numeric ranges, and the name/NIP search; each dropdown's own selection is excluded when calculating its alternatives.
- Dashboard calculations and filter metadata are cached per selected dataset for up to five minutes. Successful imports and EPRIDE syncs invalidate cached data so subsequent requests use the updated quarter.
- `init_history_db()` upgrades the former single-active-dataset schema while preserving its existing data in its recorded period and creates the correction-edit log table on startup. Back up the shared MySQL/MariaDB database before first startup after deploying schema changes. The development launcher uses the configured database too, so uploads and startup migrations are not isolated from the LAN app.
- The legacy-schema migration test uses SQLite; it has not been run against the live MySQL/MariaDB database. Test on a database copy and keep a backup before applying it to a shared installation.
- `backend/sql/006_create_performance_kinerja.sql` describes the fresh-install schema. Existing installations are upgraded by startup migrations; do not rely on `CREATE TABLE IF NOT EXISTS` alone to migrate existing tables.
- Focused backend test: from `backend/`, run `python -m unittest discover -s tests -p 'test_performance_kinerja.py'`. Frontend checks: from `frontend/`, run `npm run build` and `npm run lint`.

## Plt./Plh. employee lookup

- Monitoring records live in `plt_plh_monitoring_records`; `backend/sql/002_create_plt_plh_monitoring.sql` is the fresh-install schema.
- `GET /plt-plh/employees?q=...` is Admin/Super Admin-only and searches the existing `pbncleaner.fetch_pbnopen` table by employee name or NIP. The query requires at least two characters and returns at most 20 options.
- Selecting an employee fills the replacement name and formatted definitive job title and stores the employee's NIP as a snapshot on the monitoring record. Other monitoring fields remain manually entered.
- `format_job_with_unit` in `app/utils/employee_formatting.py` is shared with Pelantikan generation. It appends the expanded Unit Eselon II only when the employee's Eselon is known and not II.
- `init_history_db()` adds the nullable `pejabat_pengganti_nip` column to older monitoring tables. Do not create a second employee table or require a separate lookup-schema migration.

## Pelantikan agenda workflow

- `/undangan-pelantikan` is the primary all-sheets workflow; `/undangan-pelantikan/:agendaId` resumes an existing agenda, including legacy single-sheet agendas. Old `/undangan-pelantikan-experimental` URLs redirect to the primary route. Import can combine all sheets, combine selected sheets, isolate sheets, or use one sheet. Every agenda API call requires a signed-in user and checks ownership.
- Agenda records and participant snapshots are persisted in `pelantikan_agendas` and `pelantikan_agenda_people`. Use `backend/sql/005_create_pelantikan_agendas.sql` for fresh installations; startup adds missing workflow, import-strategy, and provenance columns on existing installations.
- The form's level choices are Administrator and Tinggi Pratama. Dress code choices are Wastra Nusantara, PSL Lengkap, or a user-entered value. The card countdown uses the Jakarta date and shows Berakhir for past dates.
- Roster upload accepts `.xlsx` and `.xls` up to 50 MB. Import skips empty/non-roster sheets with a notice, persists each source sheet/row, and resolves NIP duplicates by workbook-tab/row order; the first occurrence is selectable.
- Combined imports group matching Unit Eselon II values across sheets while keeping Daring and Luring separate; a one-click modality toggle speeds up switching. Employees mapped through `ref_unit_kerja.prov` to DKI Jakarta default to Luring; others default to Daring. Isolated imports also keep source sheets in separate preview/document groups. The generated roster uses the employee database's current `Jabatan`; the workbook's proposed new title is only a preview reference and is not copied into the document.
- Duplicate NIP occurrences remain visible and individually selectable, but a second occurrence cannot be saved/generated; Select All selects at most one row per NIP. The backend enforces the same uniqueness rule.
- The roster supports a compact Lite View with Pilih, No, Nama/NIP, Jabatan Saat ini/Grade, Usul Jabatan Baru/Grade, Kota, Pencocokan, and Pelantikan, plus adjustable column widths saved in browser-local preferences. Preview cards show the matched city and can be filtered by match status or modality. Documents can be selected by unit and modality (and source sheet for isolated imports). One selected document downloads as DOCX; multiple selected documents download together as ZIP. The backend validates that each requested document group is complete.
- The preview can also generate one ND Pengantar appendix DOCX from selected participants. Its rows are ordered Luring before Daring and then by unit ID; the template is `backend/templates/undangan_pelantikan/template_lampiran_pengantar.docx`.
- Pelantikan monitoring has an Excel export with four columns and counts by unit.
- The source workbook and generated documents are not retained on the server. The agenda and participant snapshot remain so the owner can resume the workflow; re-uploading a workbook or switching sheets replaces that agenda's participant snapshot. The frontend keeps the current workbook and sheet selected after upload so the owner can replace the roster without creating another agenda.
- Keep recipient wording and the shared job-title formatting rules in `pelantikan_agenda/common.py` and `employee_formatting.py` aligned.

**Frontend architecture for junior devs**
- The app uses **React Router v7** with pages as separate route components in `src/pages/`.
- The table preview in `AnalyticsPage` uses `@tanstack/react-table`. Important details:
  - `pageIndex` and `pageSize` must be tracked in component state and synced with the table via `onPaginationChange` to avoid resets.
  - The table previews only the first N rows (server-side `PREVIEW_LIMIT` = 500) to keep the UI snappy.
- **Navigation:** Use `useNavigate()` hook from React Router to jump between routes. Example:
  ```tsx
  const navigate = useNavigate();
  navigate('/pbn-analytics');
  ```
- **State & API:** `useDataset.ts` hook manages all dataset state and orchestrates API calls. To add a new feature page:
  1. Create a new page component in `src/pages/MyFeaturePage.tsx`.
  2. Import `useDataset` hook to access dataset state/actions.
  3. Add route in `src/App.tsx`.
  4. If you need new API endpoints, add them to `src/services/api.ts` and wire them into `useDataset.ts`.

**Testing & debugging tips**
- Reproduce the API locally using curl/Postman or the UI. Key endpoints:
  - `POST /upload` — upload file (multipart form `file`).
  - `POST /clean/apply-auto-clean` — body: `{"dataset_id": "...", "mode": "Sitasi Es.IV", "sheet_name": "Sheet1"}`.
  - `GET /dataset/{dataset_id}` — get preview.
  - `GET /health` — health.
- If a change in backend service causes an error, FastAPI will return a 422/500 with a `detail` message. Frontend surfaces this as an error banner.

**Persistence and production notes**
- Currently, `DatasetStore` is in-memory; a server restart clears data. For production, replace `DatasetStore` with a persistent store (S3, database, or on-disk storage).

**Where to edit for common tasks**
- **Add a new module/feature:**
  1. Create a new page component in `frontend/src/pages/YourFeaturePage.tsx`.
  2. Add a new route in `frontend/src/App.tsx` under `<Routes>`.
  3. Link to it from `frontend/src/pages/LandingPage.tsx` using `useNavigate()`.
  4. Implement backend endpoints in `backend/app/api/` as needed.
  5. Add API functions in `frontend/src/services/api.ts`.
  6. Wire the UI to use those APIs via `frontend/src/hooks/useDataset.ts` (or create a new hook for your feature).

- **Add/modify auto-clean rules:** 
  - For quick rules: add a text file in `backend/Cleaning Logic/` and map it in `backend/app/services/dataset_service.py`.
  - For complex logic: create a new module in `backend/app/cleaners/` (follow the pattern of `pbn.py`), register it in `backend/app/cleaners/__init__.py`, then map it in `backend/app/services/dataset_service.py`.

- **Change API behavior:** 
  - Handlers: `backend/app/api/cleaning.py` (endpoint logic).
  - Business logic: `backend/app/services/dataset_service.py` (DataFrame operations and mode routing).

- **Change routing or navigation:** 
  - Routes: `frontend/src/App.tsx`.
  - Landing/home: `frontend/src/pages/LandingPage.tsx` (edit feature cards or add new links).
  - Navigation within pages: use `useNavigate()` hook from React Router.

- **Change table rendering/pagination:** 
  - `frontend/src/features/cleaning/DataTable.tsx` (handles TanStack Table setup, paging, filtering).

**Quick commands**
- Backend dev server (with port auto-detection):
```
cd backend
python -m venv .venv
\.venv\Scripts\activate    # Windows
pip install -r requirements.txt
python run_server.py       # Auto-finds free port starting from 8000
```
- Frontend dev server (with HMR and auto-reload):
```
cd frontend
npm install
npm run dev                # Opens at http://localhost:5173
```
- Network deployment (resolves the active LAN host and reads ports from config.json):
```
run-app-testing.bat        # Local dev (backend with --reload)
run-app.bat                # Network deployment (auto-detects host; optional config.json override)
```
- Build check:
```
cd frontend
npm run build              # TypeScript check + Vite build to dist/
```

**If you get stuck**
- Check `backend` logs for the FastAPI stacktrace (errors appear in terminal where `python run_server.py` runs).
- Use the frontend network devtools to see the exact request/response payloads (DevTools > Network tab).
- Check React DevTools to inspect component state and props (install React DevTools extension).
- Ask about:
  - Which routes are active (see `frontend/src/App.tsx` for all routes).
  - Which auto-clean modes are enabled in the dropdown (see `frontend/src/pages/AnalyticsPage.tsx`).
  - API endpoint details (see `backend/app/api/` for handlers, `frontend/src/services/api.ts` for wrapper functions).

---

## Current Product Scope and Next Milestone

- **Web 1.4.1:** Adds configurable per-menu View/Edit access, route/API enforcement, and the God User-only policy editor; see the [1.4.1 update notes](./Update%20Notes/Update%20Notes%201.4.1%20Web.md) for all changes.
- **Web 1.4.2 (planned):** Focuses on refactoring and measured performance improvements. The Kinerja service is being modularized first; runtime gains will be claimed only after profiling and comparison against a baseline. See the [planned 1.4.2 notes](./Update%20Notes/Update%20Notes%201.4.2%20Web.md).
- **Web 1.4.0:** Includes all 1.3.0 web features plus the current Generate ND workflow and improvements, multi-quarter Analisis Kinerja history/comparisons/cache, and the related dashboard controls documented above.
- **Data boundaries:** uploaded cleaning datasets remain in-memory and are cleared on backend restart; performance periods, agendas, monitoring records, accounts, and feedback use the configured MySQL/MariaDB database.
- **Web-only placeholders:** Bahan Pendukung MPK and Simulasi Mutasi do not yet implement their named workflows.
- **Version 2.0 milestone:** Make the remaining placeholder workflows functional after requirements are defined. Do not treat 2.0 as already implemented.
- **Desktop:** Only PBN Analytics and Insight Hub are main navigation menus; there is no desktop login, Admin workflow, or web-only placeholder menu.
