# Planned Updates

**Status:** Web 1.2 account/admin and user-preference workflows implemented; placeholder-menu workflows and data-source import remain deferred
**Last discussed:** 5 November 2026

## Release scope

- Current web release notes: [Update Notes 1.2 Web](./Update%20Notes%201.2%20Web.md).
- Desktop requirements are tracked separately in [Update Notes 1.2 Desktop](./Update%20Notes%201.2%20Desktop.md). Desktop main navigation remains limited to PBN Analytics and Insight Hub and has no login system.
- The Generate ND Undangan Pelantikan and Analisis Kinerja DJPb menus remain web-only placeholders. Making these workflows functional is the planned version 2.0 product milestone.

## Manajemen Plt./Plh.

This is a web-only work area separate from PBN Cleaner dataset cleaning, but accessible from the same home menu. Integration into the desktop version is not planned.

### Monitoring and UI implemented

- Monitoring rows and Excel exports use contiguous row numbers (1–N); database primary keys remain internal for record actions.
- Records can be added, edited, deactivated/reactivated, and deleted. Mutations require an Admin or Super Admin account.
- Masa Kerja is calculated from TMT to today as completed years and remaining months (`Y M`).
- Status is derived from completed months: Aktif before 5 months; Mendekati 6 Bulan at 5 to under 6 months; Lebih dari 6 Bulan at 6 months or more; manually deactivated records show Inaktif.
- The home menu displays a notification button when any active record is Mendekati 6 Bulan or Lebih dari 6 Bulan. The module page also lists those records for attention.
- Export downloads all monitoring rows as an Excel workbook without app-side filters.
- The home menu uses compact icon-and-text rows for PBN Analytics, Insight Hub, and Manajemen Plt./Plh.
- `backend/sql/002_create_plt_plh_monitoring.sql` defines the tables and database views. The schema was applied to the configured `pbncleaner` MySQL-compatible database.

### Account and admin workflow implemented (web only)

- Roles are Guest, User (level 1), Admin (level 2), and Super Admin (level 3). Registration is public and immediately creates a level-1 account; no approval step is used.
- Guest and User can use the normal dataset-cleaning workflows and view Plt./Plh. records. Only Admin and Super Admin can mutate shared Plt./Plh. records. Admin workspace access requires an Admin or Super Admin account; only Super Admin can create, edit, or delete accounts.
- The first Super Admin must be inserted manually using the example in `backend/sql/003_create_users_and_sessions.sql`; no default account or password is seeded. The schema includes `users` and `user_sessions` and uses the existing configured MySQL-compatible database.
- Account passwords are intentionally plaintext in the database for this functional prototype. Do not treat this implementation as production-secure; hashing and broader security hardening remain future work.
- The account and admin workflow is for the web app only; no desktop integration is planned.
- Toolbar theme selection (Default, Dark, Light) is implemented. Authenticated users' selection is persisted per account in `user_preferences`; Guest selection is local to the browser.

### Deferred

- The prepared `backend/data-source/data_source.csv` is a large employee dataset for Insight Hub, not Plt./Plh. monitoring. Its column names match the Insight Hub fields. Import/upload and dataset-refresh behavior remain deferred and need separate requirements; do not attach this dataset to the monitoring records.
- Word document generation will be planned after the monitoring workflow; the user will provide approved `.docx` templates.
- Continue security hardening later, including password hashing and broader access-control review.
- Confirm the exact meaning/boundary of “Lebih dari 6 Bulan” for a record at exactly 6 completed months; current behavior starts that status at 6 months.
- Discuss any changes to columns, record history/retention, or export formatting after using the initial table.
