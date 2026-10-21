import unittest
from pathlib import Path

import pandas as pd

from app.services.cleaning_recommendation_service import recommend_cleaning_method
from app.services.dataset_service import parse_upload
from app.storage.dataset_store import DatasetStore


VERIFICATION_DIR = Path(__file__).resolve().parents[1] / "templates" / "verification"


class CleaningRecommendationTests(unittest.TestCase):
    def _recommend_template(self, filename: str) -> dict:
        path = VERIFICATION_DIR / filename
        preview = parse_upload(path.read_bytes(), path.name)
        self.addCleanup(DatasetStore.delete, preview["dataset_id"])
        return recommend_cleaning_method(
            DatasetStore.get(preview["dataset_id"])[preview["selected_sheet"]]
        )

    def test_recommends_each_available_verification_template(self) -> None:
        expected_modes = {
            "input_PBN Open.xlsx": "PBN Open",
            "input_PBN Open + Edu+HB.xlsx": "PBN Open + Edu + HB",
            "input_sitasi_esIII.xlsx": "Sitasi Es.III",
            "input_sitasi_esIV.xlsx": "Sitasi Es.IV",
        }

        for filename, expected_mode in expected_modes.items():
            with self.subTest(filename=filename):
                result = self._recommend_template(filename)
                self.assertEqual(result["recommended_mode"], expected_mode)
                self.assertEqual(result["confidence"], "high")

    def test_does_not_guess_when_no_verification_template_matches(self) -> None:
        result = recommend_cleaning_method(pd.DataFrame({"Column A": ["value"], "Column B": ["value"]}))

        self.assertIsNone(result["recommended_mode"])
        self.assertEqual(result["confidence"], "none")

    def test_does_not_guess_pbn_open_edu_without_its_own_template(self) -> None:
        template_path = VERIFICATION_DIR / "input_PBN Open.xlsx"
        source = pd.read_excel(template_path, dtype=object)
        source.iloc[:, 55] = "Example education detail"

        result = recommend_cleaning_method(source)

        self.assertIsNone(result["recommended_mode"])
        self.assertEqual(result["confidence"], "ambiguous")
        self.assertIn("no separate PBN Open + Edu verification template", result["reason"])

    def test_recommendation_endpoint_is_registered(self) -> None:
        from main import app

        registered_routes = {
            (route.path, method)
            for route in app.routes
            for method in getattr(route, "methods", set())
        }

        self.assertIn(("/clean/recommend-method/{dataset_id}", "GET"), registered_routes)


if __name__ == "__main__":
    unittest.main()
