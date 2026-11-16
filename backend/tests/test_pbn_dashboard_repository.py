import unittest
from unittest.mock import patch

from app.repositories import pbn_dashboard_repository


class PbnDashboardRepositoryTests(unittest.TestCase):
    def test_database_read_error_is_wrapped_and_logged_without_details(self) -> None:
        database_error = ValueError("sensitive connection details")
        with patch.object(
            pbn_dashboard_repository.pd,
            "read_sql_table",
            side_effect=database_error,
        ):
            with self.assertLogs(
                "app.repositories.pbn_dashboard_repository",
                level="ERROR",
            ) as captured_logs:
                with self.assertRaisesRegex(
                    RuntimeError,
                    "Could not read database table 'pbncleaner.fetch_pbnopen'",
                ) as raised:
                    pbn_dashboard_repository.load_pbnopen_source()

        self.assertIs(raised.exception.__cause__, database_error)
        self.assertNotIn("sensitive connection details", "\n".join(captured_logs.output))


if __name__ == "__main__":
    unittest.main()
