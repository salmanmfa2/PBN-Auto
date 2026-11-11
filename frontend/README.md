# PBN Cleaner Frontend

React 19 + TypeScript + Vite frontend for the PBN Cleaner platform. Uses React Router for multi-page navigation and TanStack Table for data visualization.

## Tech Stack

- **React 19** — Latest React with concurrent rendering
- **Vite** — Fast build tool and dev server (HMR enabled)
- **TypeScript** — Type-safe code
- **React Router v7** — URL-based routing
- **Tailwind CSS v3** — Utility-first styling
- **TanStack Table** — Headless table library for data grids
- **Axios** — HTTP client for API calls

## Project Structure

```
src/
├── pages/                        # React Router page components
│   ├── LandingPage.tsx          # / route (feature cards)
│   ├── AnalyticsPage.tsx        # /pbn-analytics (data cleaning)
│   ├── InsightHubPage.tsx       # /insights and /insights-beta
│   ├── PltPlhManagementPage.tsx # /manajemen-plt-plh
│   ├── PelantikanAgendaPage.tsx # /undangan-pelantikan
│   ├── PerformanceAnalysisPage.tsx # /analisis-kinerja
│   ├── LoginPage.tsx            # /login
│   └── AdminPage.tsx            # /admin
├── features/                     # Feature-scoped components
│   ├── upload/
│   │   └── UploadZone.tsx
│   └── cleaning/
│       ├── DataTable.tsx        # TanStack Table viewer
│       ├── ColumnManager.tsx    # Column selection/rename
│       └── DuplicateRemover.tsx # Duplicate detection
├── hooks/
│   └── useDataset.ts            # Main state & API orchestration
├── services/
│   └── api.ts                   # Axios HTTP wrappers
├── components/
│   ├── ErrorBanner.tsx          # Error display
│   └── Spinner.tsx              # Loading indicator
├── types/
│   └── index.ts                 # Shared TypeScript interfaces
├── assets/
│   ├── logo_analysis.png
│   └── logo_brain.png
├── App.tsx                      # React Router setup
├── main.tsx                     # App entry point with BrowserRouter
├── index.css                    # Global styles
└── vite-env.d.ts               # Vite environment types
```

## Quick Start

### Development

```bash
npm install
npm run dev
```

App runs at `http://localhost:5173` with HMR enabled.

### Production Build

```bash
npm run build          # TypeScript check + Vite build
npm run preview        # Preview production build locally
```

Output goes to `dist/`.

## Routing

Using **React Router v7** with page components in `src/pages/`:

```
/                    → LandingPage (feature selector)
/pbn-analytics       → AnalyticsPage (data cleaning interface)
/insights            → InsightHubPage (in-memory dataset dashboard)
/insights-beta       → InsightHubPage (database-backed PBN Open dashboard)
/manajemen-plt-plh   → PltPlhManagementPage (web-only monitoring)
/undangan-pelantikan → PelantikanAgendaPage (web-only agenda and document workflow)
/analisis-kinerja   → PerformanceAnalysisPage (public read access; uploads are Super Admin-only)
/undangan-pelantikan-experimental → PelantikanAgendaPage (configurable experimental sheet import)
/admin               → AdminPage (role-gated administration)
/login               → LoginPage (authentication and Guest entry)
```

All feature routes except `/login` require a session. Unmatched routes redirect to the landing page. Plt./Plh. employee search is restricted to Admin and Super Admin; Pelantikan agendas are scoped to their signed-in owner.

Analisis Kinerja is publicly readable, including in Guest mode. Only Super Admin can upload or adjust performance data.

The global `AppToolbar` includes the WIB clock, theme selection, utility tools, and drag-to-move positioning that snaps to the nearest screen edge on release and after viewport resizing.

### Adding a New Route

1. Create a page component in `src/pages/YourPage.tsx`:

```tsx
export default function YourPage() {
  return <div>Your content</div>;
}
```

2. Register the route in `src/App.tsx`:

```tsx
<Route path="/your-route" element={<YourPage />} />
```

3. Navigate to it from other pages using the `useNavigate` hook:

```tsx
const navigate = useNavigate();
navigate('/your-route');
```

## Environment Variables

Backend API URL is configured via environment variables:

```bash
# .env.development (local development)
VITE_API_URL=http://localhost:8000

# .env.production (network deployment)
VITE_API_URL=http://<server-hostname-or-ip>:8000
```

The `src/services/api.ts` reads `VITE_API_URL` and defaults to `localhost:8000` if not set.

## Key Components & Hooks

### `useDataset` Hook

Central state management and API orchestration. Handles:
- File uploads
- Dataset preview
- Column operations (remove, rename)
- Duplicate detection
- Auto-clean mode routing
- CSV/Excel export

Usage in page components:

```tsx
const { preview, status, upload, applyAutoClean } = useDataset();
```

### `DataTable` Component

TanStack Table viewer with pagination, filtering, and sorting. Previews up to 500 rows server-side for performance.

### `UploadZone` Component

Drag-and-drop file upload with progress bar. Accepts `.csv`, `.xlsx`, `.xls`.

## Styling

Uses **Tailwind CSS v3** with custom theme variables:

```css
/* Global custom classes (index.css) */
.btn-primary { ... }
.btn-secondary { ... }
.btn-ghost { ... }
.card { ... }
.section-title { ... }
```

## Debugging

- **Dev Tools:** Open browser DevTools (F12) to inspect React component tree and network requests.
- **Network Requests:** All API calls go through `src/services/api.ts`. Check browser Network tab to see request/response.
- **Component State:** Use React DevTools to inspect component state and props.
- **Build Issues:** Run `npm run build` to catch TypeScript errors before deployment.

## Performance Tips

- DataTable only shows first 500 rows (configurable in `useDataset.ts` via `PREVIEW_LIMIT`).
- Lazy-loading future modules (MenuBuilder, Insights) with route-based code splitting (automatic with React Router).
- Use `useMemo` and `useCallback` in hooks to avoid unnecessary re-renders.

## Common Tasks

- **Fix a build error:** Check the TypeScript compiler output. Run `npm run build` for full errors.
- **Add a new feature page:** Create file in `src/pages/`, add route in `App.tsx`, link from `LandingPage.tsx`.
- **Add an API endpoint:** Create wrapper in `src/services/api.ts`, wire into `useDataset.ts`, call from page component.
- **Styling tweaks:** Edit Tailwind classes in component JSX or add custom CSS to `index.css`.

## Deployment

1. Build the app:
   ```bash
   npm run build
   ```

2. The `dist/` folder is served by `serve-frontend.ps1` on port 8081 in production.

3. For network deployment, `run-app.bat` detects the active LAN address automatically. Set `host` in the root `config.json` only if you need to override it with a DNS name or reserved address:
   ```bash
   run-app.bat
   ```

---

For questions on architecture or setup, see [../DEVELOPER.md](../DEVELOPER.md).
