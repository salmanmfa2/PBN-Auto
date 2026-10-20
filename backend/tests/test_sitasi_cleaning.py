import unittest

import pandas as pd

from app.services.dataset_service import add_sitasi_category, apply_auto_clean
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
        self.assertEqual([row["Pertimbangan"] for row in result["rows"]], ["Mutasi", "Promosi", "Mutasi dan Promosi"])
        self.assertEqual([row["Kategori"] for row in result["rows"]], ["Mutasi", "Promosi", "Mutasi"])
        self.assertNotIn("Column 15", result["columns"])
        self.assertIn("Pertimbangan", result["columns"])

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