# PBN Cleaner

A full-stack modular web application for PBN data cleaning and analytics. The web application is named MPK Workspace; PBN Cleaner remains the project and repository name.

Current web update: **1.4.1** — [Web update notes](./Update%20Notes/Update%20Notes%201.4.1%20Web.md). The planned **1.4.2** update focuses on refactoring and measured performance improvements; see the [planned Web 1.4.2 notes](./Update%20Notes/Update%20Notes%201.4.2%20Web.md). Work tracked for Web 1.5.0 is summarized in the [Web 1.5.0 notes](./Update%20Notes/Update%20Notes%201.5.0%20Web.md); the current application version label remains 1.4.1. Desktop requirements and release status are documented separately; this note does not claim a desktop build.

## Features

| Feature | Status | Description |
|---|---|---|
| **PBN Analytics** | ✅ Live | Upload, clean, and export PBN datasets with multiple cleaning modes |
| **Duplicate Removal** | ✅ Live | Select columns as unique key; deduplication with stats |
| **Column Management** | ✅ Live | Hide/remove columns; inline rename with preview table |
| **Export** | ✅ Live | Download as `.csv` or `.xlsx` |
| **Insight Hub** | ✅ Live | PBN Open + Edu + HB employee analytics and distributions |
| **Analisis Kinerja DJPb (web)** | ✅ Live | Quarter-specific performance dashboards, comparisons, records, and exports |
| **Generate ND Undangan Pelantikan (web)** | ✅ Live | Multi-sheet agenda workflow, employee matching, previews, selective document downloads, and appendix generation |
| **Analisis Mutasi/Promosi (Experimental)** | ✅ Live | Administrator and Pengawas workspaces, persisted dataset uploads, NIP lookup, category enrichment, and Talent Finder |
| **Fragment Petikan (Experimental)** | ✅ Live | Split large text-based PDFs into named page fragments and download them as a ZIP |

## Tech Stack

**Frontend:** React 19 · Vite · TypeScript · Tailwind CSS v3 · React Router v7 · TanStack Table · Axios

**Backend:** Python 3.11+ · FastAPI · Pandas · openpyxl · Uvicorn

**Deployment:** Windows batch scripts · PowerShell · Local or intranet hosting

## Project Structure

```
Project PBNCleaner/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── upload.py          # POST /upload
│   │   │   ├── cleaning.py        # POST /clean/*
│   │   │   └── dataset.py         # GET /dataset/:id, GET /export/*
│   │   ├── cleaners/
│   │   │   ├── pbn.py             # PBN Open mode
│   │   │   ├── pbn_edu.py         # PBN Open + Edu mode
│   │   │   ├── pbn_edu_hb.py      # PBN Open + Edu + HB mode
│   │   │   ├── sitasi_esiii.py    # Sitasi Es.III mode
│   │   │   └── sitasi_esiv.py     # Sitasi Es.IV mode
│   │   ├── services/
│   │   │   ├── auth_service.py              # Account, session, role, and password handling
│   │   │   ├── chat_service.py              # Groq chat assistant integration
│   │   │   ├── cleaning_recommendation_service.py # Suggests the appropriate cleaning mode
│   │   │   ├── dataset_service.py           # DataFrame parsing, cleaning, and export
│   │   │   ├── feedback_service.py          # User feedback and Admin inbox persistence
│   │   │   ├── history_service.py           # Cleaning history recording and retrieval
│   │   │   ├── kinerja/                     # Performance Kinerja workflows
│   │   │   │   ├── cache.py                 # Dashboard cache
│   │   │   │   ├── common.py                # Shared calculations and constants
│   │   │   │   ├── corrections.py           # Manual and E-PRIDE corrections
│   │   │   │   ├── dashboard.py             # Dashboard aggregation
│   │   │   │   ├── exports.py               # Workbook exports
│   │   │   │   ├── record_data.py           # Record-data ranges and filters
│   │   │   │   ├── records.py               # Record queries and insights
│   │   │   │   └── uploads.py               # Upload validation and replacement
│   │   │   ├── menu_access_service.py       # Menu-level role policies
│   │   │   ├── pbn_dashboard_service.py     # PBN dashboard analytics
│   │   │   ├── pbnopen_import_service.py    # PBN Open and employee-table maintenance
│   │   │   ├── pelantikan_agenda/           # Pelantikan agenda workflows
│   │   │   │   ├── agendas.py               # Agenda persistence and serialization
│   │   │   │   ├── common.py                # Shared lookup and formatting helpers
│   │   │   │   ├── documents.py             # DOCX template generation
│   │   │   │   ├── exports.py               # Workbook, DOCX, and ZIP exports
│   │   │   │   └── roster.py                # Roster import and employee matching
│   │   │   ├── plt_plh_service.py           # PLT/PLH monitoring and documents
│   │   │   ├── powerpoint_service.py        # Sitasi presentation generation
│   │   │   └── stored_dataset_service.py    # Persistent original and cleaned dataset files
│   │   ├── schemas/
│   │   │   └── dataset.py         # Pydantic models
│   │   └── storage/
│   │       └── dataset_store.py   # In-memory store
│   ├── main.py                    # FastAPI app entry
│   ├── run_server.py              # Uvicorn launcher with port detection
│   └── requirements.txt
│
├── frontend/
│   └── src/
│       ├── pages/                 # React Router pages
│       │   ├── LandingPage.tsx    # / route (feature selector)
│       │   ├── AnalyticsPage.tsx  # /pbn-analytics route
│       │   ├── MenuBuilderPage.tsx # /menu-builder route
│       │   └── InsightHubPage.tsx  # /insights route
│       ├── features/
│       │   ├── upload/
│       │   │   └── UploadZone.tsx
│       │   └── cleaning/
│       │       ├── DataTable.tsx
│       │       ├── ColumnManager.tsx
│       │       └── DuplicateRemover.tsx
│       ├── hooks/
│       │   └── useDataset.ts      # All app state & API calls
│       ├── services/
│       │   └── api.ts             # Axios API layer
│       ├── types/
│       │   └── index.ts           # TypeScript interfaces
│       ├── components/
│       │   ├── ErrorBanner.tsx
│       │   └── Spinner.tsx
│       ├── App.tsx                # React Router setup
│       └── main.tsx               # BrowserRouter wrapper
│
├── config.json                    # Centralized config (IP, ports, CORS)
├── run-app-testing.bat            # Local dev launcher
├── run-app.bat                    # Network deployment launcher
├── deploy-windows.ps1             # Environment setup
└── serve-frontend.ps1             # Frontend server for production
```

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
python run_server.py              # Finds free port starting from 8000
```

API docs available at: http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

App available at: http://localhost:5173 with live routing

### 3. Network Deployment

Edit `config.json` for network deployment. Set `host` to the server's address and add the matching frontend URL to `cors_origins`:

```json
{
  "host": "YOUR_SERVER_HOST_OR_IP",
  "backend_port": 8000,
  "frontend_port": 8081,
  "cors_origins": [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://YOUR_SERVER_HOST_OR_IP:8081",
    "http://YOUR_SERVER_HOST_OR_IP"
  ]
}
```

Then run from project root:

```bash
# One-click local dev
run-app-testing.bat

