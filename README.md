# PBN Cleaner

A full-stack web application for PBN dataset cleaning and analytics.

## Release notes

The current web update is **1.2**: [Web update notes](./Update%20Notes/Update%20Notes%201.2%20Web.md). The corresponding desktop requirements are documented separately in [Desktop update notes](./Update%20Notes/Update%20Notes%201.2%20Desktop.md); those notes do not claim a desktop build or release has been produced.

The desktop application's main navigation is limited to **PBN Analytics** and **Insight Hub**, with no login system. The additional placeholder menus described in the web notes are web-only. Version **2.0** is a future milestone for when those placeholder menus become functional.

## Features

| Feature | Status | Description |
|---|---|---|
| **PBN Analytics** | ✅ Live | Upload, clean, and export PBN datasets with multiple cleaning modes |
| **Duplicate Removal** | ✅ Live | Select columns as unique key; deduplication with stats |
| **Column Management** | ✅ Live | Hide/remove columns; inline rename with preview table |
| **Export** | ✅ Live | Download as `.csv` or `.xlsx` |
| **Insight Hub** | ✅ Live | PBN Open + Edu + HB dashboard with employee totals and distributions |
| **Manajemen Plt./Plh.** | ✅ Live | Monitor acting assignments, calculate tenure/status, receive dashboard notices, and export records |
| **Web accounts and roles** | ✅ Live | Guest, User, Admin, and Super Admin access; one-hour authenticated sessions |
| **Admin workspace** | ✅ Live | Super Admin account management and shared Plt./Plh. administration |
| **Additional web menus** | 🛠️ Placeholder | Generate ND Undangan Pelantikan and Analisis Kinerja DJPb currently show “On development”; desktop does not include them |
| **Appearance** | ✅ Live | Default, Dark, and Light themes; signed-in users' preferences follow their accounts |
| **App Toolbar** | ✅ Live | WIB clock, draggable position, collapsible utility actions, API diagnostics, and Snake |
| **AI chat assistant** | ✅ Live | Authenticated web chat with Markdown rendering and clear-chat control; uses backend-configured Groq |

## Tech Stack

**Frontend:** React 19 · Vite · TypeScript · Tailwind CSS v3 · React Router v7 · TanStack Table · Axios

**Backend:** Python 3.11+ · FastAPI · Pandas · openpyxl · Groq Python SDK · Uvicorn

**Deployment:** Windows batch scripts · PowerShell · Local or intranet hosting

## Project Structure

