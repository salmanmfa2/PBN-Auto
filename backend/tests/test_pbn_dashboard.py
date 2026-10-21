import unittest
from datetime import date

import pandas as pd

from app.schemas.pbn_dashboard import PbnDashboardFilters
from app.services.dataset_service import apply_auto_clean
from app.services.pbn_dashboard_service import build_pbn_dashboard, get_pbn_dashboard_people
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
            ],
        )

    def test_pbn_edu_hb_cleaning_preserves_tmt_values(self) -> None:
        columns = [f"Column {index}" for index in range(1, 91)]
        columns[19] = "TMT Jabatan"
        rows = []
        for date_value in ("'2025-07-07", "'2025-08-09", None):
            row = [f"value-{index}" for index in range(1, 91)]
            row[19] = date_value
            rows.append(row)
        dataset_id = DatasetStore.save({"Sheet1": pd.DataFrame(rows, columns=columns)})

        result = apply_auto_clean(dataset_id, "PBN Open + Edu + HB", "Sheet1")
        tmt_values = [row["TMT Jabatan"] for row in result["rows"]]

        self.assertEqual(tmt_values[0], "'2025-07-07")
        self.assertEqual(tmt_values[1], "'2025-08-09")
        self.assertTrue(pd.isna(tmt_values[2]))
        self.assertEqual(result["columns"].count("TMT Jabatan"), 1)


if __name__ == "__main__":
    unittest.main()
