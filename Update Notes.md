# Update Notes: Web App to Desktop Sync Guide

This document records web-app changes that still need to be reviewed and ported to the separate desktop version. The web app is the reference implementation; the desktop version has **not** been updated by the changes described here.

## How to use this guide

1. Find the matching screen, API/service, template assets, and tests in the desktop project. File names may differ; search by the function names and behavior listed below rather than assuming the folder structure is identical.
2. Port one feature at a time, following the data flow from UI to export service and then through packaging/build configuration.
3. Keep the existing desktop behavior unless a change below explicitly replaces it. In particular, preserve single-file PowerPoint export while adding staging as an additional workflow.
4. Bring over or adapt the listed tests. Run the desktop project's focused tests and build/package checks after each feature.
5. Do not copy web-only React or FastAPI code verbatim into a desktop app. Recreate the same behavior using the desktop project's established UI, storage, and IPC/API patterns.

---

## 1. Remove Secure Link Building placeholder and center the landing page

### Product decision

Secure Link Building is no longer part of the planned app experience. The user decided not to build an in-app link shortener because established link-shortening services are more reliable. Do not recreate the placeholder or add a replacement link-building feature as part of this sync.

### Web changes already made

- Removed the **Secure Link Building / Coming soon** card from the landing page.
- Removed the `/menu-builder` route, `MenuBuilderPage.tsx` placeholder, and unused `logo_link.png` asset.
- The app's existing catch-all route redirects old `/menu-builder` URLs back to `/`.
- Updated the landing-page introduction and changed the feature grid from three columns to a centered, narrower two-column group for **PBN Analytics** and **Insight Hub**.
- Center-aligned the text inside both feature cards.
- Updated English/Indonesian README and developer documentation to remove Secure Link Building references and describe the remaining routes/features.
- The latest landing-page centering adjustment limits the feature area to a centered `max-w-2xl` grid, uses two equal columns at the `sm` breakpoint, and centers the text inside each card.

### Desktop sync guidance

If the desktop version has the same placeholder/menu, remove its visible menu option and any dedicated placeholder page/route or unused icon resource. Update its landing-page wording and layout to show the remaining features as a balanced, centered group. Do not remove any unrelated link-shortening tools or external links that may be used elsewhere; this change concerns only the in-app Secure Link Building placeholder/feature.

### Web reference files

- `frontend/src/pages/LandingPage.tsx` — two remaining feature cards, centered grid/text, updated introduction.
- `frontend/src/App.tsx` — application routes; no `/menu-builder` route.
- Removed `frontend/src/pages/MenuBuilderPage.tsx` and `frontend/src/assets/logo_link.png`.
- Updated `README.md`, `README.id.md`, `DEVELOPER.md`, `DEVELOPER.id.md`, and `frontend/README.md`.

---

## 2. Compact Analytics action bar

### Expected behavior

Keep the dataset action bar compact, especially at the bottom of the Analytics screen where multiple export actions and the Es.III template selector can otherwise take up too much horizontal space.

- Replace long visible action captions with a short label and recognizable icon: `CSV`, `Excel`, `PPTX`, and `Stage`. The optional dashboard shortcut is labeled `Insights`.
- Keep the full action description available on mouse hover and keyboard focus using a tooltip. Buttons must also have descriptive accessible names; icon SVGs are decorative to assistive technology.
- Use concise labels for the other long actions as well: `Use first row` for promoting the first row to column headers, and `Combine & Download` for combining staged presentations in queue order. Keep the complete explanation in a tooltip and accessible name; show a short `Combining…` progress label.
- Preserve the existing actions and behavior: CSV/Excel exports include active filters; PPTX export uses the selected Es.III template; staging generates and queues a filtered PPTX; Insights opens the current dataset dashboard.
- Keep the Es.III selector understandable but compact. Its choices identify the number of people per slide (`4-row · 4 people` and `3-row · 3 people`).
- Keep Reset visible and unchanged. Buttons must remain keyboard-operable, with disabled and progress states intact.

### Desktop sync guidance

Apply the same compact-label-plus-icon treatment to the desktop export toolbar. Provide a hover/focus hint or the desktop platform's equivalent, while preserving clear accessible names/tooltips so short labels are not ambiguous. Do not remove export actions or change their filtering/template behavior just to save space.

### Web reference

- `frontend/src/pages/AnalyticsPage.tsx` — `ActionTooltip` and the Analytics action bar markup.
- The app uses existing inline SVG icons and Tailwind utility classes; no new icon dependency was added.
- Verify at both narrow and wide window widths that actions wrap cleanly and tooltips are not clipped.

---

## 3. Sitasi Es.III and Es.IV PowerPoint column alignment

### Expected behavior

Center-align the following cells in every generated profile slide:

| Mode | Column names | Zero-based PowerPoint table column indexes |
|---|---|---|
| Sitasi Es.III | Usia (Th), Usia (Bl), Golongan, Lama Jab (Th), Lama Jab (Bl) | `2, 3, 4, 6, 7` |
| Sitasi Es.IV | Usia, Golongan, TMT Jabatan Lama | `2, 3, 5` |

