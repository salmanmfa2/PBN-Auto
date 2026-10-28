# Update Notes

## Sync PowerPoint alignment to the desktop app

The latest unsynced change is in `backend/app/services/powerpoint_service.py`:

- Sitasi Es.III centers **Usia (Th), Usia (Bl), Golongan, Lama Jab (Th), and Lama Jab (Bl)**.
- Sitasi Es.IV centers **Usia, Golongan, and TMT Jabatan Lama**.
- Column indexes are zero-based: Es.III `(2, 3, 4, 6, 7)`; Es.IV `(2, 3, 5)`.
- `_center_table_columns` applies center alignment to every cell in those columns on each generated slide.
- **Pertimbangan remains excluded** from the Es.IV PowerPoint output.

To sync, port the `PP_ALIGN` import, `centered_columns` layout values, and `_center_table_columns` call/helper from the web app's `powerpoint_service.py` into the desktop app's matching file. Port the two generated-PowerPoint alignment tests from `backend/tests/test_sitasi_esiii_rule.py` as well. Focused validation passed: 6 tests.
