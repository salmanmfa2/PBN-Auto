# Update Notes: Web Version 1.2

## Scope and compatibility

This document records the web implementation and behavior of update **1.2**, following version **1.1.0**, dated **2 November 2026**. The follow-up **1.2.1** release summary is in [Update Notes 1.2.1 Web](./Update%20Notes%201.2.1%20Web.md). This remains the behavioral and implementation reference for the web account/admin workflow, Insight Hub, web-only menus, monitoring, toolbar preferences, chat assistant, and Undangan Pelantikan.

- The behavior described here is implemented in the React/FastAPI web application. The corresponding desktop requirements for shared features are in [Update Notes 1.2 Desktop](./Update%20Notes%201.2%20Desktop.md); desktop code must follow its own UI, API, storage, and packaging architecture.
- The desktop application's main navigation is limited to **PBN Analytics** and **Insight Hub** and has no login system. Additional menus and account workflows in this document are web-only.
- **Manajemen Plt./Plh. is web-only. There is no plan to port or integrate it into the desktop application.**
- Do not infer that the desktop counterpart is already implemented, packaged, or released merely because its requirements are documented here.

## 1. Generate Bahan Baperjakat

### Purpose

Provide one action that generates a combined Sitasi Es.III PowerPoint for the Baperjakat workflow:

1. Mutasi records use the standard template with **4 people per slide**.
2. Promosi records use the 3-row template with **3 people per slide**.
3. The Mutasi presentation is placed before the Promosi presentation in the combined output.

### Availability and selection rules

- Show **Generate Bahan Baperjakat** only when the selected cleaning mode is exactly **Sitasi Es.III**.
- The selected dataset and sheet must already be loaded.
- The selected sheet must contain a column whose trimmed name matches `Kategori` case-insensitively. If absent, do not generate a file; show the Indonesian error that the `Kategori` column was not found on the selected sheet.
- Always filter the source rows to exact category values `Mutasi` and `Promosi`, respectively.
- Ignore any existing user filter on the `Kategori` column and replace it with the required category for each half of the output. Preserve the other active table filters for both halves.
- Generate Mutasi first with the 4-person starter slide and Promosi second with the 3-person starter slide from `backend/templates/combined_tempalate.pptx`.
- Keep the output as one presentation using the combined template; do not merge two separately generated PPTX files for this action. Download one file named `bahan_baperjakat.pptx`.
- Do not add the intermediate presentations to the user's separate staging queue.

### Progress and errors

- While either presentation is being generated or the merge is running, show a busy state and prevent duplicate Baperjakat requests.
- If generation or merging fails, leave the regular export/staging state untouched and show the actual error in the Baperjakat error area. Always clear the busy state after success or failure.
- The action is a convenience workflow; it does not change the normal single-template PPTX export or manual staging behavior.

### Web implementation map

- `frontend/src/pages/AnalyticsPage.tsx` — visibility/eligibility, category filtering, one-request generation, download name, and error/progress state (`handleGenerateBahanBaperjakat`).
- `frontend/src/services/api.ts` — Baperjakat generation request, regular PPTX generation/merge, and download helpers.
- `backend/app/services/powerpoint_service.py` — combined-template Baperjakat generation and regular profile/merge behavior.
- `backend/app/api/dataset.py` — PowerPoint generation, Baperjakat, and merge endpoints.

## 2. Global topbar, update notes, and API diagnostics

### Placement and clock

- Render the topbar at the upper-right of the application shell on all React routes.
- Display the current date and time in Indonesian formatting using the `Asia/Jakarta` time zone (WIB); refresh the displayed clock once per second.
- The topbar contains icon buttons for Patch Notes, unresolved notes, Snake, and API Test. Preserve visible keyboard focus and accessible button names; the SVG icons are decorative.
- The clock toolbar is draggable; dragging must move its actual interactive hitbox along with its appearance.
- For a logged-in user, show the user's name and authority level alongside the clock. Do not treat this account display as desktop functionality.
- Provide **Default**, **Dark**, and **Light** appearance choices from the toolbar. Default retains the application's original dark appearance. Apply the theme across the web app, not just to the toolbar.
- Persist a logged-in user's most recent theme in the account's `user_preferences` database row so it follows that account across sessions/devices. Guest mode stores its theme only in that browser's local storage. A failed preference load/save must be reported to the user.
- Keep toolbar utility actions compact behind an accessible show/hide control. This controls Patch Notes, unresolved notes, Snake, API Test, and Admin when available; the account sign-in/sign-out action stays visible. Utility visibility does not change navigation permissions.

