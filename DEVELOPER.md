Developer Guide

This file helps new contributors (especially juniors) understand where to make changes, how the project is organized, and common development tasks.

**Overview**
- **Purpose**: A modular data management platform. Phase 1 focuses on PBN dataset cleaning. Future phases will add link building and analytics modules. Backend is FastAPI (Python), frontend is React 19 + Vite with React Router (TypeScript).
- **Architecture**: Modular page-based routing using React Router v7. Each major feature lives in its own route under `frontend/src/pages/` with shared hooks and services.

**Quick start (local)**
- Backend:
  - Create and activate a Python virtualenv in `backend/`.
  - Install dependencies: `pip install -r requirements.txt`.
  - Run the dev server: `python run_server.py` (auto-detects free port).
  - Health: `GET http://localhost:8000/health`.
- Frontend:
  - From `frontend/`: `npm install` then `npm run dev` for development or `npm run build` for production build.
  - Routes are available at `http://localhost:5173/`, `/pbn-analytics`, `/menu-builder`, `/insights`.
- One-click local launch:
  - Double-click `run-app-testing.bat` from the repo root (starts both backend & frontend with auto-reload).
- One-click network launch:
  - Double-click `run-app.bat` from the repo root (uses the host and ports in `config.json`).
  - Serve the built frontend with `serve-frontend.ps1` if needed.

**Repository layout (important files)**
- `backend/` — FastAPI app
  - `main.py` — app entrypoint and router registration.
  - `run_server.py` — Uvicorn launcher with dynamic port detection (finds free port starting from 8000).
  - `app/api/cleaning.py` — cleaning endpoints (apply auto-clean, remove columns, rename, remove duplicates, delete rows, header actions).
  - `app/services/cleaning_recommendation_service.py` — compares an uploaded sheet with the verification workbooks and returns a recommendation without modifying the dataset.
  - `templates/verification/` — source-format workbooks used by cleaning-method recommendation.
  - `app/api/insights.py` — PBN dashboard endpoint; filter requests return recalculated full-dataset aggregates.
  - `app/services/dataset_service.py` — core DataFrame logic. Routes to programmatic cleaners or parses legacy text rule files.
  - `app/services/pbn_dashboard_service.py` — validates cleaned dashboard columns, applies filters, calculates employee totals and chart distributions.
  - `app/cleaners/` — programmatic cleaner modules:
    - `pbn.py`, `pbn_edu.py`, `pbn_edu_hb.py`, `sitasi_esiii.py`, `sitasi_esiv.py` — each returns a cleaning config dict.
  - `app/storage/dataset_store.py` — in-memory dataset store (UUID -> sheets). Note: data is ephemeral (restarts clear data).
  - `app/history_db.py` — SQLAlchemy MySQL connection/session for cleaning history.
  - `app/models/cleaning_history.py` — SQLAlchemy model for cleaning history table.
  - `app/schemas/pbn_dashboard.py` — dashboard filter request schema.
  - `app/services/history_service.py` — logging and retrieval helpers for cleaning history.
  - `Cleaning Logic/` — directory containing text rule files (legacy fallback; prefer programmatic cleaners).
  - `sql/001_create_cleaning_history.sql` — MySQL bootstrap script for database and table.

- `frontend/` — React + Vite app with React Router
  - `src/pages/` — page components for each route:
    - `LandingPage.tsx` — landing page with feature selector cards (`/` route).
    - `AnalyticsPage.tsx` — PBN dataset cleaning interface (`/pbn-analytics` route).
    - `MenuBuilderPage.tsx` — link builder placeholder (`/menu-builder` route).
    - `InsightHubPage.tsx` — PBN Open + Edu + HB interactive dashboard (`/insights` route).
  - `src/App.tsx` — React Router Routes definition (no UI in App itself; just routing).
  - `src/main.tsx` — app entry point wrapping App with `<BrowserRouter>`.
  - `src/hooks/useDataset.ts` — high-level dataset actions and API calls used across UI.
  - `src/services/api.ts` — HTTP wrapper functions to backend endpoints.
  - `src/features/cleaning/DataTable.tsx` — table viewer; handles paging, filtering, sorting.
  - `src/pages/InsightHubPage.tsx` — dashboard controls and distribution charts; receives the current dataset ID and sheet name in the URL.

- `config.json` — centralized deployment config (IP, ports, CORS origins). Read by both backend and PowerShell scripts.

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

- `Sitasi Es.III (Lite)` reuses the standard Es.III cleaning rules and PowerPoint template, but sets `delete_rows_null_columns` to an empty list so rows with a null value in column 2 are retained. Keep its category detection and six-character `Keterangan` prefix removal aligned with the standard mode.
- Excel export merges Lite rows where `No` contains a non-numeric section heading and every other value is blank. This is controlled by the `sitasi_esiii_lite` DataFrame attribute set during that mode's cleaning; CSV and in-app preview remain ordinary cell data, and standard Es.III exports are not merged.
- Sitasi Es.III and Lite apply `_to_proper_case` to `Keterangan` after removing the first six characters. Sitasi Es.IV applies the same helper to `Pertimbangan` after resolving/renaming the source column. The helper leaves non-string and missing values unchanged.

**Cleaning method recommendation**
- `GET /clean/recommend-method/{dataset_id}?sheet_name=...` compares a sheet to the available workbooks under `backend/templates/verification/`.
- PBN workbooks share the same headers, so the recommender also compares non-empty data patterns in the additional Homebase/Education columns. Sitasi templates are distinguished by the positions of their table headers.
- The recommender only returns a suggested method; it does not apply cleaning. PBN Open + Edu and Sitasi Es.III (Lite) currently have no distinct verification workbook and are not automatically suggested.

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
- The cleaner preserves `TMT Jabatan` as-is. The dashboard parses values (including date strings with a leading apostrophe) for tenure calculations without changing the cleaned data. Tenure is completed calendar years from that date to the current date. Rows with missing age/TMT are retained for the full-range view and excluded if that range is narrowed.
- The popup displays `index`, `Nama`, `Eselon`, `Jabatan`, `Pendidikan Terakhir (Th.)`, `Jurusan`, and `Universitas/Sekolah Tinggi`; `Pendidikan Terakhir (Short)` is used if the requested education label is not present.

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
- Network deployment (reads config.json for IP/port):
```
run-app-testing.bat        # Local dev (backend with --reload)
run-app.bat                # Network deployment (configure config.json first)
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

## Next Steps & Future Modules

**Current phase (1):** PBN Analytics ✅ Live

**Phase 2 (coming):** Secure Link Builder
- Route: `/menu-builder`
- Placeholder page created at `frontend/src/pages/MenuBuilderPage.tsx`
- Will need backend endpoints for link CRUD
- Need database integration (PostgreSQL)

**Phase 3:** Insights Hub
- Route: `/insights`
- Live PBN Open + Edu + HB dashboard with filtered employee totals and distributions.
- Future work can add additional analytics and visualization modules.

**Planned improvements:**
- Replace in-memory `DatasetStore` with PostgreSQL for persistence
- Add user authentication & authorization
- Role-based access control (RBAC) for modules
- Link sharing with password protection (for Link Builder)

If you'd like, I can also:
- Add unit tests around `dataset_service._load_auto_clean_rules` to lock parser behavior.
- Create a CONTRIBUTING guide with Git workflows for team members.