```
Project PBNCleaner/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── upload.py          # POST /upload
│   │   │   ├── cleaning.py        # POST /clean/*
│   │   │   ├── dataset.py         # GET /dataset/:id, GET /export/*
│   │   │   ├── auth.py            # Web login, preferences, and account endpoints
│   │   │   └── chat.py            # Authenticated Groq chat endpoint
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
│       │   ├── InsightHubPage.tsx # /insights route
│       │   ├── PltPlhManagementPage.tsx # Web-only monitoring
│       │   ├── LoginPage.tsx      # Web login/registration/Guest
│       │   └── AdminPage.tsx      # Web account administration
│       ├── components/
│       │   ├── AppToolbar.tsx      # Clock, theme, utility toolbar
│       │   ├── ChatWidget.tsx      # Authenticated Groq chat
│       │   ├── ErrorBanner.tsx
│       │   └── Spinner.tsx
│       ├── contexts/
│       │   └── AuthContext.tsx    # Session and Guest state
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
| `/` | LandingPage | Feature selector |
| `/pbn-analytics` | AnalyticsPage | PBN dataset cleaning (active) |
| `/insights` | InsightHubPage | PBN Open + Edu + HB analytics dashboard |
| `/manajemen-plt-plh` | PltPlhManagementPage | Plt./Plh. assignment register, notifications, and export |
| `/admin` | AdminPage | Admin workspace; account management is Super Admin-only |
| `/login` | LoginPage | Sign in, register, or continue as Guest |

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
| `GET` | `/plt-plh/records` | List Plt./Plh. monitoring records |
| `POST` / `PUT` / `PATCH` / `DELETE` | `/plt-plh/records` | Create, edit, activate/deactivate, or delete a record (Admin or Super Admin login required) |
| `GET` | `/plt-plh/notifications` | List active records at or past the six-month notification threshold |
| `GET` | `/plt-plh/records/export` | Download all records as `.xlsx` |
| `POST` | `/auth/register` | Register a level-1 User account |
| `POST` | `/auth/login` | Sign in and receive a bearer token |
| `GET` | `/auth/me` | Get the current account |
| `POST` | `/auth/logout` | Revoke the current session |
| `GET` / `PUT` | `/auth/preferences/theme` | Read or update the signed-in user's theme preference |
| `GET` / `POST` / `PUT` / `DELETE` | `/admin/users` | Manage accounts (Super Admin only) |
| `POST` | `/chat` | Generate an authenticated Groq chat response |

### Accounts and roles

The web app supports Guest, User (level 1), Admin (level 2), and Super Admin (level 3). Public registration creates a level-1 account immediately. Guest and User accounts can view Plt./Plh. monitoring records; only Admin and Super Admin can change them. The Admin workspace is limited to authenticated Admin and Super Admin accounts; user-account management is Super Admin-only. Dataset cleaning remains available to Guest and User accounts.

The toolbar offers Default (the original dark appearance), Dark, and Light themes. Authenticated users' last-selected theme is stored in `user_preferences` and follows their account; Guest preferences are stored in that browser only. Patch Notes, unresolved notes, Snake, API Test, and Admin tools are grouped behind the toolbar's show/hide control; sign-in/sign-out remains visible.

The first Super Admin is **not seeded automatically**. After creating the account tables, insert the first Super Admin manually using the commented example in `backend/sql/003_create_users_and_sessions.sql`, then sign in and use the Super Admin workspace. User passwords are intentionally stored as plain text in MySQL at this stage, per the current project requirement. This is not suitable for production or sensitive deployments; do not expose the database or use real/reused passwords.

### Sitasi Es.III (Lite)

`Sitasi Es.III (Lite)` uses the same cleaning rules and PowerPoint profile layout as `Sitasi Es.III`, but keeps rows whose second column is empty instead of deleting them. When exporting a cleaned Lite dataset to Excel, section-heading rows (text in `No` and empty values in the remaining columns) are merged across the row. CSV exports and the in-app preview keep the heading text in `No` with other cells blank; CSV has no merged-cell formatting. The standard `Sitasi Es.III` mode is unchanged.

Sitasi Es.III cleaning sets `Keterangan` to proper case after removing its first six characters. Sitasi Es.IV cleaning sets `Pertimbangan` to proper case. Proper case capitalizes the first letter of each word; missing values remain missing.

For **PBN Open + Edu + HB**, Auto Clean removes straight apostrophe and backtick characters from string cell values, then converts `TMT JF Keterampilan`, `TMT JF Keahlian`, `TMT JF Ahli Muda`, `TMT JF Ahli Madya`, `TMT Es4`, `TMT Es3`, `TMT Es2`, and `TMT Jabatan` values to dates. Unparseable non-empty date values are kept as cleaned text and shown in a warning.

### AI chat assistant

Authenticated users can open the small chat button in the lower-right corner. Assistant replies render Markdown, and the Clear action removes the visible, in-memory conversation. The assistant is instructed not to invent unconfirmed app features, but generated replies can still be incorrect. Chat requests are sent by the backend to Groq; the Groq API key must be configured as `GROQ_API_KEY` in `backend/.env`, and `GROQ_MODEL` can override the default `openai/gpt-oss-120b` model. Never place the key in frontend code or frontend environment variables. Messages and supplied conversation context are transmitted to Groq to generate replies; users should not include passwords or sensitive personal data.

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

The Plt./Plh. module uses the same database. Its schema is in `backend/sql/002_create_plt_plh_monitoring.sql`.

Run its initial schema once as well:

```bash
mysql -u <user> -p < backend/sql/002_create_plt_plh_monitoring.sql
```

Create the account and session tables as well:

```bash
mysql -u <user> -p < backend/sql/003_create_users_and_sessions.sql
```

Then insert the first Super Admin by editing and running the commented SQL example in that script. No account is created automatically. Start the backend normally; missing mapped tables are also created on startup.

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

- The web-only **Generate ND Undangan Pelantikan** and **Analisis Kinerja DJPb** menus are placeholders. Making these workflows functional is the planned product milestone for version 2.0.
- Desktop remains a separate product surface with only PBN Analytics and Insight Hub in its main navigation and no account/login system.
- The service layer and TanStack Table can be extended for future analytics, profiling, and larger datasets as requirements are defined.

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
