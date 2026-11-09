import unittest
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from fastapi.testclient import TestClient

from app.api.auth import get_current_user
from app.services import pbnopen_import_service
from app.services.pbnopen_import_service import _read_csv
from main import app


class PbnOpenCsvValidationTests(unittest.TestCase):
    def test_csv_columns_can_be_in_different_order(self) -> None:
        dataframe = _read_csv(b"Name,Age\nAlice,30\n", ["Age", "Name"])

        self.assertEqual(list(dataframe.columns), ["Age", "Name"])
        self.assertEqual(dataframe.iloc[0].tolist(), ["30", "Alice"])

    def test_csv_must_match_expected_columns(self) -> None:
        with self.assertRaisesRegex(ValueError, "Missing columns: Age"):
            _read_csv(b"Name,Extra\nAlice,value\n", ["Name", "Age"])

    def test_csv_must_not_have_duplicate_columns(self) -> None:
        with self.assertRaisesRegex(ValueError, "duplicate column names"):
            _read_csv(b"Name,Name\nAlice,Alias\n", ["Name"])

    def test_csv_must_contain_at_least_one_data_row(self) -> None:
        with self.assertRaisesRegex(ValueError, "at least one data row"):
            _read_csv(b"Name,Age\n", ["Name", "Age"])

    def test_replace_replaces_rows_after_validating_columns(self) -> None:
        test_engine = create_engine("sqlite:///:memory:")
        try:
            with test_engine.begin() as connection:
                connection.exec_driver_sql("ATTACH DATABASE ':memory:' AS pbncleaner")
                connection.exec_driver_sql(
                    "CREATE TABLE pbncleaner.fetch_pbnopen (Name TEXT, Age INTEGER)"
                )
                connection.exec_driver_sql(
                    "INSERT INTO pbncleaner.fetch_pbnopen (Name, Age) VALUES ('Old', 99)"
                )

            with patch.object(pbnopen_import_service, "engine", test_engine):
                row_count = pbnopen_import_service.replace_pbnopen_data(
                    b"Age,Name\n30,Alice\n41,Bob\n"
                )

            with test_engine.connect() as connection:
                rows = connection.execute(
                    text("SELECT Name, Age FROM pbncleaner.fetch_pbnopen ORDER BY Name")
                ).all()
            self.assertEqual(row_count, 2)
            self.assertEqual(rows, [("Alice", 30), ("Bob", 41)])
        finally:
            test_engine.dispose()

    def test_column_mismatch_leaves_existing_rows_untouched(self) -> None:
        test_engine = create_engine("sqlite:///:memory:")
        try:
            with test_engine.begin() as connection:
                connection.exec_driver_sql("ATTACH DATABASE ':memory:' AS pbncleaner")
                connection.exec_driver_sql(
                    "CREATE TABLE pbncleaner.fetch_pbnopen (Name TEXT, Age INTEGER)"
                )
                connection.exec_driver_sql(
                    "INSERT INTO pbncleaner.fetch_pbnopen (Name, Age) VALUES ('Old', 99)"
                )

            with patch.object(pbnopen_import_service, "engine", test_engine):
                with self.assertRaisesRegex(ValueError, "columns do not match"):
                    pbnopen_import_service.replace_pbnopen_data(b"Name,Extra\nNew,value\n")

            with test_engine.connect() as connection:
                rows = connection.execute(
                    text("SELECT Name, Age FROM pbncleaner.fetch_pbnopen")
                ).all()
            self.assertEqual(rows, [("Old", 99)])
        finally:
            test_engine.dispose()

    def test_database_insert_failure_rolls_back_table_replacement(self) -> None:
        test_engine = create_engine("sqlite:///:memory:")
        try:
            with test_engine.begin() as connection:
                connection.exec_driver_sql("ATTACH DATABASE ':memory:' AS pbncleaner")
                connection.exec_driver_sql(
                    "CREATE TABLE pbncleaner.fetch_pbnopen "
                    "(Name TEXT, Age INTEGER CHECK (Age < 100))"
                )
                connection.exec_driver_sql(
                    "INSERT INTO pbncleaner.fetch_pbnopen (Name, Age) VALUES ('Old', 99)"
                )

            with patch.object(pbnopen_import_service, "engine", test_engine):
                with self.assertRaises(SQLAlchemyError):
                    pbnopen_import_service.replace_pbnopen_data(b"Name,Age\nNew,101\n")

            with test_engine.connect() as connection:
                rows = connection.execute(
                    text("SELECT Name, Age FROM pbncleaner.fetch_pbnopen")
                ).all()
            self.assertEqual(rows, [("Old", 99)])
        finally:
            test_engine.dispose()


class PbnOpenImportAuthorizationTests(unittest.TestCase):
    def test_normal_admin_cannot_validate_data_source_csv(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="admin",
            auth_level=2,
        )
        try:
            with patch("app.api.auth.pbnopen_import_service.validate_pbnopen_csv") as validate:
                response = TestClient(app).post(
                    "/admin/pbnopen-data-source/validate",
                    files={"file": ("data.csv", "Name,Age\nAlice,30\n", "text/csv")},
                )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        self.assertEqual(response.status_code, 403)
        validate.assert_not_called()

    def test_normal_admin_cannot_replace_data_source_csv(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="admin",
            auth_level=2,
        )
        try:
            with patch("app.api.auth.pbnopen_import_service.replace_pbnopen_data") as replace:
                response = TestClient(app).post(
                    "/admin/pbnopen-data-source/replace",
                    files={"file": ("data.csv", "Name,Age\nAlice,30\n", "text/csv")},
                )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        self.assertEqual(response.status_code, 403)
        replace.assert_not_called()

    def test_super_admin_can_replace_data_source_csv(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="root",
            auth_level=3,
        )
        try:
            with patch(
                "app.api.auth.pbnopen_import_service.replace_pbnopen_data",
                return_value=1,
            ) as replace:
                response = TestClient(app).post(
                    "/admin/pbnopen-data-source/replace",
                    files={"file": ("data.csv", "Name,Age\nAlice,30\n", "text/csv")},
                )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["row_count"], 1)
        replace.assert_called_once_with(b"Name,Age\nAlice,30\n")


if __name__ == "__main__":
    unittest.main()
