# Planned Updates

**Status:** Manajemen Plt./Plh. monitoring table implemented; Word-template generation and admin workflow deferred
**Last discussed:** 4 November 2026

## Manajemen Plt./Plh.

This is a work area separate from PBN Cleaner dataset cleaning, but accessible from the same home menu. The current focus is the assignment monitoring table.

### Implemented

- Monitoring rows and Excel exports use contiguous row numbers (1–N); database primary keys remain internal for record actions.
- Records can be added, edited, deactivated/reactivated, and deleted. Add/edit/deactivate/delete require the shared password; the password is stored as plain text in MySQL and can be changed directly in the database.
- Masa Kerja is calculated from TMT to today as completed years and remaining months (`Y M`).
- Status is derived from completed months: Aktif before 5 months; Mendekati 6 Bulan at 5 to under 6 months; Lebih dari 6 Bulan at 6 months or more; manually deactivated records show Inaktif.
- The home menu displays a notification button when any active record is Mendekati 6 Bulan or Lebih dari 6 Bulan. The module page also lists those records for attention.
- Export downloads all monitoring rows as an Excel workbook without app-side filters.
- The home menu uses compact icon-and-text rows for PBN Analytics, Insight Hub, and Manajemen Plt./Plh.
- `backend/sql/002_create_plt_plh_monitoring.sql` defines the tables and database views. The schema was applied to the configured `pbncleaner` MySQL-compatible database.

### Deferred

- Word document generation will be planned after the table workflow; the user will provide approved `.docx` templates.
- Individual accounts, an admin workspace, and security hardening are deferred. The module currently has no user accounts; all visitors can view records. The shared edit password only gates changes and does not provide data privacy.

### Follow-up discussion

- Confirm the exact meaning/boundary of “Lebih dari 6 Bulan” for a record at exactly 6 completed months; current behavior starts that status at 6 months.
- Discuss any changes to columns, record history/retention, or export formatting after using the initial table.
- Later, identify the formal Word documents to generate and provide approved `.docx` examples.
