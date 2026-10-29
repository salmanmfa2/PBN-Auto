# Update Notes

## Sync PowerPoint alignment to the desktop app

The latest unsynced change is in `backend/app/services/powerpoint_service.py`:

- Sitasi Es.III centers **Usia (Th), Usia (Bl), Golongan, Lama Jab (Th), and Lama Jab (Bl)**.
- Sitasi Es.IV centers **Usia, Golongan, and TMT Jabatan Lama**.
- Column indexes are zero-based: Es.III `(2, 3, 4, 6, 7)`; Es.IV `(2, 3, 5)`.
- `_center_table_columns` applies center alignment to every cell in those columns on each generated slide.
- **Pertimbangan remains excluded** from the Es.IV PowerPoint output.

To sync, port the `PP_ALIGN` import, `centered_columns` layout values, and `_center_table_columns` call/helper from the web app's `powerpoint_service.py` into the desktop app's matching file. Port the two generated-PowerPoint alignment tests from `backend/tests/test_sitasi_esiii_rule.py` as well. Focused validation passed: 6 tests.

## Sitasi Es.III refinement

Implemented in the original web app; these changes still need to be ported to the desktop app:

- During Sitasi Es.III cleaning, remove the exact text `Latar Belakang: -` from the `Keterangan` column.
- During Sitasi Es.III cleaning, remove the exact text `Ex Officio: -` from the `Jabatan Baru` column.
- Add `backend/templates/template_3 Row.pptx` as an alternative PowerPoint template exclusively for **Sitasi Es.III**. Let the user choose between the existing `template.pptx` and the new three-row template when exporting Sitasi Es.III profiles. Keep the existing template available; do not offer the new template for Sitasi Es.III (Lite) or Sitasi Es.IV.

When syncing, include the template file in the desktop app's packaged templates, wire the Es.III-only selection through the export UI/API/service, and preserve the tests for both template choices and the two text replacements. The focused web-app tests passed.
