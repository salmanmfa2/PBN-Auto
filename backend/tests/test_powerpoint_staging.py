import asyncio
import unittest
from io import BytesIO
from zipfile import ZipFile

import pandas as pd
from pptx import Presentation
from starlette.datastructures import UploadFile
from fastapi.testclient import TestClient

from app.api.dataset import merge_sitasi_profiles
from app.services import powerpoint_service
from app.storage.dataset_store import DatasetStore
from main import app


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

    def test_baperjakat_builds_both_categories_from_one_combined_template(self) -> None:
        records = []
        for category, count in (("Mutasi", 5), ("Promosi", 4), ("Other", 1)):
            for index in range(1, count + 1):
                records.append({
                    "No": str(index),
                    "Nama/NIP": f"{category} Person {index}",
                    "Usia (Th)": "42",
                    "Usia (Bl)": "3",
                    "Golongan": "IV/a",
                    "Jabatan Saat Ini": "Role A",
                    "Lama Jab (Th)": "2",
                    "Lama Jab (Bl)": "4",
                    "Jabatan Baru": "Role B",
                    "Keterangan": category,
                    "Kategori": category,
                    "Unit": "Allowed",
                })

        dataset_id = DatasetStore.save({"Data": pd.DataFrame(records)})
        try:
            result = powerpoint_service.build_baperjakat_profiles(
                dataset_id,
                "Data",
                {"Kategori": ["Mutasi"], "Unit": ["Allowed"]},
            )
        finally:
            DatasetStore.delete(dataset_id)

        with ZipFile(BytesIO(result)) as archive:
            self.assertIsNone(archive.testzip())
            master_parts = [
                name for name in archive.namelist()
                if name.startswith("ppt/slideMasters/slideMaster") and name.endswith(".xml")
            ]
            self.assertEqual(len(master_parts), 1)

        presentation = Presentation(BytesIO(result))
        self.assertEqual(len(presentation.slides), 4)
        expected = [
            ("Mutasi Person 1", 7),
            ("Mutasi Person 5", 7),
            ("Promosi Person 1", 6),
            ("Promosi Person 4", 6),
        ]
        for slide, (person_name, expected_rows) in zip(presentation.slides, expected):
            table = powerpoint_service._get_profile_table(slide)
            self.assertEqual(len(table.rows), expected_rows)
            self.assertIn(
                person_name,
                [cell.text for row in table.rows for cell in row.cells],
            )
            self.assertNotIn(
                "Other Person 1",
                [cell.text for row in table.rows for cell in row.cells],
            )
        self.assertEqual(
            [
                next(shape.text.strip() for shape in slide.shapes
                     if shape.has_text_frame and shape.text.strip().isdigit())
                for slide in presentation.slides
            ],
            ["1", "2", "1", "2"],
        )

        self.assertEqual(
            len({str(slide.slide_layout.part.partname) for slide in presentation.slides}),
            2,
        )

    def test_baperjakat_requires_both_categories(self) -> None:
        dataset_id = DatasetStore.save({
            "Data": pd.DataFrame([{
                "No": "1",
                "Nama/NIP": "Mutasi Person",
                "Usia (Th)": "42",
                "Usia (Bl)": "3",
                "Golongan": "IV/a",
                "Jabatan Saat Ini": "Role A",
                "Lama Jab (Th)": "2",
                "Lama Jab (Bl)": "4",
                "Jabatan Baru": "Role B",
                "Keterangan": "Mutasi",
                "Kategori": "Mutasi",
            }])
        })
        try:
            with self.assertRaisesRegex(ValueError, "No Promosi records"):
                powerpoint_service.build_baperjakat_profiles(dataset_id, "Data")
        finally:
            DatasetStore.delete(dataset_id)

    def test_baperjakat_renumbers_each_category_and_preserves_promosi_pendamping(self) -> None:
        records = []
        rows = [
            ("Mutasi", "M1", "99"),
            ("Promosi", "P1", "20"),
            ("Promosi", "Pendamping 1", "Pendamping I"),
            ("Mutasi", "M2", "7"),
            ("Promosi", "P2", "4"),
            ("Promosi", "Pendamping 2", "Pendamping II"),
            ("Mutasi", "M3", "100"),
            ("Promosi", "P3", "1"),
        ]
        for category, name, number in rows:
            records.append({
                "No": number,
                "Nama/NIP": name,
                "Usia (Th)": "42",
                "Usia (Bl)": "3",
                "Golongan": "IV/a",
                "Jabatan Saat Ini": "Role A",
                "Lama Jab (Th)": "2",
                "Lama Jab (Bl)": "4",
                "Jabatan Baru": "Role B",
                "Keterangan": category,
                "Kategori": category,
            })

        dataset_id = DatasetStore.save({"Data": pd.DataFrame(records)})
        try:
            result = powerpoint_service.build_baperjakat_profiles(dataset_id, "Data")
        finally:
            DatasetStore.delete(dataset_id)

        presentation = Presentation(BytesIO(result))
        self.assertEqual(len(presentation.slides), 3)
        mutasi_table = powerpoint_service._get_profile_table(presentation.slides[0])
        mutasi_no = [
            row.cells[0].text
            for row in list(mutasi_table.rows)[3:]
        ]
        promosi_no = [
            [
                row.cells[0].text
                for row in list(powerpoint_service._get_profile_table(slide).rows)[3:]
            ]
            for slide in list(presentation.slides)[1:]
        ]
        self.assertEqual(mutasi_no, ["1", "2", "3", ""])
        self.assertEqual(promosi_no, [["1", "Pendamping I", "2"], ["Pendamping II", "3", ""]])
        first_promosi_table = powerpoint_service._get_profile_table(presentation.slides[1])
        second_promosi_table = powerpoint_service._get_profile_table(presentation.slides[2])
        self.assertEqual(first_promosi_table.cell(4, 0)._tc.tcPr.get("vert"), "vert270")
        self.assertEqual(first_promosi_table.cell(3, 0)._tc.tcPr.get("vert"), None)
        self.assertEqual(first_promosi_table.cell(4, 1)._tc.tcPr.get("vert"), None)
        self.assertEqual(second_promosi_table.cell(3, 0)._tc.tcPr.get("vert"), "vert270")
        self.assertEqual(second_promosi_table.cell(4, 0)._tc.tcPr.get("vert"), None)

    def test_baperjakat_endpoint_returns_one_combined_presentation(self) -> None:
        dataset_id = DatasetStore.save({
            "Data": pd.DataFrame([
                {
                    "No": "1",
                    "Nama/NIP": "Mutasi Person",
                    "Usia (Th)": "42",
                    "Usia (Bl)": "3",
                    "Golongan": "IV/a",
                    "Jabatan Saat Ini": "Role A",
                    "Lama Jab (Th)": "2",
                    "Lama Jab (Bl)": "4",
                    "Jabatan Baru": "Role B",
                    "Keterangan": "Mutasi",
                    "Kategori": "Mutasi",
                },
                {
                    "No": "2",
                    "Nama/NIP": "Promosi Person",
                    "Usia (Th)": "38",
                    "Usia (Bl)": "2",
                    "Golongan": "III/d",
                    "Jabatan Saat Ini": "Role C",
                    "Lama Jab (Th)": "1",
                    "Lama Jab (Bl)": "6",
                    "Jabatan Baru": "Role D",
                    "Keterangan": "Promosi",
                    "Kategori": "Promosi",
                },
            ])
        })
        try:
            response = TestClient(app).post(
                f"/export/powerpoint/baperjakat/{dataset_id}?sheet_name=Data",
                json={},
            )
        finally:
            DatasetStore.delete(dataset_id)

        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("bahan_baperjakat.pptx", response.headers["content-disposition"])
        presentation = Presentation(BytesIO(response.content))
        self.assertEqual(len(presentation.slides), 2)

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
