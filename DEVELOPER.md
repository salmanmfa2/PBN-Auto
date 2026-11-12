Developer Guide

This file helps new contributors (especially juniors) understand where to make changes, how the project is organized, and common development tasks.

**Release scope**
- The current web release is **1.2.1**. See [web update notes](./Update%20Notes/Update%20Notes%201.2.1%20Web.md), [web update 1.2](./Update%20Notes/Update%20Notes%201.2%20Web.md), and [desktop update notes](./Update%20Notes/Update%20Notes%201.2%20Desktop.md).
- Desktop main navigation is limited to PBN Analytics and Insight Hub and has no login system. The additional web menus and account workflow are web-only.
- Generate ND Undangan Pelantikan is implemented for signed-in web users. Analisis Kinerja DJPb is publicly readable, including Guest mode; only Super Admins can upload or adjust its active quarterly dataset. Bahan Pendukung MPK and Simulasi Mutasi remain web placeholders; version **2.0** is the planned milestone for those workflows.

**Overview**
- **Purpose**: A data management platform for PBN dataset cleaning and analytics. Backend is FastAPI (Python), frontend is React 19 + Vite with React Router (TypeScript).
- **Architecture**: Modular page-based routing using React Router v7. Each major feature lives in its own route under `frontend/src/pages/` with shared hooks and services.

**Quick start (local)**
- Backend:
  - Create and activate a Python virtualenv in `backend/`.
  - Install dependencies: `pip install -r requirements.txt`.
  - Run the dev server: `python run_server.py` (auto-detects free port).
  - Health: `GET http://localhost:8000/health`.
- Frontend:
  - From `frontend/`: `npm install` then `npm run dev` for development or `npm run build` for production build.
  - Routes include `http://localhost:5173/`, `/pbn-analytics`, `/insights`, `/insights-beta`, `/manajemen-plt-plh`, `/undangan-pelantikan`, and `/undangan-pelantikan-experimental`.
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
  - `app/api/auth.py` — login, public registration, session, user-preference, and admin-account endpoints.
  - `app/api/feedback.py` — authenticated feedback submission and Admin-only feedback management.
  - The `auth.py` Admin router exposes Super Admin-only CSV validation and replacement endpoints for `pbncleaner.fetch_pbnopen`.
  - `app/api/chat.py` — authenticated chat endpoint; provider credentials remain backend-only.
  - `app/services/chat_service.py` — sends a concise, code-maintained capability summary to Groq on each request; it does not reread README or developer documentation at runtime. Keep that summary aligned with verified app behavior when features change.
  - `app/services/dataset_service.py` — core DataFrame logic. Routes to programmatic cleaners or parses legacy text rule files.
  - `app/services/pbn_dashboard_service.py` — validates cleaned dashboard columns, applies filters, calculates employee totals and chart distributions.
  - Insight Hub Beta reuses the same dashboard service calculations and response schemas; it reads `pbncleaner.fetch_pbnopen` from the configured SQLAlchemy engine.
  - `app/services/pbnopen_import_service.py` validates exact CSV column names and replaces table rows in a database transaction.
  - `app/services/auth_service.py` — account/session lifecycle, role invariants, and persisted appearance preferences.
  - `app/cleaners/` — programmatic cleaner modules:
    - `pbn.py`, `pbn_edu.py`, `pbn_edu_hb.py`, `sitasi_esiii.py`, `sitasi_esiv.py` — each returns a cleaning config dict.
  - `app/storage/dataset_store.py` — in-memory dataset store (UUID -> sheets). Note: data is ephemeral (restarts clear data).
  - `app/history_db.py` — SQLAlchemy MySQL connection/session for cleaning history.
  - `app/models/auth.py` — account, session, and per-user preference models.
  - `app/models/cleaning_history.py` — SQLAlchemy model for cleaning history table.
  - `app/models/plt_plh.py` and `app/services/plt_plh_service.py` — monitoring records, derived tenure/status, Excel export, and replacement-employee lookup.
  - `app/models/pelantikan_agenda.py` and `app/services/pelantikan_agenda_service.py` — persistent agenda/participant snapshots and DOCX/ZIP generation.
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
    - `LoginPage.tsx` / `AdminPage.tsx` — web authentication entry, feedback inbox, and Super Admin account workspace.
    - `PltPlhManagementPage.tsx` — web-only monitoring UI.
    - `PelantikanAgendaPage.tsx` — web-only agenda, participant preview, and document-generation UI.
  - `src/App.tsx` — React Router routes, session gate, role gate, and shared toolbar/chat/feedback widget mounting.
  - `frontend/index.html` — browser document title (`MPK Workspace`).
  - `src/contexts/AuthContext.tsx` — authentication, Guest mode, and session state.
  - `src/components/AppToolbar.tsx` — draggable clock that snaps to the nearest screen edge on release/resize, collapsible tools, theme menu, and toolbar dialogs.
  - `src/components/ChatWidget.tsx` — authenticated Groq chat UI and Markdown rendering.
  - `src/components/FeedbackWidget.tsx` — compact menu-tagged feedback form beside Groq chat.
  - `src/main.tsx` — app entry point wrapping App with `<BrowserRouter>`.
  - `src/hooks/useDataset.ts` — high-level dataset actions and API calls used across UI.
  - `src/services/api.ts` — HTTP wrapper functions to backend endpoints.
  - `src/features/cleaning/DataTable.tsx` — table viewer; handles paging, filtering, sorting.
  - `src/pages/InsightHubPage.tsx` — dashboard controls and distribution charts; receives the current dataset ID and sheet name in the URL.

