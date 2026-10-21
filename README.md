# PBN Cleaner

A production-ready full-stack modular web application for data cleaning, link management, and analytics. Currently featuring PBN dataset cleaning with plans for secure link building and insights hub.

## Features

| Feature | Status | Description |
|---|---|---|
| **PBN Analytics** | ✅ Live | Upload, clean, and export PBN datasets with multiple cleaning modes |
| **Duplicate Removal** | ✅ Live | Select columns as unique key; deduplication with stats |
| **Column Management** | ✅ Live | Hide/remove columns; inline rename with preview table |
| **Export** | ✅ Live | Download as `.csv` or `.xlsx` |
| **Secure Link Building** | 🔄 Coming | Create custom button links with passwords and permissions |
| **Insight Hub** | 🔄 Coming | Advanced analytics and data visualization |

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
│   │   │   └── dataset_service.py # DataFrame logic & mode routing
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
| `/menu-builder` | MenuBuilderPage | Link builder (coming soon) |
| `/insights` | InsightHubPage | Analytics hub (coming soon) |

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
| `GET` | `/clean/recommend-method/{dataset_id}?sheet_name=Sheet1` | Recommend a cleaning method by comparing the uploaded sheet with verification templates |
| `GET` | `/dataset/{id}` | Fetch current dataset preview |
| `GET` | `/export/csv/{id}` | Download as CSV |
| `GET` | `/export/excel/{id}` | Download as Excel |

### Sitasi Es.III (Lite)

`Sitasi Es.III (Lite)` uses the same cleaning rules and PowerPoint profile layout as `Sitasi Es.III`, but keeps rows whose second column is empty instead of deleting them. When exporting a cleaned Lite dataset to Excel, section-heading rows (text in `No` and empty values in the remaining columns) are merged across the row. CSV exports and the in-app preview keep the heading text in `No` with other cells blank; CSV has no merged-cell formatting. The standard `Sitasi Es.III` mode is unchanged.

Sitasi Es.III cleaning sets `Keterangan` to proper case after removing its first six characters. Sitasi Es.IV cleaning sets `Pertimbangan` to proper case. Proper case capitalizes the first letter of each word; missing values remain missing.

### Cleaning method recommendation

After upload, the app compares the selected sheet with reference workbooks in `backend/templates/verification/` and highlights a recommended method for the available PBN Open, PBN Open + Edu + HB, Sitasi Es.III, and Sitasi Es.IV templates. The recommendation never runs cleaning automatically. PBN Open + Edu and Sitasi Es.III (Lite) do not have separate verification templates, so they are not automatically recommended.

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

Datasets are stored in a Python dict keyed by UUID. This means:

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
