import unittest
from datetime import date, datetime
from io import BytesIO
from unittest.mock import patch

from openpyxl import load_workbook
import pandas as pd

from app.schemas.dataset import DatasetPreview
from app.schemas.pbn_dashboard import PbnDashboardFilters
from app.services.dataset_service import apply_auto_clean, export_excel
from app.services.pbn_dashboard_service import (
    build_pbn_dashboard,
    build_pbnopen_dashboard,
    get_pbn_dashboard_people,
    get_pbnopen_dashboard_people,
)
from app.storage.dataset_store import DatasetStore


class PbnDashboardRouteTests(unittest.TestCase):
    def test_dashboard_endpoints_are_registered(self) -> None:
        from main import app

        registered_routes = {
            (route.path, method)
            for route in app.routes
            for method in getattr(route, "methods", set())
        }

        self.assertIn(("/insights/pbn/dashboard/{dataset_id}", "POST"), registered_routes)
        self.assertIn(("/insights/pbn/dashboard/{dataset_id}/people", "POST"), registered_routes)
        self.assertIn(("/insights-beta/pbn/dashboard", "POST"), registered_routes)
        self.assertIn(("/insights-beta/pbn/dashboard/people", "POST"), registered_routes)
        self.assertIn(("/admin/pbnopen-data-source/validate", "POST"), registered_routes)
        self.assertIn(("/admin/pbnopen-data-source/replace", "POST"), registered_routes)
        self.assertIn(("/export/powerpoint/baperjakat/{dataset_id}", "POST"), registered_routes)


class PbnDashboardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.dataset_id = DatasetStore.save({
            "Sheet1": pd.DataFrame({
                "Nama Gelar": ["Alice", "Bob", "Cara", "Dedi"],
                "Jabatan": ["Analyst", "Manager", "Advisor", "Staff"],
                "Jurusan": ["IT", "Economics", "Math", "Law"],
                "Universitas/Sekolah Tinggi": ["University A", "University B", "University C", "University D"],
                "Sex": ["F", "M", "F", "M"],
                "Usia (th.)": [25, 35, 52, None],
                "TMT Jabatan": [
                    pd.Timestamp("2020-10-20"),
                    "01/01/2015",
                    date(2025, 6, 1),
                    None,
                ],
                "Eselon": ["III", "II", "III", "IV"],
                "Pendidikan Terakhir (Short)": ["S1", "S2", "S2", "S1"],
                "Rumpun Pdd Terakhir": ["Teknik", "Sosial", "Teknik", "Sains"],
                "Region Homebase": ["West", "East", "West", "North"],
                "Unit Eselon II": ["Unit A", "Unit B", "Unit A", "Unit C"],
                "Agama": ["Islam", "Kristen", "Islam", "Hindu"],
            })
        })

    def test_database_dashboard_uses_same_aggregations_and_filters(self) -> None:
        source = DatasetStore.get(self.dataset_id)["Sheet1"]
        with patch(
            "app.repositories.pbn_dashboard_repository.load_pbnopen_source",
            return_value=source,
        ):
            result = build_pbnopen_dashboard(
                PbnDashboardFilters(region=["West"]),
                today=date(2026, 10, 19),
            )

        self.assertEqual(result["dataset_id"], "pbncleaner.fetch_pbnopen")
        self.assertEqual(result["total_employees"], 2)
        self.assertEqual(result["region_distribution"][0]["label"], "West")
        self.assertEqual(result["available_filters"]["region"], ["East", "North", "West"])

    def test_database_name_filter_matches_nama_gelar_keyword(self) -> None:
        source = DatasetStore.get(self.dataset_id)["Sheet1"]
        with patch(
            "app.repositories.pbn_dashboard_repository.load_pbnopen_source",
            return_value=source,
        ):
            dashboard = build_pbnopen_dashboard(
                PbnDashboardFilters(name="li"),
                today=date(2026, 10, 19),
            )
            people = get_pbnopen_dashboard_people(
                PbnDashboardFilters(name="li"),
                today=date(2026, 10, 19),
            )

        self.assertEqual(dashboard["total_employees"], 1)
        self.assertEqual([person["Nama"] for person in people["people"]], ["Alice"])

    def test_database_retirement_count_uses_60_for_2_11_and_58_for_other_eselon(self) -> None:
        source = pd.DataFrame({
            "Nama Gelar": ["II A", "Fungs Ahli Madya", "IV A", "Too Far", "Already Retired"],
            "NIP": ["001", "002", "003", "004", "005"],
            "Tanggal Lahir": [
                "15/11/1966",
                "15/12/1966",
                "15/12/1968",
                "15/01/2000",
                "15/06/1968",
            ],
            "Eselon": ["II.A", "Fungs. Ahli Madya", "IV.A", "IV.A", "IV.A"],
            "Eselon ID": [2, 11, 4, 4, 4],
            "Sex": ["M", "M", "F", "F", "F"],
            "Usia (th.)": [60, 60, 58, 26, 58],
            "TMT Jabatan": ["01/01/2000"] * 5,
            "Pendidikan Terakhir (Short)": ["S1"] * 5,
            "Rumpun Pdd Terakhir": ["Teknik"] * 5,
            "Region Homebase": ["West"] * 5,
            "Unit Eselon II": ["Unit A"] * 5,
            "Agama": ["Islam"] * 5,
        })
        with patch(
            "app.repositories.pbn_dashboard_repository.load_pbnopen_source",
            return_value=source,
        ):
            result = build_pbnopen_dashboard(
                PbnDashboardFilters(),
                today=date(2026, 10, 19),
            )

        self.assertEqual(result["retirement_count"], 3)

    def test_database_people_uses_same_filters_and_shape(self) -> None:
        source = DatasetStore.get(self.dataset_id)["Sheet1"]
        with patch(
            "app.repositories.pbn_dashboard_repository.load_pbnopen_source",
            return_value=source,
        ):
            result = get_pbnopen_dashboard_people(
                PbnDashboardFilters(region=["East"]),
                today=date(2026, 10, 19),
            )

        self.assertEqual(result["dataset_id"], "pbncleaner.fetch_pbnopen")
        self.assertEqual(len(result["people"]), 1)
        self.assertEqual(result["people"][0]["Nama"], "Bob")

    def test_dashboard_aggregates_all_rows_and_uses_51_plus_age_group(self) -> None:
        result = build_pbn_dashboard(
            self.dataset_id,
            "Sheet1",
            PbnDashboardFilters(),
            today=date(2026, 10, 19),
        )

        self.assertEqual(result["total_employees"], 4)
        self.assertEqual(
            {item["label"]: item["count"] for item in result["sex_distribution"]},
            {"F": 2, "M": 2},
        )
        self.assertEqual(
            {item["label"]: item["count"] for item in result["age_group_distribution"]},
            {"<20 Th": 0, "20 - 30 Th": 1, "31 - 40 Th": 1, "41 - 50 Th": 0, "51+ Th": 1, "Tidak diketahui": 1},
        )
        self.assertEqual(result["available_filters"]["tenure"], {"min": 1, "max": 11})

    def test_dashboard_reads_dataset_sheet_once(self) -> None:
        with patch.object(DatasetStore, "get", wraps=DatasetStore.get) as get_dataset:
            build_pbn_dashboard(
                self.dataset_id,
                "Sheet1",
                PbnDashboardFilters(),
                today=date(2026, 10, 19),
            )

        get_dataset.assert_called_once_with(self.dataset_id)

    def test_tenure_slider_filters_rows_by_completed_years(self) -> None:
        result = build_pbn_dashboard(
            self.dataset_id,
            "Sheet1",
            PbnDashboardFilters(tenure_min=5, tenure_max=5),
            today=date(2026, 10, 19),
        )

        self.assertEqual(result["total_employees"], 1)
        self.assertEqual(result["sex_distribution"][0]["label"], "F")
        self.assertEqual(result["region_distribution"][0]["label"], "West")

    def test_region_unit_and_rumpun_filters_recalculate_every_distribution(self) -> None:
        result = build_pbn_dashboard(
            self.dataset_id,
            "Sheet1",
            PbnDashboardFilters(
                region=["West"],
                unit=["Unit A"],
                rumpun=["Teknik"],
            ),
            today=date(2026, 10, 19),
        )

        self.assertEqual(result["total_employees"], 2)
        self.assertEqual(
            {item["label"]: item["count"] for item in result["sex_distribution"]},
            {"F": 2},
        )
        self.assertEqual(
            {item["label"]: item["count"] for item in result["religion_distribution"]},
            {"Islam": 2},
        )
        self.assertEqual(
            {item["label"]: item["count"] for item in result["age_group_distribution"]},
            {"<20 Th": 0, "20 - 30 Th": 1, "31 - 40 Th": 0, "41 - 50 Th": 0, "51+ Th": 1, "Tidak diketahui": 0},
        )
        self.assertEqual(result["available_filters"]["region"], ["East", "North", "West"])

    def test_filters_recalculate_every_distribution(self) -> None:
        result = build_pbn_dashboard(
            self.dataset_id,
            "Sheet1",
            PbnDashboardFilters(
                age_min=31,
                age_max=40,
                eselon=["II"],
                education=["S2"],
            ),
            today=date(2026, 10, 19),
        )

        self.assertEqual(result["total_employees"], 1)
        self.assertEqual(result["sex_distribution"][0]["label"], "M")
        self.assertEqual(result["region_distribution"][0]["label"], "East")
        self.assertEqual(result["education_group_distribution"][0]["label"], "Sosial")
        self.assertEqual(result["unit_distribution"][0]["label"], "Unit B")

    def test_people_table_contains_only_rows_matching_dashboard_filters(self) -> None:
        result = get_pbn_dashboard_people(
            self.dataset_id,
            "Sheet1",
            PbnDashboardFilters(region=["West"], unit=["Unit A"], rumpun=["Teknik"]),
            today=date(2026, 10, 19),
        )

        self.assertEqual([person["Nama"] for person in result["people"]], ["Alice", "Cara"])
        self.assertEqual(
            list(result["people"][0]),
            [
                "index",
                "Nama",
                "Eselon",
                "Jabatan",
                "Pendidikan Terakhir (Th.)",
                "Jurusan",
                "Universitas/Sekolah Tinggi",
                "Unit Eselon II",
                "Usia",
                "Agama",
                "Sex",
                "Region Homebase",
                "Rumpun Pendidikan",
            ],
        )

    def test_pbn_edu_hb_cleaning_strips_characters_and_converts_tmt_fields(self) -> None:
        columns = [f"Column {index}" for index in range(1, 91)]
        tmt_columns = [
            "TMT JF Keterampilan",
            "TMT JF Keahlian",
            "TMT JF Ahli Muda",
            "TMT JF Ahli Madya",
            "TMT Es4",
            "TMT Es3",
            "TMT Es2",
            "TMT Jabatan",
        ]
        for position, column in enumerate(tmt_columns, start=14):
            columns[position - 1] = column
        columns[21] = "Catatan"
        row = [f"value-{index}" for index in range(1, 91)]
        row[13:21] = ["'2025-07-07", "`09/08/2025`", None, None, None, None, None, "invalid-date"]
        row[21] = "a'b`c"
        rows = [row]
        dataset_id = DatasetStore.save({"Sheet1": pd.DataFrame(rows, columns=columns)})

        result = apply_auto_clean(dataset_id, "PBN Open + Edu + HB", "Sheet1")
        cleaned_row = result["rows"][0]

        self.assertEqual(cleaned_row["TMT JF Keterampilan"], pd.Timestamp("2025-07-07"))
        self.assertEqual(cleaned_row["TMT JF Keahlian"], pd.Timestamp("2025-08-09"))
        self.assertTrue(pd.isna(cleaned_row["TMT JF Ahli Muda"]))
        self.assertEqual(cleaned_row["TMT Jabatan"], "invalid-date")
        self.assertEqual(cleaned_row["Catatan"], "abc")
        cleaned_dataframe = DatasetStore.get(dataset_id)["Sheet1"]
        self.assertTrue(pd.api.types.is_datetime64_any_dtype(cleaned_dataframe["TMT JF Keterampilan"]))
        self.assertFalse(pd.api.types.is_datetime64_any_dtype(cleaned_dataframe["TMT Jabatan"]))
        self.assertEqual(
            result["cleaning_warnings"],
            ["TMT Jabatan: 1 value(s) could not be parsed and were preserved (cleaned row(s) 1)."],
        )
        self.assertEqual(result["columns"].count("TMT Jabatan"), 1)
        self.assertIsInstance(cleaned_row["TMT JF Keterampilan"], datetime)

        response = DatasetPreview(**result).model_dump(mode="json")
        self.assertEqual(response["cleaning_warnings"], result["cleaning_warnings"])
        self.assertEqual(response["rows"][0]["TMT JF Keterampilan"], "2025-07-07T00:00:00")

        workbook = load_workbook(BytesIO(export_excel(dataset_id, "Sheet1")))
        worksheet = workbook["Sheet1"]
        date_column = result["columns"].index("TMT JF Keterampilan") + 1
        self.assertIsInstance(worksheet.cell(row=2, column=date_column).value, datetime)


if __name__ == "__main__":
    unittest.main()