The indexes refer to columns in the PowerPoint template table, not source spreadsheet column positions. Es.IV `Pertimbangan` is intentionally not included in its PowerPoint output.

### Implementation to port

- In the PowerPoint generator, associate the centered-column indexes with the relevant mode/template layout.
- Apply `PP_ALIGN.CENTER` to each cell in those columns on every generated slide. In the web implementation this is handled by `_center_table_columns` in `backend/app/services/powerpoint_service.py`.
- Keep other columns' existing alignment unchanged.

### Reference and tests

- Reference implementation: `backend/app/services/powerpoint_service.py` (`get_template_layout`, `_center_table_columns`, and the slide-generation loop).
- Tests: `backend/tests/test_sitasi_esiii_rule.py`, class `SitasiEsIVPowerPointLayoutTests` and the Sitasi Es.III generated-PowerPoint alignment test.
- Original focused validation passed 6 alignment-related tests.

---

## 4. Sitasi Es.III cleaning refinements and 3-row template option

### Cleaning behavior

During **Sitasi Es.III** cleaning only:

- Remove the exact text `Latar Belakang: -` from the `Keterangan` column.
- Remove the exact text `Ex Officio: -` from the `Jabatan Baru` column.

Preserve all other text and existing cleaning behavior. Verify how the desktop cleaner handles missing columns and whitespace before porting; do not broaden these exact replacements into unrelated cleanup rules.

### Template behavior

- Keep the existing `backend/templates/template.pptx` as the standard Sitasi Es.III template. It has **4 profile rows (4 people per slide)**.
- Add `backend/templates/template_3 Row.pptx` as an alternative. It has **3 profile rows (3 people per slide)**.
- Let the user choose the template when exporting **Sitasi Es.III**.
- The choice is manual per export. It is also used when adding an export to staging; changing the selection for a later export must not alter a presentation already generated and staged.
- Do not offer the 3-row option for Sitasi Es.III (Lite) or Sitasi Es.IV. Those continue using their existing templates.

### Implementation to port

1. Include `template_3 Row.pptx` in the desktop app's source assets and packaged/released application. Verify the packaged app can open it after installation, not only from a development checkout.
2. Add an Es.III-only template selector to the export UI. Default it to the existing standard template.
3. Pass the selected variant through the desktop UI to the PowerPoint generator. The web API represents the variants as `standard` and `three-row`; use equivalent typed values or enums if the desktop architecture differs.
4. Select the corresponding template before generating slides and compute the number of people per slide from the template's actual data rows where possible. Keep the header rows and field mapping correct for each template.
5. Ensure both direct download and staging use the same selected template.

### Reference and tests

- Cleaning implementation/tests: search the web backend cleaning code and `backend/tests/test_sitasi_esiii_rule.py` for the two exact replacement strings.
- Template selection and generation: `backend/app/services/powerpoint_service.py` (`get_template_layout`, `build_sitasi_profiles`) and `frontend/src/pages/AnalyticsPage.tsx` (the Es.III template selector).
- API parameter: `template_variant` on the PowerPoint export routes in `backend/app/api/dataset.py`.
- Frontend request/download helpers: `frontend/src/services/api.ts` (`SitasiEsIIITemplateVariant`, `generatePowerPoint`, `downloadPowerPoint`).
- Preserve/adapt tests that cover both template choices, slide row counts, and the cleaning replacements.

---

## 5. Sitasi PowerPoint staging and ordered merge (Es.III and Es.IV)

### User workflow and intended data flow

Staging stores **generated PowerPoint files**, not table rows or employee records:

1. Load and clean a dataset.
2. Apply a table filter (for example, filter Sitasi Es.III to Mutasi).
3. Choose the desired template for that export.
4. Click **Add filtered slides to staging**. Generate the PPTX immediately and keep that PPTX in the staging queue.
5. Change the filter and, if desired, the template; generate and stage another PPTX.
6. Reorder or remove staged presentations as needed.
7. Combine staged presentations into one downloadable PPTX. Their slides appear in staging order, and each keeps its own template/layout.

Staged files are held in browser memory for the current page session. They are lost when the page is reloaded or left. The app does not persist the staged employee/table data. Keep this session-only behavior unless a separate persistence feature is explicitly requested.

### Per-mode template rules

| Mode | Template choice | People per slide | Staging label |
|---|---|---:|---|
| Sitasi Es.III | User chooses standard or 3-row for each export | 4 or 3 | Show the selected 4-row or 3-row template |
| Sitasi Es.IV | Only the existing/default `template_es4.pptx`; no selector | 6 | Identify the default template as 6 people per slide |

Sitasi Es.III example: filter to Mutasi, choose the standard 4-people template, and stage it; then filter to Promosi, choose the 3-people template, and stage that. Combining both must retain the 4-row layout on the Mutasi slide(s) and the 3-row layout on the Promosi slide(s). Es.IV can also be staged and combined using its single default six-people template.

Sitasi Es.III (Lite) keeps its existing template behavior. Do not expose the Es.III template selector to Lite or Es.IV.

