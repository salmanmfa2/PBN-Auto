# Update Notes: Desktop Version 1.2

## Scope and relationship to the web update

This is the implementation specification for the desktop counterpart to web update **1.2**. The intended behavior is aligned with the web update only for the shared features listed below; desktop code must follow the desktop project's existing UI, API, local-file, and packaging architecture. Do not copy React components, web route assumptions, or browser-only storage behavior verbatim.

### Desktop menu and account scope

- The desktop application has exactly two main navigation menus: **PBN Analytics** and **Insight Hub**.
- Do not add any other main navigation menu to desktop as part of this update. Any additional menus or menu-specific workflows belong only in the web update notes unless the user separately changes this requirement.
- Desktop has no login, registration, Guest mode, Admin workspace, or account-management system. Do not add an authentication flow or imply that desktop menus require an account.
- Toolbar actions such as Patch Notes, API Test, and Snake are utility controls, not additional main navigation menus.
- Do not port web-only modules, database tables/views, notifications, or access-control behavior into desktop. Keep existing desktop data-table numbering and export behavior unchanged, except for the Baperjakat-specific numbering and layout requirements below.

The web behavioral reference is [Update Notes 1.2 Web](./Update%20Notes%201.2%20Web.md). This document spells out which behavior applies to desktop and the desktop-specific constraints. It does not by itself claim that a desktop build, installer, or release has already been produced or published.

## 1. Generate Bahan Baperjakat

Provide the same user-facing convenience workflow as web 1.2 where it is explicitly in scope for desktop:

1. Make **Generate Bahan Baperjakat** available only for the **Sitasi Es.III** cleaning/export mode after a dataset and sheet are loaded.
2. Locate a source column named `Kategori`, ignoring surrounding whitespace and letter case. If the selected sheet lacks that column, show a clear error and do not generate output.
3. Use the supplied combined template `backend/templates/combined_tempalate.pptx`, whose first starter slide has space for **4 Mutasi people per slide** and second starter slide has space for **3 Promosi people per slide**.
4. Preserve all active filters other than `Kategori`; replace any existing Kategori filter with the required category for each output section.
5. Produce one presentation with Mutasi slides first and Promosi slides second; do not generate separate presentations and merge them for this action. Download one file named `bahan_baperjakat.pptx`.
6. Keep this convenience workflow separate from the user's manual staging queue and preserve the existing single-file PPTX export.
7. Show a busy state during generation, prevent duplicate requests, surface failures, and clear the busy state after either success or failure.
8. Number rows sequentially from 1 independently within each category. Preserve the Promosi `No.` values `Pendamping I` and `Pendamping II` instead of replacing them with numbers.
9. Rotate only the `No.` cells containing `Pendamping I` or `Pendamping II` by 270 degrees. Do not rotate other `No.` cells or cells in other columns.

Use the desktop's PowerPoint template, filter model, and error UI. Keep the combined template's layouts and slide-master design intact in the generated file.

## 2. Global topbar and update-note dialogs

Add a compact application-wide toolbar at the upper-right of the desktop app, using the desktop project's established window layout and component conventions. Include:

- A live date/time clock formatted for Indonesian users and WIB (`Asia/Jakarta`), refreshed once per second.
- A **Patch Notes** icon button that opens the update summary.
- A **Catatan Staging** icon button that states: “Proses Staging telah diperbaiki pada update 1.2.0.”
- A **Mini Game · Snake** button.
- An **API Test** button.

Provide descriptive accessible names/tooltips, visible keyboard focus, and clear modal close controls. Dialogs should close on Escape and backdrop click when supported by the desktop UI framework; closing a dialog must not navigate away from the current screen.

The patch-note content should describe the features actually included in the desktop build. Do not claim that Manajemen Plt./Plh. is available on desktop.

## 3. API Test: desktop diagnostics

The API Test action opens a result popup rather than only showing a small success/failure toast. It should report separate results for:

1. Backend health/connectivity: request the desktop backend's health endpoint and require the expected successful response.
2. PBN Analytics · Cleaning: confirm the cleaning/upload capabilities needed by the desktop UI are available.
3. PBN Analytics · Dataset & Export: confirm dataset retrieval and supported export/merge capabilities are available.
4. Insight Hub: confirm dashboard capabilities are available.
5. Mini Game · Snake: confirm the packaged/local game resource can be loaded.
6. Any database-backed read checks already used by the desktop application's normal startup, if applicable.

For each group show a success/failure marker and a useful diagnostic detail. Measure elapsed time from the start of the run until all checks finish; display milliseconds below one second and seconds for longer runs.

This check is intended as a fast connectivity/capability diagnostic, not as a destructive end-to-end test. Do not upload, clean, rename, delete, or mutate user datasets just to make the status look more comprehensive. Clearly distinguish a route/capability check from a true functional workflow test. Prevent overlapping runs and show failures rather than returning success-shaped fallbacks.

Adapt how capabilities are discovered to the desktop backend. If it exposes OpenAPI, route registration can be checked there; otherwise use non-mutating health/capability probes already supported by that backend. Do not hardcode a success result merely because the desktop UI contains a menu.

## 4. Mini Game · Snake

- Add Snake to the desktop topbar and open it in a popup/window embedded using the desktop application's established web-content mechanism. Do not replace the current page.
- Package the standalone game asset with the desktop distribution and load it using a reliable local resource path or the desktop's existing local backend route. A web-only URL must not be required for offline desktop play.
- Preserve the game behavior: WASD or arrow keys to steer; Space/P to pause or resume; R to restart; sound toggle; score, speed, and best-score display.
- Preserve browser/local user preference behavior where the desktop runtime supports it; ensure local high score and sound preference do not require a remote service.
- Keep the game view responsive within the popup and provide a descriptive accessible title plus a clear close action.
- Verify the packaged installer includes the game asset and that it opens with networking disabled.

The web reference game is `backend/app/Games/snake.html`. Reuse or adapt that asset only in accordance with the desktop repository's asset packaging and runtime security conventions.

## 5. Desktop implementation and validation guidance

Before implementation, inspect the separate desktop repository and identify its existing equivalents for:

- Analytics export controls and the Sitasi Es.III template selection.
- PPTX generation/merge services and their package relationship handling.
- Shared toolbar/window chrome and modal/dialog patterns.
- Backend health/capability checks and the API base URL.
- Static/local asset packaging, offline runtime, and installer configuration.

Do not add or port web-only module code, schemas, SQL migrations, database views, routes, notifications, or documentation that implies desktop support.

Minimum verification for the in-scope features:

- Baperjakat is visible only in Sitasi Es.III, rejects a missing Kategori column, applies exact Mutasi/Promosi filters while preserving other filters, uses the combined template with 4-person/3-person layouts, orders Mutasi before Promosi, numbers each category independently, preserves and rotates only the Pendamping No. cells, downloads the specified filename, and reports errors/progress correctly.
- The generated Baperjakat PPTX retains the combined template's slide layouts and master design.
- The topbar works across desktop app screens; clock and dialogs are usable by keyboard.
- API Test shows each capability result, reports failures accurately, does not mutate user data, and displays elapsed time.
- Snake works inside the desktop app and in an installed/offline package; high score and sound preference remain local.
- Build and inspect a desktop installer/runtime bundle before calling the update complete. Do not state that the update has been built, installed, or published until those steps have actually been performed.
