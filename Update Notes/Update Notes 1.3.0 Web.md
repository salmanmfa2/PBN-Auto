# Update Notes: Web Version 1.3.0

## Scope

Version 1.3.0 records the web application changes not covered by [Update Notes 1.2.1 Web](./Update%20Notes%201.2.1%20Web.md). These changes do not imply that a corresponding desktop build or release has been produced.

## Analisis Kinerja DJPb

### Shared data and access

- The performance analysis and extracted employee table are available to Guest, User, Admin, and Super Admin. Full-data uploads and adjustment uploads remain restricted to Super Admin.
- The application uses one globally shared active dataset. A validated full upload replaces it; the dataset is not partitioned by account.
- Full-data uploads accept 16- or 18-digit NIPs. Employees that cannot be matched to the current PBN Open source are retained and shown under `Unidentified` for Unit Eselon II and Eselon.
- Uploaded `NKP Awal` and `NKP Akhir` are preserved as the source baseline. A validated adjustment upload recalculates `NKP Akhir` without changing NKO or `NKP Awal`.
- Positive Hukuman Disiplin and Dampak Pelanggaran Disiplin magnitudes are normalized to negative deductions. Blank adjustment cells preserve their existing values, and invalid or duplicate adjustment NIPs prevent the upload from being applied.
- The adjustment workbook keeps NIP values as text to prevent spreadsheet precision loss.

### Dashboard and employee data

- The analysis is organized into three tabs: **Overview**, **Unit Eselon II**, and **Daftar Pegawai**.
- Overview includes score and status summaries, an NPK histogram covering 80–120, filters for Unit Eselon II and Eselon, and correction/discipline-impact counts.
- The Unit Eselon II table expands to Unit Eselon III and includes score/status summaries, correction and discipline-impact metrics, and **Gap Status** (NKP Akhir Sangat Istimewa count minus NKP Perhitungan Sangat Istimewa count; positive is green, zero uses the default text color, and negative is red).
- The employee list supports search, per-column filtering, sorting, and pagination. Filter results remain mounted during refresh to avoid page-position jumps, and dashboard summaries are cached to speed up filtering.
- Excel exports are available for the Unit Eselon II analysis and employee list. The employee export follows the active search, filters, and sort and includes all matching records, not only the current page.
- Admin and Super Admin can edit a shared Insight Text; all dashboard viewers can read it.

## Generate ND Undangan Pelantikan Experimental

- A separate experimental workflow imports a single sheet, all workbook sheets, selected sheets, or keeps sheet groups isolated in one agenda. The standard Generate ND workflow remains available and unchanged.
- Empty or incompatible sheets are skipped with import feedback. Source sheet and row information are retained with imported participants.
- Duplicate NIPs are reported and only the first occurrence in workbook order can be selected.
- In combined import modes, employees from different sheets with the same Unit Eselon II can be grouped together. Isolated mode keeps preview and generated-document groups separated by source sheet.
- **Deselect All** is available in both the standard and experimental participant-selection workflows.

## Employee Data Source and Admin

- The Admin workspace identifies `pbncleaner.fetch_pbnopen` as the shared Employee Data Source used across application features.
- Super Admin can replace the source with a column-validated CSV. The app records the last replacement time and the acting username/display name.
- A separate Super-Admin action synchronizes `pbncleaner.dt_employee` from the current `fetch_pbnopen` data. Existing `employee_id` values are preserved for matching NIPs, new employees are inserted, and employees no longer in the source are removed. Reference labels are mapped to their existing reference-table IDs, and the changes run transactionally.
- The duplicate Plt./Plh. management link was removed from the Admin page; the Plt./Plh. feature remains available through its application menu.

## Session expiry

- When an authenticated request reports an expired or invalid session, the app clears the local session and redirects the user to the login page with a session-expired notice.
- For a generic 403 response, the app checks `/auth/me` before ending the session. A valid user who lacks permission remains signed in.

## Cleaning modes

- **Sitasi Es.III (Lite)** was retired from the cleaning workflow. The standard **Sitasi Es.III** mode remains available.

## Implementation and verification

- Frontend implementation areas include `PerformanceAnalysisPage.tsx`, `PelantikanAgendaPage.tsx`, `AdminPage.tsx`, `AuthContext.tsx`, and `AppToolbar.tsx`.
- Backend implementation areas include the performance and Pelantikan services/APIs, employee-source synchronization, and authentication.
- Focused backend suites passed for the performance dashboard (23 tests), PBN Open import/synchronization (17 tests), authentication (10 tests), and the experimental Pelantikan workflow (88 tests). The frontend production build passed. Lint completed with existing warnings.