# One-click network deployment
run-app.bat
```

## Routing

The app uses **React Router v7** for URL-based navigation:

| Route | Component | Description |
|---|---|---|
| `/` | LandingPage | Feature selector with cards for each module |
| `/pbn-analytics` | AnalyticsPage | PBN dataset cleaning (active) |
| `/insights` | InsightHubPage | Employee analytics and distributions |
| `/insights-beta` | InsightHubBetaPage | Beta dashboard experience |
| `/analisis-kinerja` | PerformanceAnalysisPage | Kinerja DJPb analysis, records, dashboard, and corrections |
| `/undangan-pelantikan` | PelantikanAgendaPage | Pelantikan agenda and document generation |
| `/manajemen-plt-plh` | PltPlhManagementPage | Alternate-management monitoring and document workflows |
| `/analisis-mutasi` | MutationAnalysisPage | Experimental Administrator/Pengawas mutation analysis and Talent Finder |
| `/fragment-petikan` | FragmentPetikanPage | Experimental PDF splitting and ZIP download |

Users can bookmark routes or share URLs directly to jump into any feature.

The frontend reads `VITE_API_URL` (default: `http://localhost:8000`).

To override, edit `frontend/.env` or `frontend/.env.production`:

```env
VITE_API_URL=http://localhost:8000
```

## API Reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/upload` | Upload a CSV or Excel file |
| `POST` | `/clean/remove-columns` | Remove unwanted columns |
| `POST` | `/clean/rename-columns` | Rename columns |
| `POST` | `/clean/remove-duplicates` | Remove duplicate rows |
| `GET` | `/clean/history/{id}` | Fetch cleaning history entries for a dataset |
| `GET` | `/dataset/{id}` | Fetch current dataset preview |
| `GET` | `/export/csv/{id}` | Download as CSV |
| `GET` | `/export/excel/{id}` | Download as Excel |
| `POST` | `/mutation-analysis/lookup-nips` | Match employee NIPs with `dt_employee` |
| `POST` | `/mutation-analysis/workspaces/{id}/dataset/analyze` | Apply workspace-specific category and tenure enrichment |
| `PUT` | `/mutation-analysis/workspaces/{id}/categories` | Save manual Kategori selections |
| `GET` | `/mutation-analysis/talent-finder/filter-options` | Load Eselon and rumpun filter options |
| `POST` | `/mutation-analysis/talent-finder/count` | Count employees matching Talent Finder filters |
| `POST` | `/mutation-analysis/talent-finder/search` | Fetch paginated and sortable Talent Finder results |
| `POST` | `/fragment-petikan/split` | Split a PDF by page count, mine fragment names, and return a ZIP |

## Analisis Mutasi/Promosi

The Experimental Mutasi/Promosi module is available under `/analisis-mutasi`. It separates Administrator and Pengawas workspaces and keeps each workspace tied to its own uploaded dataset.