### Patch Notes and unresolved notes

- **Patch Notes** opens a modal containing the release/update summary maintained in the toolbar component.
- **Catatan Staging** opens a modal stating that the staging process was fixed in update 1.2.0.
- Both dialogs close from the close button, Escape, or clicking the backdrop. They must not navigate away from the current route.

### API Test popup: meaning of a passing check

The API Test button opens a modal and runs the following read-only/contract checks:

1. `GET /health` must return JSON with `status: "ok"`.
2. Read `GET /openapi.json` and confirm that the expected method/path pairs for Cleaning, Dataset & Export, Insight Hub, Insight Hub Beta, Manajemen Plt./Plh., Undangan Pelantikan, and Snake are registered.
3. Call `GET /stored-datasets` and report how many stored dataset runs were returned.
4. Call `GET /plt-plh/records` and `GET /plt-plh/notifications` to verify those read endpoints and their database access.

Display each group independently with a success or failure indicator and a useful error detail. If OpenAPI cannot be loaded, the route groups that depend on it must report failure; do not report those checks as successful.

This is a connectivity, route-registration, and read-access diagnostic, **not** a full functional test of every menu. It does not upload or mutate datasets, execute each cleaning operation, generate an Insight Hub dashboard, or test create/update/delete/export workflows. Do not describe a passing route-registration check as proof that all section functionality works.

Measure elapsed time in the browser from the start of the diagnostic until all checks finish. Show the total as milliseconds for runs below one second and as seconds for longer runs. Keep the dialog open to display results; allow it to close while the app remains on its current route. Prevent a second simultaneous run while one is in progress.

### API diagnostic implementation map

- `frontend/src/components/AppToolbar.tsx` — global toolbar, clock, dialogs, loading/results states, elapsed-time display, and accessible labels.
- `frontend/src/services/api.ts` — `runApiDiagnostics`, the expected OpenAPI route groups, read-only requests, and theme-preference requests.
- `backend/main.py` — `/health` and `/games/snake`; other router registration occurs in this application entry point.

## 3. Snake mini game in the topbar

- The topbar's game icon opens **Mini Game · Snake** in a modal iframe. It must not replace the current application route.
- Serve the supplied standalone game page from the backend at `GET /games/snake`; the frontend obtains this URL through `getSnakeGameUrl()`.
- Preserve the game page's own controls and presentation: WASD or arrow keys to steer, Space/P to pause or resume, and R to restart. The game also includes sound controls and stores the sound preference and high score in browser `localStorage`.
- Keep the game embedded in a bounded, responsive iframe inside the popup. Use a descriptive iframe title and retain the modal's close button, backdrop close, and Escape behavior.
- The game endpoint is a page-serving route, not a game-data API.

### Web implementation map

- `backend/app/Games/snake.html` — standalone game UI, gameplay, controls, sound, and local high-score persistence.
- `backend/main.py` — serves the HTML page at `/games/snake`.
- `frontend/src/services/api.ts` — constructs the configured backend URL for the game page.
- `frontend/src/components/AppToolbar.tsx` — topbar game button and modal iframe.

## 4. Manajemen Plt./Plh. monitoring (web-only)

### Scope and data model

This module tracks active Pelaksana Tugas/Pelaksana Harian appointments. It is separate from PBN dataset cleaning but is reachable from the web application's home menu. **Do not implement it in the desktop app; desktop integration is not planned.**

Each monitoring record contains:

- `Jabatan Kosong`
- `Pejabat Pengganti`
- `Jabatan Definitif Pengganti`
- `Nomor Surat`
- `TMT` (Terhitung Mulai Tanggal)
- Calculated `Masa Kerja`
- Calculated `Status`

The database has a generated primary key used internally by API mutations and table actions. Do not present this key as the row number. The table and Excel export instead display contiguous `No.` values from 1 to N in the current record order. Deleting a record therefore does not leave numbering gaps; no primary-key reset or destructive database migration is needed.