### UI behavior to preserve

- Staging is available for Sitasi Es.III, Sitasi Es.III (Lite), and Sitasi Es.IV profile exports.
- The standard single-presentation **Download Profiles PPTX** action remains available and continues to work independently of staging.
- Each staged entry should identify the mode, selected template where applicable, and active filter values (or say `No filters`).
- Allow moving an entry up/down, removing an entry, and clearing the queue.
- Disable conflicting actions while a PPTX is being generated or the queue is being combined; show errors instead of silently dropping a failed stage/combine.
- Combining requires at least two presentations. The web backend currently accepts at most 20 presentations, at most 25 MB per file, and 100 MB total. It validates `.pptx` filenames and presentation validity. If the desktop version uses different practical limits, preserve clear validation and user-facing errors, and keep the UI constraints in sync with its backend.

### Web implementation map (follow this order when porting)

1. **UI state and actions — `frontend/src/pages/AnalyticsPage.tsx`**
   - `StagedPowerPoint` stores an ID, a display label, and the generated PPTX `Blob`.
   - `handleStagePowerPoint` calls the generator with the active mode, sheet, current filters, and selected Es.III variant. It then appends the returned PPTX and a descriptive label to the queue.
   - Es.III staging labels distinguish `4-row template` from `3-row template`; Es.IV labels its default as `6 people per slide`.
   - `handleCombinePowerPoints` posts staged PPTX files in current queue order and downloads the returned merged file.
   - `moveStagedPowerPoint` and the staging panel implement reorder, remove, clear, progress, and error UI.
2. **Frontend export and upload — `frontend/src/services/api.ts`**
   - `generatePowerPoint` generates the filtered PPTX with the selected mode and template variant.
   - `combinePowerPoints` appends every staged PPTX to multipart form data as `files`, in order, and posts to `/export/powerpoint/merge`.
   - `downloadCombinedPowerPoint` downloads the response as `sitasi_profiles_combined.pptx`.
3. **Backend routes and validation — `backend/app/api/dataset.py`**
   - `POST /export/powerpoint/{dataset_id}` generates a filtered PPTX; its body contains filter selections and its query parameters include mode, sheet, and `template_variant`.
   - `POST /export/powerpoint/merge` accepts repeated multipart fields named `files`, reads and validates the uploads, calls the merge service, and returns a combined PPTX.
   - Route limits are defined by `MAX_STAGED_POWERPOINTS`, `MAX_STAGED_POWERPOINT_SIZE`, and `MAX_STAGED_POWERPOINT_TOTAL_SIZE`.
4. **PPTX generation and merging — `backend/app/services/powerpoint_service.py`**
   - `build_sitasi_profiles` filters the dataset and creates the PPTX before staging. Thus each stage is a self-contained export using the selected template.
   - `merge_sitasi_presentations` appends the source slides in input order. It retains each source slide's layout and related Open XML package parts under distinct package paths, remapping relationships and content-type entries rather than applying the first presentation's master/layout to every slide.
   - When adapting this logic, verify mixed-template merging specifically. A naive copy of slide XML alone may leave broken relationships or cause every slide to use the same master/layout.

### Reference tests and validation

- Staging/merge tests: `backend/tests/test_powerpoint_staging.py`.
  - Mixed standard Es.III, 3-row Es.III, and Es.IV presentations merge in input order.
  - The test verifies profile text, row counts/layout parts, invalid presentation rejection, and the upload route handler.
- Es.IV capacity/layout assertion: `backend/tests/test_sitasi_esiii_rule.py`, `SitasiEsIVPowerPointLayoutTests.test_layout_uses_esiv_template_and_6_data_rows`.
- Most recent web validation: all 35 backend tests passed and the frontend production build passed.
- A browser workflow check staged two Es.III generated PPTX files and submitted both in order to the merge request. The browser check used mocked HTTP responses; PPTX package merging itself is exercised by backend tests.

---

## Final desktop sync checklist

- [ ] Remove the Secure Link Building placeholder/menu, its route/page, and unused asset if present; center and rebalance the remaining landing-page cards.
- [ ] Compact the Analytics action bar with icons, short labels, and full hover/focus descriptions; retain accessible names and existing export/staging behavior.
- [ ] Port Es.III and Es.IV PowerPoint alignment; keep Es.IV `Pertimbangan` excluded.
- [ ] Port the two exact Sitasi Es.III text cleanups.
- [ ] Package `template_3 Row.pptx` and expose its manual choice for Sitasi Es.III only.
- [ ] Add staging for Es.III, Es.III (Lite), and Es.IV; show the correct template/filter in each entry.
- [ ] Verify Es.IV uses its single default template with **6 people per slide** and has no template selector.
- [ ] Preserve the generated PPTX itself as the staged item; do not substitute saved table data.
- [ ] Support queue ordering/removal/clear and ordered combine while retaining mixed slide layouts.
- [ ] Keep direct PPTX download working independently.
- [ ] Adapt/add focused tests and validate the installed/packaged desktop app, including mixed 4-row/3-row Es.III and Es.IV combinations.