### Data Load

- Persistently uploads and restores CSV or Excel datasets.
- Cleans Administrator data with Sitasi Es.III logic and Pengawas data with Sitasi Es.IV logic.
- Looks up NIPs against `pbncleaner.dt_employee`.
- Enriches the `Kategori` column using workspace-specific Eselon rules.
- Allows manual dropdown correction of `Kategori` values for both workspace types.
- Replaces the old TMT position field with `Masa Jabatan` in `X Tahun Y Bulan` format.

Automatic Kategori mappings:

| Workspace | Eselon IDs | Category |
|---|---|---|
| Administrator | 11, 3 | Mutasi |
| Administrator | 4, 5, 6 | Promosi |
| Administrator | 2 | Demosi |
| Pengawas | 4 | Mutasi |
| Pengawas | 6 | Perpindahan dari Fungsional |
| Pengawas | 5, 7, 8, 9, 10 | Promosi |
| Pengawas | 1, 2, 3, 11 | Demosi |

Unmatched or unmapped employees remain `Pilih/Unidentified` until corrected manually.

### Talent Finder

Talent Finder searches `dt_employee` directly and does not require an uploaded CSV or Excel file. It supports checkbox filters for Eselon and Rumpun, plus a name filter.

The result table is paginated and sortable. It includes:

- Nama
- Eselon
- Usia
- Jabatan
- Pendidikan
- Jurusan
- Universitas/Sekolah Tinggi
- Lama Eselon
- Lama Jabatan
- Homebase

The interface counts matching IDs before explicitly loading result rows, and each header can toggle ascending or descending sorting.

## Fragment Petikan

The experimental `/fragment-petikan` module accepts PDF files up to 100 MB. Choose any positive number of pages per fragment, optionally skip page numbers/ranges such as `1,3-5`, and set the start/end text markers used to mine the output name. Defaults are `Sdr.` and `(NIP`.

The first matching name in each fragment is sanitized and used in a numbered filename such as `1_Nama_Petikan.pdf`. Duplicate names receive a sequence suffix; fragments without a match use `Tanpa Nama`. The resulting PDFs download together as a ZIP. Text extraction requires selectable PDF text; scanned image-only PDFs are not OCR-processed.

## MySQL Setup (Cleaning History)

Cleaning operations are now written to MySQL in `cleaning_history`.

1. Create a `.env` file in `backend/` based on `backend/.env.example`.
2. Set either:
  - `CLEANING_DB_URL=mysql+pymysql://user:password@host:3306/pbncleaner`
  - or individual `MYSQL_*` variables.
3. Run SQL bootstrap:

```bash
mysql -u <user> -p < backend/sql/001_create_cleaning_history.sql
```

4. Start backend normally. On startup, tables are created if missing.

### Example: Upload

```bash
curl -X POST http://localhost:8000/upload \
  -F "file=@data.csv"
```

Response:
```json
{
  "dataset_id": "uuid",
  "columns": ["Name", "Email", "Notes"],
  "rows": [...],
  "row_count": 1000,
  "column_count": 3
}
```

### Example: Remove Columns

```bash
curl -X POST http://localhost:8000/clean/remove-columns \
  -H "Content-Type: application/json" \
  -d '{"dataset_id": "uuid", "columns_to_keep": ["Name", "Email"]}'
```

### Example: Rename Columns

```bash
curl -X POST http://localhost:8000/clean/rename-columns \
  -H "Content-Type: application/json" \
  -d '{"dataset_id": "uuid", "rename_map": {"Customer Name": "customer_name"}}'
```

### Example: Remove Duplicates

```bash
curl -X POST http://localhost:8000/clean/remove-duplicates \
  -H "Content-Type: application/json" \
  -d '{"dataset_id": "uuid", "columns": ["Email"]}'
```

Response includes stats:
```json
{
  "original_rows": 1000,
  "removed_rows": 150,
  "remaining_rows": 850,
  "preview": {...}
}
```

## Architecture Notes

### In-Memory Storage

General datasets are cached in a Python dict keyed by UUID. Mutation/Promosi workspace datasets also have persistent file and workspace-assignment records, so uploaded and cleaned files can be restored.

The in-memory cache means:

- No database setup required
- Data is lost on server restart
- Works well for single-session use cases

For persistence, swap `DatasetStore` (`app/storage/dataset_store.py`) with a Redis or database-backed implementation — the service layer is fully decoupled from storage.

### Future Expansion

The architecture is ready for the planned v2 features:

- `features/dashboard/` directory is reserved for chart and KPI generation
- The service layer can be extended with `profiling_service.py`, `chart_service.py`
- TanStack Table supports column pinning, grouping, and virtual scrolling for larger datasets

## Production Build

```bash
# Frontend
cd frontend && npm run build        # outputs to frontend/dist/

# Backend (production server)
cd backend
python .\run_server.py
```

For internal network hosting, you can serve the built frontend from the project root with:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve-frontend.ps1
```

For containerization, add a `Dockerfile` per service and a `docker-compose.yml` at the root.