### Ordering, tenure, and status

- List active records before inactive records, then by TMT descending, then by internal primary key descending.
- Calculate only completed months from TMT to today: subtract one month when today's day-of-month is earlier than the TMT day. Display completed tenure as years and remaining months (`Y M`).
- For an active record, fewer than 5 completed months means `Aktif`; 5 to fewer than 6 means `Mendekati 6 Bulan`; 6 or more means `Lebih dari 6 Bulan`.
- An explicitly deactivated record always has status `Inaktif`, regardless of tenure.
- TMT cannot be in the future. Required text fields are trimmed and cannot be blank; each is limited to 2,000 characters.

### CRUD, password, and access

- Guest and authenticated User accounts can view monitoring records. Add, edit, activate/deactivate, and delete actions require an authenticated Admin (level 2) or Super Admin (level 3).
- The former shared edit password is no longer used for this module. Existing installations may retain the old password table; do not read, seed, or modify it.
- Add/edit fields are entered in a popup opened by **Tambah Monitoring** or the row's edit icon. The popup closes from its close/cancel controls, Escape, or backdrop click when a save is not in progress.
- Deactivate/reactivate and delete actions use confirmation dialogs. Use accessible names/titles for icon-only row actions.
- Surface API/validation errors to the user. Do not silently treat failed mutations as successful.

### Notifications and Excel export

- The home page requests notifications and shows a link to the monitoring page when at least one active record has status `Mendekati 6 Bulan` or `Lebih dari 6 Bulan`.
- The monitoring page also lists records needing attention.
- Excel export includes all rows in the same list order, without app-side filters. The first column is `No.` numbered 1–N, followed by the four text fields, TMT, Masa Kerja, and Status. Format TMT as a date and retain the styled header/frozen header row.

### API and persistence

- Prefix: `/plt-plh`.
- `GET /records` — list all records with computed tenure and status.
- `GET /notifications` — records with either warning status.
- `GET /records/export` — download the complete `.xlsx` workbook.
- `POST /records` — create; Admin or Super Admin bearer token required.
- `PUT /records/{record_id}` — update fields; Admin or Super Admin bearer token required.
- `PATCH /records/{record_id}/active` — activate/deactivate; Admin or Super Admin bearer token required.
- `DELETE /records/{record_id}` — delete; Admin or Super Admin bearer token required.
- Persist monitoring rows in the configured `pbncleaner` MySQL-compatible database. The SQL bootstrap is `backend/sql/002_create_plt_plh_monitoring.sql`; application startup also registers the ORM models and creates missing tables.

### Implementation map

- `frontend/src/pages/PltPlhManagementPage.tsx` — monitoring table, sequential display numbering, add/edit popup, confirmations, notifications, and export action.
- `frontend/src/pages/LandingPage.tsx` — home menu entry and warning notification.
- `frontend/src/App.tsx` — `/manajemen-plt-plh` route and shared toolbar.
- `frontend/src/services/api.ts` and `frontend/src/types/index.ts` — API requests and frontend record types.
- `backend/app/api/plt_plh.py` — HTTP endpoints.
- `backend/app/schemas/plt_plh.py` — request/response validation.
- `backend/app/models/plt_plh.py` and `backend/app/history_db.py` — persistence model registration.
- `backend/app/services/plt_plh_service.py` — calculation, status rules, CRUD helpers, notification selection, and `.xlsx` generation.
- `backend/sql/002_create_plt_plh_monitoring.sql` — manual database bootstrap and views.

### Explicitly deferred

- Word-template/document generation. Wait for the user to provide the approved document templates and specify which formal letters to generate.
- Any desktop implementation of Manajemen Plt./Plh.

## 5. Account and admin workflow (web-only)

### Roles and access

- The login page supports account login, public registration, and **Lanjut sebagai Guest**.
- Public registration immediately creates a level-1 User; there is no approval workflow.
- Levels are fixed as `1 = User`, `2 = Admin`, and `3 = Super Admin`. Guest is an unauthenticated app mode and is not stored as a database account.
- Guest and User can use the normal dataset-cleaning workflows and view Plt./Plh. records. Only Admin and Super Admin can mutate shared Plt./Plh. records.
- Admin and Super Admin can access `/admin`. The Admin workspace exposes shared Plt./Plh. management; only Super Admin can list, create, update, deactivate, or delete accounts.
- Do not infer that the desktop app has login, registration, an Admin workspace, or account management.

