# Planned Updates

## Pointer and Breakthrough

- Pointer: preserve important discussion checkpoints without turning them into implementation decisions until evidence is available.
- Breakthrough: refine each feature incrementally from real data and adjust translations/content one area at a time.

## Analisis Mutasi/Promosi

- Implemented incrementally as an experimental module for Web 1.5.0. Current workflow, Administrator/Pengawas-specific category mappings, persisted workspaces, and Talent Finder behavior are documented in [Update Notes: Web 1.5.0](./Update%20Notes%201.5.0%20Web.md).
- Overview and Daftar Pegawai analytics remain out of scope until their content and output columns are defined.

## Planned — Analisis Kinerja by Jabatan

- Status: deferred; do not expose this tab or run its data lookup, snapshot, aggregation, or export paths in the active app until the requirements and database mapping are clarified.
- Intended outcome: add a Jabatan tab to Analisis Kinerja, showing the Unit Eselon II metrics grouped by `ref_unit_kerja.tipe`, plus maximum NKP Akhir for each `dt_employee.Jabatan`.
- The parked UI is in `frontend/src/pages/PlannedPerformanceJabatan.tsx` and is intentionally not imported by the active app.
- Resync finding: the supplied `fetch_pbnopen` file has 6,057 data rows; 1,595 `Unit Kerja` rows use 34 long-form Kanwil labels. Each label maps one-to-one to an existing `ref_unit_kerja` row (`Kanwil DJPb Prov. ...`, `tipe='Kanwil'`), so preserve those reference IDs instead of adding duplicate rows. The sync path now resolves this verified alias.
- The live `ref_unit_kerja` schema includes `unit_kerja_id`, `value`, `tipe`, `city`, `prov`, and `zona`. Before reactivating the analytics, still confirm the authoritative employee-to-unit/type relationship and intended historical-period behavior; do not infer Jabatan grouping rules from the sync error.
- Reactivation gate: verify the live `dt_employee` columns and authoritative join to `ref_unit_kerja.tipe`, clarify missing/unmatched-value and historical-period behavior, then redesign the database/API, reconnect the parked UI, and add focused tests.