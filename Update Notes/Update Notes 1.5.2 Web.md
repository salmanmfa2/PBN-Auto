# Update Notes: Web 1.5.2 (Planned)

This note describes the planned scope for Web 1.5.2. Web 1.5.1 remains finalized; the items below are not a claim that 1.5.2 has shipped.

## Legacy Database Upload

- Add a God User Legacy Database Upload workflow to the Admin page.
- Accept PBN Open CSV, XLSX, and XLS files together with a year and quarter.
- Validate the source schema, NIP values, and reference mappings before applying changes.
- Create or replace `fetch_pbnopen_q#_YYYY` and its matching `dt_employee_q#_YYYY` tables.
- Make created legacy employee tables available dynamically in Analisis Kinerja's employee-reference selector.
- Replace existing data for the same year and quarter only after confirmation.
- Map legacy source alias `II.B` to reference label `II.A` (`eselon_id = 2`) where the source data requires it.

## Analisis Kinerja module performance improvement

- Reduce period-switch latency by caching dashboard snapshots per period.
- Add revision-based invalidation so changing `Nilai Koreksi`, running batch corrections, undoing corrections, syncing EPRIDE, uploading or deleting a period refreshes only the affected period and dependent comparison periods.
- Keep other period snapshots reusable while the data is unchanged.
- Load the Daftar Pegawai and other inactive-tab data only when that tab is opened.
- Return Daftar Pegawai to on-demand loading and exclude employee-record responses from browser caching and adjacent-period preloading.
- Page, filter, search, and sort employee records in SQL so only the requested 50-row page is processed and returned.
- Show cached Dashboard data immediately during period changes and silently refresh it from the server.
- Preload adjacent periods only after the active period has loaded, if profiling confirms that the background work is safe.
- Do not clear all period caches when only one period or correction revision changes.
- Measure cold-period, warm-period, and cached-period switching times before claiming an improvement.

## Validation scope

- Preserve all existing Dashboard, employee-record, correction, export, and period-comparison behavior.
- Verify stale-cache prevention after manual correction, batch correction, undo, upload, delete, and EPRIDE synchronization.
- Confirm that period switching no longer refreshes inactive tabs.
- Report measured performance results only after baseline and post-change timing are available.

## UI Improvement
- Admin Page UI refinement
- Removing UI inconsistencies in `Analisis Kinerja` and `PBN Analytics`