### Database, bootstrap, and session behavior

- `backend/sql/003_create_users_and_sessions.sql` creates `users` with the requested `user`, `name`, `auth_level`, and plain-text `password` columns, plus `is_active` and `created_at`; it also creates `user_sessions` and `user_preferences`.
- `user_preferences` stores one `theme` value (`default`, `dark`, or `light`) per account and is deleted with the account. Missing preferences resolve to `default`.
- Do not seed an account automatically. Insert the first level-3 Super Admin manually using the commented SQL example, then use the Admin workspace to manage accounts.
- Account passwords are intentionally stored as plain text for this functional phase. Never return passwords from API responses. Password hashing and broader security hardening remain explicitly deferred; this setup is not production-secure.
- Sessions use random bearer tokens; only token hashes are persisted. Sessions expire one hour after login and are revoked on logout or account update/deletion. At least one active Super Admin must remain, and a Super Admin cannot demote, deactivate, or delete their own account.
- API routes: `/auth/register`, `/auth/login`, `/auth/me`, and `/auth/logout`; Super-Admin-only account routes are under `/admin/users`.
- Authenticated `GET /auth/preferences/theme` reads the current user's theme; `PUT /auth/preferences/theme` updates only the current user's value.
- The existing MySQL connection configured for application history is shared by the account/session tables. Startup creates missing mapped tables. The SQL script is also provided for explicit/manual bootstrap.

### Implementation map

- `frontend/src/pages/LoginPage.tsx` — login, public registration, and Guest entry.
- `frontend/src/contexts/AuthContext.tsx` — session and Guest state, login/logout, and startup session resolution.
- `frontend/src/pages/AdminPage.tsx` — Admin workspace and Super Admin account management.
- `frontend/src/App.tsx` — session and Admin route guards.
- `frontend/src/components/AppToolbar.tsx` — account sign-in/sign-out entry.
- `frontend/src/services/api.ts` and `frontend/src/types/index.ts` — auth requests and account types.
- `backend/app/api/auth.py` — authentication and role-protected account routes.
- `backend/app/services/auth_service.py` and `backend/app/models/auth.py` — account/session persistence, token lifecycle, and per-user theme preference.
- `backend/sql/003_create_users_and_sessions.sql` — manual schema bootstrap and first-Super-Admin example.

## 6. Web home menu and web-only navigation

- The web home menu includes **PBN Analytics**, **Insight Hub**, **Insight Hub Beta**, **Manajemen Plt./Plh.**, **Generate ND Undangan Pelantikan**, and **Analisis Kinerja DJPb**.
- **Insight Hub Beta** is a web-only database-backed dashboard using `pbncleaner.fetch_pbnopen`. It shares Insight Hub's filters, charts, and employee table; no new database table or schema change is required.
- Only a **Super Admin** can replace the Insight Hub Beta source from the Admin page. The CSV must have exactly the table's column names (column order may differ); successful validation opens a separate confirmation popup. The server validates again and replaces the table rows transactionally only after confirmation. Empty files and mismatched or duplicate columns are rejected.
- **Generate ND Undangan Pelantikan** is available to signed-in Users, Admins, and Super Admins; Guest mode cannot access it. Each user sees and manages only agendas they created.
- **Analisis Kinerja DJPb** remains a placeholder that opens the “On development” message.
- Show the **Admin** menu at the bottom of the menu list for users with Admin or Super Admin access.
- These additional menus and their ordering are web-only. They must not be added to the desktop app, whose main menu contains only PBN Analytics and Insight Hub.

### Update 1.2.1: Generate ND Undangan Pelantikan

