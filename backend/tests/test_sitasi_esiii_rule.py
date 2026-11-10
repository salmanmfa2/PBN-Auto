import unittest
from io import BytesIO

import pandas as pd
from pptx import Presentation
from pptx.enum.text import PP_ALIGN

from app.cleaners import get_rules_for_mode
from app.services import powerpoint_service
from app.storage.dataset_store import DatasetStore


class SitasiEsIIIAlphaRuleTests(unittest.TestCase):
    def test_sitasi_esiii_rule_uses_jpm_dot_condition(self) -> None:
        rules = get_rules_for_mode("Sitasi Es.III")
        self.assertIsNotNone(rules)
        self.assertEqual(rules.get("delete_rows_null_columns", []), [2])
        self.assertNotIn("delete_rows_contains", rules)

    def test_sitasi_esiii_lite_is_not_registered(self) -> None:
        self.assertIsNone(get_rules_for_mode("Sitasi Es.III (Lite)"))


class SitasiEsIIIPowerPointLayoutTests(unittest.TestCase):
    def test_sitasi_esiii_lite_has_no_powerpoint_layout(self) -> None:
        with self.assertRaisesRegex(ValueError, "not available"):
            powerpoint_service.get_template_layout("Sitasi Es.III (Lite)")

    def test_standard_esiii_can_choose_three_row_template(self) -> None:
        layout = powerpoint_service.get_template_layout(
            "Sitasi Es.III",
            template_variant="three-row",
        )

        self.assertEqual(layout["template_path"].name, "template_3 Row.pptx")
        self.assertEqual(layout["header_rows"], 3)
        self.assertEqual(len(layout["column_aliases"]), 10)

    def test_three_row_template_is_restricted_to_standard_esiii(self) -> None:
        for mode in ("Sitasi Es.IV",):
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                powerpoint_service.get_template_layout(mode, template_variant="three-row")

    def test_three_row_template_generates_three_person_slides(self) -> None:
        records = [
            {
                "No": str(index),
                "Nama/NIP": f"Staff {index}",
                "Usia (Th)": "42",
                "Usia (Bl)": "3",
                "Golongan": "IV/a",
                "Jabatan Saat Ini": "Role A",
                "Lama Jab (Th)": "2",
                "Lama Jab (Bl)": "4",
                "Jabatan Baru": "Role B",
                "Keterangan": "Mutasi",
            }
            for index in range(1, 5)
        ]
        dataset_id = DatasetStore.save({"Data": pd.DataFrame(records)})
        try:
            output = powerpoint_service.build_sitasi_profiles(
                dataset_id,
                "Data",
                "Sitasi Es.III",
                template_variant="three-row",
            )
        finally:
            DatasetStore.delete(dataset_id)

        presentation = Presentation(BytesIO(output))
        self.assertEqual(len(presentation.slides), 2)
        table = powerpoint_service._get_profile_table(presentation.slides[0])
        for column_index in (2, 3, 4, 6, 7):
            for row in table.rows:
                self.assertEqual(
                    row.cells[column_index].text_frame.paragraphs[0].alignment,
                    PP_ALIGN.CENTER,
                )

    def test_requested_esiii_columns_are_centered_in_generated_powerpoint(self) -> None:
        dataset_id = DatasetStore.save(
            {
                "Data": pd.DataFrame(
                    [
                        {
                            "No": "1",
                            "Nama/NIP": "Staff A",
                            "Usia (Th)": "42",
                            "Usia (Bl)": "3",
                            "Golongan": "IV/a",
                            "Jabatan Saat Ini": "Role A",
                            "Lama Jab (Th)": "2",
                            "Lama Jab (Bl)": "4",
                            "Jabatan Baru": "Role B",
                            "Keterangan": "Mutasi",
                        }
                    ]
                )
            }
        )
        try:
            output = powerpoint_service.build_sitasi_profiles(
                dataset_id,
                "Data",
                "Sitasi Es.III",
            )
        finally:
            DatasetStore.delete(dataset_id)

        table = powerpoint_service._get_profile_table(
            Presentation(BytesIO(output)).slides[0]
        )
        for column_index in (2, 3, 4, 6, 7):
            for row in table.rows:
                self.assertEqual(
                    row.cells[column_index].text_frame.paragraphs[0].alignment,
                    PP_ALIGN.CENTER,
                )


class SitasiEsIVPowerPointLayoutTests(unittest.TestCase):
    def test_layout_uses_esiv_template_and_6_data_rows(self) -> None:
        layout = powerpoint_service.get_template_layout("Sitasi Es.IV")
        self.assertEqual(layout["template_path"].name, "template_es4.pptx")
        self.assertEqual(layout["header_rows"], 1)
        self.assertEqual(len(layout["column_aliases"]), 8)
        self.assertEqual(layout["people_per_slide"], 6)

    def test_requested_esiv_columns_are_centered_in_generated_powerpoint(self) -> None:
        dataset_id = DatasetStore.save(
            {
                "Data": pd.DataFrame(
                    [
                        {
                            "No": "1",
                            "Nama/NIP": "Staff A",
                            "Usia": "42",
                            "Golongan": "IV/a",
                            "Jabatan Saat Ini": "Role A",
                            "TMT Jabatan Lama": "2020",
                            "Jabatan Baru": "Role B",
                            "Tour of Area": "Area A",
                        }
                    ]
                )
            }
        )
        try:
            output = powerpoint_service.build_sitasi_profiles(
                dataset_id,
                "Data",
                "Sitasi Es.IV",
            )
        finally:
            DatasetStore.delete(dataset_id)

        table = powerpoint_service._get_profile_table(
            Presentation(BytesIO(output)).slides[0]
        )
        for column_index in (2, 3, 5):
            for row in table.rows:
                self.assertEqual(
                    row.cells[column_index].text_frame.paragraphs[0].alignment,
                    PP_ALIGN.CENTER,
                )


if __name__ == "__main__":
    unittest.main()
