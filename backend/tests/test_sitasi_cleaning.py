import unittest
from io import BytesIO

import pandas as pd
from openpyxl import load_workbook

from app.services.dataset_service import add_sitasi_category, apply_auto_clean, export_excel
from app.storage.dataset_store import DatasetStore


class SitasiCategoryTests(unittest.TestCase):
    def test_category_uses_mutasi_priority_and_handles_missing_remarks(self) -> None:
        frame = pd.DataFrame({
            "Keterangan": [
                "Mutasi jabatan",
                "Promosi ke jabatan baru",
                "Mutasi dan Promosi",
                "Catatan lainnya",
                None,
            ]
        })

        result = add_sitasi_category(frame)

        self.assertEqual(result["Kategori"].tolist(), ["Mutasi", "Promosi", "Mutasi", "", ""])
        self.assertNotIn("Kategori", frame.columns)

    def test_esiii_ignores_first_six_characters_only_in_keterangan(self) -> None:
        columns = [f"Column {index}" for index in range(1, 20)]
        rows = [
            ["header-{column}".format(column=column) for column in range(1, 20)]
            for _ in range(2)
        ]
        rows.extend([
            ["1", "Staff A", "age", "x", "x", "x", "x", "x", "Role A", "2", "3", "Area A", "Duty A", "Role B", "x", "123456Mutasi", "x", "x", "x"],
            ["2", "Staff B", "age", "x", "x", "x", "x", "x", "Role B", "2", "3", "Area B", "Duty B", "Role C", "x", "abcdefPromosi", "x", "x", "x"],
            ["3", "Staff C", "age", "x", "x", "x", "x", "x", "Role C", "2", "3", "Area C", "Duty C", "Role D", "x", None, "x", "x", "x"],
        ])
        dataset_id = DatasetStore.save({"Data": pd.DataFrame(rows, columns=columns)})

        result = apply_auto_clean(dataset_id, "Sitasi Es.III", "Data")

        self.assertEqual(
            [row["Keterangan"] for row in result["rows"]],
            ["Mutasi", "Promosi", None],
        )
        self.assertEqual(
            [row["Kategori"] for row in result["rows"]],
            ["Mutasi", "Promosi", ""],
        )
        self.assertEqual([row["Nama/NIP"] for row in result["rows"]], ["Staff A", "Staff B", "Staff C"])

    def test_esiii_sets_keterangan_to_proper_case_after_ignoring_prefix(self) -> None:
        columns = [f"Column {index}" for index in range(1, 20)]
        rows = [
            [f"header-{column}" for column in range(1, 20)]
            for _ in range(2)
        ]
        rows.extend([
            ["1", "Staff A", "age", "x", "x", "x", "x", "x", "Role A", "2", "3", "Area A", "Duty A", "Role B", "x", "123456MUTASI PEGAWAI ANTAR UNIT", "x", "x", "x"],
            ["2", "Staff B", "age", "x", "x", "x", "x", "x", "Role B", "2", "3", "Area B", "Duty B", "Role C", "x", "abcdefpromosi JABATAN BARU", "x", "x", "x"],
        ])
        dataset_id = DatasetStore.save({"Data": pd.DataFrame(rows, columns=columns)})

        result = apply_auto_clean(dataset_id, "Sitasi Es.III", "Data")

        self.assertEqual(
            [row["Keterangan"] for row in result["rows"]],
            ["Mutasi Pegawai Antar Unit", "Promosi Jabatan Baru"],
        )

    def test_esiii_removes_unneeded_text_from_keterangan_and_jabatan_baru(self) -> None:
        columns = [f"Column {index}" for index in range(1, 20)]
        rows = [
            [f"header-{column}" for column in range(1, 20)]
            for _ in range(2)
        ]
        rows.append([
            "1", "Staff A", "age", "x", "x", "x", "x", "x", "Role A", "2",
            "3", "Area A", "Duty A", "Ex Officio: - Direktur", "x",
            "123456Latar Belakang: -", "x", "x", "x",
        ])
        dataset_id = DatasetStore.save({"Data": pd.DataFrame(rows, columns=columns)})

        result = apply_auto_clean(dataset_id, "Sitasi Es.III", "Data")

        self.assertEqual(result["rows"][0]["Keterangan"], "")
        self.assertEqual(result["rows"][0]["Jabatan Baru"], "Direktur")
        self.assertEqual(result["rows"][0]["Kategori"], "")

    def test_esiii_lite_preserves_rows_with_null_name_and_applies_same_cleaning(self) -> None:
        columns = [f"Column {index}" for index in range(1, 20)]
        rows = [
            [f"header-{column}" for column in range(1, 20)]
            for _ in range(2)
        ]
        rows.extend([
            ["1", "Staff A", "age", "x", "x", "x", "x", "x", "Role A", "2", "3", "Area A", "Duty A", "Role B", "x", "123456Mutasi", "x", "x", "x"],
            ["2", None, "age", "x", "x", "x", "x", "x", "Role B", "2", "3", "Area B", "Duty B", "Role C", "x", "abcdefPromosi", "x", "x", "x"],
        ])
        dataset_id = DatasetStore.save({"Data": pd.DataFrame(rows, columns=columns)})

        result = apply_auto_clean(dataset_id, "Sitasi Es.III (Lite)", "Data")

        self.assertEqual(result["row_count"], 2)
        self.assertEqual([row["Keterangan"] for row in result["rows"]], ["Mutasi", "Promosi"])
        self.assertEqual([row["Kategori"] for row in result["rows"]], ["Mutasi", "Promosi"])
        self.assertEqual([row["Nama/NIP"] for row in result["rows"]], ["Staff A", None])

    def test_esiii_lite_excel_export_merges_section_heading_rows(self) -> None:
        columns = [f"Column {index}" for index in range(1, 20)]
        rows = [
            [f"header-{column}" for column in range(1, 20)]
            for _ in range(2)
        ]
        rows.extend([
            ["A. Direktorat Pelaksanaan Anggaran"] + [None] * 18,
            ["1", "Staff A", "age", "x", "x", "x", "x", "x", "Role A", "2", "3", "Area A", "Duty A", "Role B", "x", "123456Mutasi", "x", "x", "x"],
        ])
        dataset_id = DatasetStore.save({"Data": pd.DataFrame(rows, columns=columns)})

        apply_auto_clean(dataset_id, "Sitasi Es.III (Lite)", "Data")
        output = export_excel(dataset_id, "Data")
        workbook = load_workbook(BytesIO(output))

        self.assertIn("A2:M2", {str(cell_range) for cell_range in workbook["Data"].merged_cells.ranges})
        self.assertEqual(workbook["Data"]["A2"].value, "A. Direktorat Pelaksanaan Anggaran")
        self.assertEqual(workbook["Data"]["A3"].value, "1")

    def test_standard_esiii_excel_export_does_not_merge_section_heading_rows(self) -> None:
        columns = [f"Column {index}" for index in range(1, 20)]
        rows = [
            [f"header-{column}" for column in range(1, 20)]
            for _ in range(2)
        ]
        rows.extend([
            ["A. Direktorat Pelaksanaan Anggaran"] + [None] * 18,
            ["1", "Staff A", "age", "x", "x", "x", "x", "x", "Role A", "2", "3", "Area A", "Duty A", "Role B", "x", "123456Mutasi", "x", "x", "x"],
        ])
        dataset_id = DatasetStore.save({"Data": pd.DataFrame(rows, columns=columns)})

        apply_auto_clean(dataset_id, "Sitasi Es.III", "Data")
        output = export_excel(dataset_id, "Data")
        workbook = load_workbook(BytesIO(output))

        self.assertEqual(list(workbook["Data"].merged_cells.ranges), [])

    def test_esiv_uses_pertimbangan_and_skips_first_seven_rows(self) -> None:
        columns = [f"Column {index}" for index in range(1, 16)]
        rows = [[f"ignored-{row}-{column}" for column in range(1, 16)] for row in range(7)]
        rows.extend([
            ["10", "Staff A", "40", "IV/a", "Role A", "discard", "discard", "2020", "Area A", "Role B", "x", "x", "x", "Mutasi", "discard"],
            ["11", "Staff B", "41", "IV/b", "Role C", "discard", "discard", "2021", "Area B", "Role D", "x", "x", "x", "Promosi", "discard"],
            ["12", "Staff C", "42", "IV/c", "Role E", "discard", "discard", "2022", "Area C", "Role F", "x", "x", "x", "Mutasi dan Promosi", "discard"],
        ])
        dataset_id = DatasetStore.save({"Data": pd.DataFrame(rows, columns=columns)})

        result = apply_auto_clean(dataset_id, "Sitasi Es.IV", "Data")

        self.assertEqual(result["row_count"], 3)
        self.assertEqual([row["Pertimbangan"] for row in result["rows"]], ["Mutasi", "Promosi", "Mutasi Dan Promosi"])
        self.assertEqual([row["Kategori"] for row in result["rows"]], ["Mutasi", "Promosi", "Mutasi"])
        self.assertNotIn("Column 15", result["columns"])
        self.assertIn("Pertimbangan", result["columns"])

    def test_esiv_sets_pertimbangan_to_proper_case(self) -> None:
        columns = [f"Column {index}" for index in range(1, 16)]
        rows = [[f"ignored-{row}-{column}" for column in range(1, 16)] for row in range(7)]
        rows.extend([
            ["10", "Staff A", "40", "IV/a", "Role A", "discard", "discard", "2020", "Area A", "Role B", "x", "x", "x", "MUTASI PEGAWAI ANTAR UNIT", "discard"],
            ["11", "Staff B", "41", "IV/b", "Role C", "discard", "discard", "2021", "Area B", "Role D", "x", "x", "x", "promosi JABATAN BARU", "discard"],
            ["12", "Staff C", "42", "IV/c", "Role E", "discard", "discard", "2022", "Area C", "Role F", "x", "x", "x", None, "discard"],
        ])
        dataset_id = DatasetStore.save({"Data": pd.DataFrame(rows, columns=columns)})

        result = apply_auto_clean(dataset_id, "Sitasi Es.IV", "Data")

        self.assertEqual(
            [row["Pertimbangan"] for row in result["rows"]],
            ["Mutasi Pegawai Antar Unit", "Promosi Jabatan Baru", None],
        )
        self.assertEqual(
            [row["Kategori"] for row in result["rows"]],
            ["Mutasi", "Promosi", ""],
        )

    def test_esiv_preserves_pertimbangan_when_header_is_in_position_15(self) -> None:
        columns = [f"Column {index}" for index in range(1, 16)]
        columns[14] = "Pertimbangan"
        rows = [
            [f"leading-{row}-{column}" for column in range(1, 16)]
            for row in range(7)
        ]
        rows.append(["1", "Staff", "40", "IV/a", "Role", "x", "x", "2020", "Area", "New role", "x", "x", "x", "Notes", "Promosi"])
        dataset_id = DatasetStore.save({"Data": pd.DataFrame(rows, columns=columns)})

        result = apply_auto_clean(dataset_id, "Sitasi Es.IV", "Data")

        self.assertEqual(result["rows"][0]["Pertimbangan"], "Promosi")
        self.assertEqual(result["rows"][0]["Kategori"], "Promosi")

    def test_esiv_reports_when_pertimbangan_source_cannot_be_resolved(self) -> None:
        columns = [f"Column {index}" for index in range(1, 14)]
        rows = [["1", "Staff", "40", "IV/a", "Role", "x", "x", "2020", "Area", "New role", "x", "x", "x"]]
        dataset_id = DatasetStore.save({"Data": pd.DataFrame(rows, columns=columns)})

        with self.assertRaisesRegex(ValueError, "does not contain 'Pertimbangan'"):
            apply_auto_clean(dataset_id, "Sitasi Es.IV", "Data")

if __name__ == "__main__":
    unittest.main()