- The agenda menu shows the signed-in user's history first; create an agenda from a popup before uploading a workbook. The agenda contains the pelantikan date, ND number and date, one shared pelantikan time, dress code, and shared `level_jabatan`. Infer the weekday from the pelantikan date.
- Accept one `.xlsx` or `.xls` workbook per agenda. Skip the first two rows and use the third row as headers. Remove rows with a blank `Nama/NIP`; extract the 18-digit NIP from the last non-empty line in that cell and look it up in `pbncleaner.fetch_pbnopen`. Keep only `No`, `Nama/NIP`, `Jabatan Saat ini/Grade`, and `Usul Jabatan Baru/Grade` from the workbook for display; these source fields do not replace the database lookup values.
- Keep the workbook and generated documents out of persistent storage. Persist the agenda and participant lookup snapshot, including the four displayed source fields, NIP, lookup result, selection, and Daring/Luring choice, so the owner can resume later. Reuploading replaces that agenda's participant snapshot.
- Users can include only a matched employee with a Unit Eselon II. Rows marked `Pendamping` in the `No` column are always excluded. The **Pilih Semua** action selects eligible matched employees only. For duplicate workbook NIPs, the first occurrence may be selected and later occurrences are excluded. Excel NIP cells should be stored as text to avoid numeric precision loss.
- Generate one ND per **Unit Eselon II and modality**. A unit containing both Daring and Luring participants receives two separate documents. Download all generated DOCX files in one ZIP.
- Before generating the ZIP, preview each Unit Eselon II/modality document group; expand a group to review its employee list. Format known recipients as formal titles (Kanwil DJPb → Kepala Kantor Wilayah Direktorat Jenderal Perbendaharaan, Direktorat → Direktur, Badan → Kepala Badan); preserve unrecognized unit names.
- In the generated roster, append the formal Unit Eselon II name to `Jabatan` only when the employee has a known `eselon` value other than 2. Keep the title alone for Eselon II and when `eselon` is unavailable.
- Replace only the app-owned parenthesized placeholders in the templates. Preserve square-bracket placeholders such as `[@NomorND]` and `[@TanggalND]` for the official internal app.
- The source templates are `backend/templates/undangan_pelantikan/template_pelantikan_daring.docx` and `backend/templates/undangan_pelantikan/template_pelantikan_luring.docx`.
- Implementation map: `frontend/src/pages/PelantikanAgendaPage.tsx`, `frontend/src/services/api.ts`, `frontend/src/types/index.ts`, `backend/app/api/pelantikan_agenda.py`, `backend/app/services/pelantikan_agenda_service.py`, `backend/app/models/pelantikan_agenda.py`, `backend/app/schemas/pelantikan_agenda.py`, and `backend/sql/005_create_pelantikan_agendas.sql`. Application startup adds any missing source columns to an existing `pelantikan_agenda_people` table.

## 7. Groq chat assistant (web-only)

- Authenticated web users can open the compact chat widget in the lower-right corner. Chat is not a desktop menu or desktop capability.
- The widget renders assistant Markdown, including headings, lists, tables, links, inline code, and code blocks. Raw HTML is not rendered; user messages remain plain text.
- **Clear** empties the visible in-memory conversation, draft, and error state. Clearing while a request is pending must prevent its eventual response from restoring the cleared conversation. Chat history is not persisted.
- The backend sends messages and conversation context to Groq using a server-side `GROQ_API_KEY`; never expose the key in frontend code. The widget warns users not to submit passwords or sensitive personal data.
- The assistant is instructed to rely on confirmed app capabilities, avoid inventing menus and workflows, and admit uncertainty. This reduces unsupported claims but does not guarantee that generated answers are always correct.

## 8. Verification guidance

When modifying these features:

- For Baperjakat, verify the category column lookup, replacement of any existing Kategori filter, retention of other filters, Mutasi-before-Promosi order, 4-person/3-person starter slides from the combined template, output filename, progress state, and visible error handling.
- For the API Test, verify it performs only the documented health, OpenAPI, and read requests; each missing route group or failed data request must display a failure. Confirm elapsed time is reported after completion.
- For Snake, verify the backend route serves the game and the toolbar opens/closes the iframe without changing the current app route.
- For monitoring, test the 5- and 6-completed-month boundaries, deactivation override, future-TMT rejection, password rejection, CRUD, notification selection, and export. Include a regression test where database IDs are non-contiguous (for example 7 and 11) and assert visible/export row numbers are 1 and 2.
- The current focused backend monitoring tests cover completed-month boundaries, inactive status, and contiguous export numbering. Frontend production build and lint are the available frontend checks; existing lint warnings in cleaning components are unrelated unless a change affects those files.
