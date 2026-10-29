import asyncio
import unittest
from io import BytesIO

import pandas as pd
from pptx import Presentation
from starlette.datastructures import UploadFile

from app.api.dataset import merge_sitasi_profiles
from app.services import powerpoint_service
from app.storage.dataset_store import DatasetStore


class PowerPointStagingTests(unittest.TestCase):
    def _create_presentation(
        self,
        mode: str,
        name: str,
        template_variant: str = "standard",
    ) -> bytes:
        if mode == "Sitasi Es.IV":
            record = {
                "No": "1",
                "Nama/NIP": name,
                "Usia": "42",
                "Golongan": "IV/a",
                "Jabatan Saat Ini": "Role A",
                "TMT Jabatan Lama": "2020",
                "Jabatan Baru": "Role B",
                "Tour of Area": "Area A",
            }
        else:
            record = {
                "No": "1",
                "Nama/NIP": name,
                "Usia (Th)": "42",
                "Usia (Bl)": "3",
                "Golongan": "IV/a",
                "Jabatan Saat Ini": "Role A",
                "Lama Jab (Th)": "2",
                "Lama Jab (Bl)": "4",
                "Jabatan Baru": "Role B",
                "Keterangan": "Mutasi",
            }

        dataset_id = DatasetStore.save({"Data": pd.DataFrame([record])})
        try:
            return powerpoint_service.build_sitasi_profiles(
                dataset_id,
                "Data",
                mode,
                template_variant=template_variant,
            )
        finally:
            DatasetStore.delete(dataset_id)

    def test_merge_preserves_stage_order_and_each_template_layout(self) -> None:
        standard = self._create_presentation("Sitasi Es.III", "Standard Person")
        three_row = self._create_presentation(
            "Sitasi Es.III",
            "Three Row Person",
            template_variant="three-row",
        )
        esiv = self._create_presentation("Sitasi Es.IV", "EsIV Person")

        merged = powerpoint_service.merge_sitasi_presentations(
            [standard, three_row, esiv]
        )
        presentation = Presentation(BytesIO(merged))

        self.assertEqual(len(presentation.slides), 3)
        expected_names = ["Standard Person", "Three Row Person", "EsIV Person"]
        expected_rows = [7, 6, 7]
        layout_parts = []
        for slide, expected_name, expected_row_count in zip(
            presentation.slides,
            expected_names,
            expected_rows,
        ):
            table = powerpoint_service._get_profile_table(slide)
            self.assertEqual(len(table.rows), expected_row_count)
            self.assertIn(
                expected_name,
                [cell.text for row in table.rows for cell in row.cells],
            )
            layout_parts.append(str(slide.slide_layout.part.partname))

        self.assertEqual(len(set(layout_parts)), 3)

    def test_merge_requires_at_least_two_presentations(self) -> None:
        with self.assertRaisesRegex(ValueError, "at least two"):
            powerpoint_service.merge_sitasi_presentations([b"not a powerpoint"])

    def test_merge_rejects_invalid_presentation_files(self) -> None:
        with self.assertRaisesRegex(ValueError, "not a valid PowerPoint"):
            powerpoint_service.merge_sitasi_presentations(
                [b"invalid", b"also invalid"]
            )

    def test_merge_endpoint_accepts_staged_powerpoints_and_returns_combined_deck(self) -> None:
        first = self._create_presentation("Sitasi Es.III", "First Staged Person")
        second = self._create_presentation(
            "Sitasi Es.III",
            "Second Staged Person",
            template_variant="three-row",
        )
        uploaded_files = [
            UploadFile(filename="first.pptx", file=BytesIO(first)),
            UploadFile(filename="second.pptx", file=BytesIO(second)),
        ]
        response = asyncio.run(merge_sitasi_profiles(uploaded_files))
        merged = Presentation(BytesIO(response.body))
        self.assertEqual(len(merged.slides), 2)
        self.assertIn(
            "First Staged Person",
            [cell.text for row in powerpoint_service._get_profile_table(merged.slides[0]).rows for cell in row.cells],
        )
        self.assertIn(
            "Second Staged Person",
            [cell.text for row in powerpoint_service._get_profile_table(merged.slides[1]).rows for cell in row.cells],
        )


if __name__ == "__main__":
    unittest.main()
