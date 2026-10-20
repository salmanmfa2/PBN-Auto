import unittest

from app.cleaners import get_rules_for_mode
from app.services import powerpoint_service


class SitasiEsIIIAlphaRuleTests(unittest.TestCase):
    def test_sitasi_esiii_rule_uses_jpm_dot_condition(self) -> None:
        rules = get_rules_for_mode("Sitasi Es.III")
        self.assertIsNotNone(rules)
        self.assertEqual(rules.get("delete_rows_null_columns", []), [2])
        self.assertNotIn("delete_rows_contains", rules)


class SitasiEsIVPowerPointLayoutTests(unittest.TestCase):
    def test_layout_uses_esiv_template_and_6_data_rows(self) -> None:
        layout = powerpoint_service.get_template_layout("Sitasi Es.IV")
        self.assertEqual(layout["template_path"].name, "template_es4.pptx")
        self.assertEqual(layout["header_rows"], 1)
        self.assertEqual(len(layout["column_aliases"]), 8)
        self.assertEqual(layout["people_per_slide"], 6)


if __name__ == "__main__":
    unittest.main()
