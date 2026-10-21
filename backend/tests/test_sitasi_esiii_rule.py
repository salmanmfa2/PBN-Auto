import unittest

from app.cleaners import get_rules_for_mode
from app.services import powerpoint_service


class SitasiEsIIIAlphaRuleTests(unittest.TestCase):
    def test_sitasi_esiii_rule_uses_jpm_dot_condition(self) -> None:
        rules = get_rules_for_mode("Sitasi Es.III")
        self.assertIsNotNone(rules)
        self.assertEqual(rules.get("delete_rows_null_columns", []), [2])
        self.assertNotIn("delete_rows_contains", rules)

    def test_sitasi_esiii_lite_uses_same_rules_without_null_row_deletion(self) -> None:
        standard_rules = get_rules_for_mode("Sitasi Es.III")
        lite_rules = get_rules_for_mode("Sitasi Es.III (Lite)")

        self.assertIsNotNone(lite_rules)
        self.assertEqual(lite_rules["skiprows"], standard_rules["skiprows"])
        self.assertEqual(lite_rules["delete_positions"], standard_rules["delete_positions"])
        self.assertEqual(lite_rules["rename_columns"], standard_rules["rename_columns"])
        self.assertEqual(lite_rules["delete_rows_null_columns"], [])


class SitasiEsIIILitePowerPointLayoutTests(unittest.TestCase):
    def test_lite_mode_uses_esiii_template_and_layout(self) -> None:
        layout = powerpoint_service.get_template_layout("Sitasi Es.III (Lite)")

        self.assertEqual(layout["template_path"].name, "template.pptx")
        self.assertEqual(layout["header_rows"], 3)
        self.assertEqual(len(layout["column_aliases"]), 10)
        self.assertEqual(layout["people_per_slide"], 0)


class SitasiEsIVPowerPointLayoutTests(unittest.TestCase):
    def test_layout_uses_esiv_template_and_6_data_rows(self) -> None:
        layout = powerpoint_service.get_template_layout("Sitasi Es.IV")
        self.assertEqual(layout["template_path"].name, "template_es4.pptx")
        self.assertEqual(layout["header_rows"], 1)
        self.assertEqual(len(layout["column_aliases"]), 8)
        self.assertEqual(layout["people_per_slide"], 6)


if __name__ == "__main__":
    unittest.main()
