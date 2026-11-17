# Analisis Kinerja — Implementation Plan

## Agreed workflow

- Store the performance data in MySQL.
- Keep one active dataset. Before a full upload, select its period in the app (for example, `Q3-2026`); save that period with the active dataset. A validated full upload replaces the active dataset. The first version does not retain or compare previous quarters.
- Accept 16- or 18-digit NIPs and trim surrounding whitespace before matching. Use current employee data for Unit Eselon II and Eselon grouping when available. Keep unmatched NIPs in the dataset and assign both grouping fields the value `Unidentified`.
- Treat the example as a semicolon-delimited CSV. Accept either comma or period as the decimal separator; there are no thousands separators.
- Anyone, including Guest users, can view the analysis and extracted-data table; only Super Admins can upload or adjust data.
- Validate all rows before changing MySQL. Reject duplicate NIPs and report unknown NIPs; a failed validation must not partially change either dataset.

## Full-data upload and calculations

- Validate source scores (NHK, NPK, calibration scores, and NKO) within `0–120`.
- Validate Nilai Koreksi within `-20–20`; penalty magnitudes have no arbitrary maximum. Normalize positive Hukdis and both Dampak values to negative deductions, and report how many values were normalized.
- Preserve `NKP Awal` and `NKP Akhir` as supplied by the validated full-data source; the source values are the baseline for analysis.
- Recalculate `NKP Akhir` from the preserved `NKP Awal` and `NKO` only when a validated adjustment upload is applied.
- Do not change NKO when adjustment values are uploaded.
- Calculate the adjusted base as `NKP Awal - abs(Nilai Hukuman Disiplin) - abs(Nilai Dampak Pelanggaran Disiplin) + Nilai Koreksi`; penalty deductions reduce the score regardless of their stored/input sign.
- If the adjusted base is greater than NKO, calculate `NKP Akhir = 0.70 × adjusted base + 0.30 × NKO`; otherwise calculate `NKP Akhir = 0.90 × adjusted base + 0.10 × NKO`.
- The adjustments apply to NKP Akhir, not to the imported NKP Awal. Nilai Dampak Perilaku is stored and adjustable but is not included in the NKP Akhir formula.
- Keep full precision in calculations; round to two decimal places for display/export.
- Preserve `Rating Hasil Kerja`, `Rating Perilaku Kerja`, and `Predikat Kinerja` from the full upload. Calculate a separate `Status` from NKP Akhir:
  - `>=115`: Sangat Istimewa
  - `110–<115`: Istimewa
  - `100–<110`: Tinggi
  - `90–<100`: Sedang
  - `<90`: Rendah
  - Missing NKP Akhir: Tidak tersedia
- Computed NKP Akhir may fall outside `0–120` after adjustments; do not clamp it. Apply the lowest/highest status band accordingly.
- Reject NPK values outside `0–120`; do not clamp them. The NPK histogram shows bins of width 2 from `80` to `120`, with `120` included in the final bin; values below `80` are omitted from the chart.

## Adjustment upload

- Provide a downloadable Excel template containing NIP, Nilai Hukuman Disiplin, Nilai Dampak Pelanggaran Disiplin, Nilai Dampak Perilaku, and Nilai Koreksi. Store NIP as text to prevent spreadsheet precision loss.
- Select/confirm the target period in the app; it must match the active dataset period.
- Blank adjustment cells preserve their existing values.
- Positive Hukdis and Dampak entries in adjustment files are normalized to negative values and reported during validation.
- Reject duplicate NIPs and report unknown NIPs. If validation finds either, make no changes.
- Recalculate NKP Akhir and Status after applying valid adjustments; leave NKO and NKP Awal unchanged.

## Analysis

- Show an NPK histogram with 2-point bins from 80 to 120 and groupable counts/statistics.
- Count nonzero entries for Hukdis and each Dampak field; values are negative when applied.
- Present the dashboard in three tabs: overview, Unit Eselon II analysis, and the extracted employee list.
- On the overview, filter by Unit Eselon II and Eselon (with an all option); show KPI cards, NPK histogram, NKP Akhir status distribution, and Hukdis/Dampak counts.
- Provide Eselon as a single-select dropdown with a `Semua Eselon` option. Cache dashboard grouping/filter results and invalidate the cache after performance data changes or employee-source synchronization.
- Allow Unit Eselon II rows to expand into Unit Eselon III and compare average NPK, NHK, NKP Awal/Akhir, initial/final Sangat Istimewa counts and percentages, penalty counts, and correction statistics.
- Show Gap Status as the difference between the Unit's NKP Akhir Sangat Istimewa count and NKP Perhitungan Sangat Istimewa count, for Unit Eselon II and its expanded summaries. Use green for positive values, the default text color for zero, and red for negative values.
- Count Nilai Koreksi entries only when the value is nonzero, and separate positive Penambahan from negative Pengurangan. For `-1, -2, 3, 0, 0, 0.23, 2, 1`, the count is 6: 2 Pengurangan and 4 Penambahan. Keep the existing average, minimum, and maximum calculations over nonblank values.
- Let Admin and Super Admin edit one shared Insight Text; Guest and User can read it.
- Provide a searchable, paginated table of extracted employee rows alongside analytics, including the imported fields, group values, and derived status.
- Support per-column table filtering and sorting across the full dataset, with text in A–Z/Z–A order and numeric values in ascending/descending order. Keep the current viewport stable while filters refresh.
- Provide Excel downloads for Unit Eselon II analysis (including Unit Eselon III detail rows) and employee records. The employee export includes all rows matching the current search, not only the current page.