- `config.json` — centralized deployment config; `host: "auto"` enables dynamic LAN address discovery, while ports and loopback CORS origins remain configurable.
- `resolve-network-config.ps1` — shared host resolver used by network launch/deployment scripts; it prefers active Wi-Fi and computes the corresponding frontend CORS origin.

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

## Plt./Plh. employee lookup

- Monitoring records live in `plt_plh_monitoring_records`; `backend/sql/002_create_plt_plh_monitoring.sql` is the fresh-install schema.
- `GET /plt-plh/employees?q=...` is Admin/Super Admin-only and searches the existing `pbncleaner.fetch_pbnopen` table by employee name or NIP. The query requires at least two characters and returns at most 20 options.
- Selecting an employee fills the replacement name and formatted definitive job title and stores the employee's NIP as a snapshot on the monitoring record. Other monitoring fields remain manually entered.
- `format_job_with_unit` in `app/utils/employee_formatting.py` is shared with Pelantikan generation. It appends the expanded Unit Eselon II only when the employee's Eselon is known and not II.
- `init_history_db()` adds the nullable `pejabat_pengganti_nip` column to older monitoring tables. Do not create a second employee table or require a separate lookup-schema migration.

## Pelantikan agenda workflow

- The standard web route is `/undangan-pelantikan`; `/undangan-pelantikan/:agendaId` resumes a single-sheet agenda. `/undangan-pelantikan-experimental` and its `:agendaId` route provide configurable all, selected, isolated, or single-sheet import. Every agenda API call requires a signed-in user and checks ownership.
- Agenda records and participant snapshots are persisted in `pelantikan_agendas` and `pelantikan_agenda_people`. Use `backend/sql/005_create_pelantikan_agendas.sql` for fresh installations; startup adds missing workflow, import-strategy, and provenance columns on existing installations.
- The form's level choices are Administrator and Tinggi Pratama. Dress code choices are Wastra Nusantara, PSL Lengkap, or a user-entered value. The card countdown uses the Jakarta date and shows Berakhir for past dates.
- Roster upload accepts `.xlsx` and `.xls` up to 50 MB. The standard workflow processes one selected sheet. Experimental import offers combine all sheets, combine chosen sheets, isolate each sheet, or process one sheet. It skips empty/non-roster sheets with a notice, persists each source sheet/row, and resolves NIP duplicates by workbook-tab/row order; the first occurrence is selectable.
- Both workflows share participant selection, including Select All and Deselect All. Combined imports group matching Unit Eselon II values across sheets while keeping Daring and Luring separate. Isolated imports also keep source sheets in separate preview/document groups. The generated roster uses the employee database's current `Jabatan`; the workbook's proposed new title is only a preview reference and is not copied into the document.
- The source workbook and generated documents are not retained on the server. The agenda and participant snapshot remain so the owner can resume the workflow; re-uploading a workbook or switching sheets replaces that agenda's participant snapshot. The frontend keeps the current workbook and sheet selected after upload so the owner can replace the roster without creating another agenda.
- Generated DOCX files are grouped by Unit Eselon II and modality, then downloaded together as a ZIP. Keep recipient wording and the shared job-title formatting rules in `pelantikan_agenda_service.py` and `employee_formatting.py` aligned.

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

- **Web 1.2.1:** PBN Analytics, Insight Hub, web accounts and role-based access, the Admin workspace, Plt./Plh. monitoring with PBN Open employee lookup, Pelantikan agenda and invitation generation, user-persisted appearance preferences, magnetic toolbar snapping, and the authenticated Groq assistant.
- **Web 1.2.1 working-tree addition:** Analisis Kinerja DJPb stores one active quarter, matches NIP against the current employee source, and supports Super Admin full-data/adjustment uploads. Its tables are registered in `backend/app/history_db.py`; `backend/sql/006_create_performance_kinerja.sql` is the manual MySQL DDL.
- **Web-only placeholders:** Bahan Pendukung MPK and Simulasi Mutasi do not yet implement their named workflows.
- **Version 2.0 milestone:** Make the remaining placeholder workflows functional after requirements are defined. Do not treat 2.0 as already implemented.
- **Desktop:** Only PBN Analytics and Insight Hub are main navigation menus; there is no desktop login, Admin workflow, or web-only placeholder menu.
- DatasetStore remains in-memory and is cleared by a backend restart. Database persistence for datasets should be designed separately if/when requested.
