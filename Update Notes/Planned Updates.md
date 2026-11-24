# Planned Updates

## Pointer and Breakthrough

- Pointer: preserve important discussion checkpoints without turning them into implementation decisions until evidence is available.
- Breakthrough: refine each feature incrementally from real data and adjust translations/content one area at a time.

## Planned 1.5.0 — Analisis Mutasi/Promosi

- Add a new menu: **Analisis Mutasi/Promosi**.
- Planned flow: passcode verification -> choose Eselon III or IV -> create a workspace draft -> upload CSV/Excel -> run cleaning -> review raw and cleaned preview -> approve -> database lookup -> analytics.
- The menu passcode is shared, managed by the God User, and requested once per menu visit. Workspace drafts are planned to be database-persisted.
- Step 2 uses a workspace list for the chosen Eselon. Users can add multiple workspaces with a title and description; creation date is stored automatically.
- Upload is the primary source of truth. The database is used for lookups and enrichment, primarily by NIP.
- Use separate cleaning logic for Es.III and Es.IV, selected by the chosen Eselon level. Keep this separate from PBN Analytics even if shared low-level utilities become useful later.
- Reuse the existing Sitasi cleaned structure as a starting point, with movement fields added over time.
- Uploaded values remain authoritative. Unmatched lookup records are kept and marked as unmatched.
- Keep header mapping and configuration low-key; fixed cleaning behavior is preferred initially.
- Movement classification and unit translation/mapping will be adjusted after real uploaded data is available.
- A first usable analytics set may include movement counts, Mutasi/Promosi breakdown, unit distribution, age/tenure, education/religion, gender, and geographic/unit transfer.
- Step 3 initially shows a larger workspace area. Raw and cleaned previews open in a popup.
- Step 3 performs an experimental NIP lookup through `pbncleaner.dt_employee`; NIPs are taken from the last 18 characters of the cleaned `Nama/NIP` cell.
- Final schemas, keywords, before/after fields, translations, and analytics details remain provisional and should be defined step by step.

## Planned — Analisis Kinerja by Jabatan

- Status: deferred; do not expose this tab or run its data lookup, snapshot, aggregation, or export paths in the active app until the requirements and database mapping are clarified.
- Intended outcome: add a Jabatan tab to Analisis Kinerja, showing the Unit Eselon II metrics grouped by `ref_unit_kerja.tipe`, plus maximum NKP Akhir for each `dt_employee.Jabatan`.
- The parked UI is in `frontend/src/pages/PlannedPerformanceJabatan.tsx` and is intentionally not imported by the active app.
- Resync finding: the supplied `fetch_pbnopen` file has 6,057 data rows; 1,595 `Unit Kerja` rows use 34 long-form Kanwil labels. Each label maps one-to-one to an existing `ref_unit_kerja` row (`Kanwil DJPb Prov. ...`, `tipe='Kanwil'`), so preserve those reference IDs instead of adding duplicate rows. The sync path now resolves this verified alias.
- The live `ref_unit_kerja` schema includes `unit_kerja_id`, `value`, `tipe`, `city`, `prov`, and `zona`. Before reactivating the analytics, still confirm the authoritative employee-to-unit/type relationship and intended historical-period behavior; do not infer Jabatan grouping rules from the sync error.
- Reactivation gate: verify the live `dt_employee` columns and authoritative join to `ref_unit_kerja.tipe`, clarify missing/unmatched-value and historical-period behavior, then redesign the database/API, reconnect the parked UI, and add focused tests.