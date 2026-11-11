import unittest
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from fastapi.testclient import TestClient

from app.api.auth import get_current_user
from app.history_db import get_history_db
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
                connection.exec_driver_sql(
                    "CREATE TABLE pbnopen_data_source_sync "
                    "(id INTEGER PRIMARY KEY, last_synced_at DATETIME NOT NULL, "
                    "synced_by_user VARCHAR(80) NOT NULL, synced_by_name VARCHAR(200) NOT NULL)"
                )

            with patch.object(pbnopen_import_service, "engine", test_engine):
                row_count = pbnopen_import_service.replace_pbnopen_data(
                    b"Age,Name\n30,Alice\n41,Bob\n",
                    synced_by_user="admin",
                    synced_by_name="Admin",
                )

            with test_engine.connect() as connection:
                rows = connection.execute(
                    text("SELECT Name, Age FROM pbncleaner.fetch_pbnopen ORDER BY Name")
                ).all()
                sync = connection.execute(
                    text(
                        "SELECT last_synced_at, synced_by_user, synced_by_name "
                        "FROM pbnopen_data_source_sync WHERE id = 1"
                    )
                ).one()
            self.assertEqual(row_count, 2)
            self.assertEqual(rows, [("Alice", 30), ("Bob", 41)])
            self.assertIsNotNone(sync.last_synced_at)
            self.assertEqual(sync.synced_by_user, "admin")
            self.assertEqual(sync.synced_by_name, "Admin")
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
                connection.exec_driver_sql(
                    "CREATE TABLE pbnopen_data_source_sync "
                    "(id INTEGER PRIMARY KEY, last_synced_at DATETIME NOT NULL, "
                    "synced_by_user VARCHAR(80) NOT NULL, synced_by_name VARCHAR(200) NOT NULL)"
                )
                connection.exec_driver_sql(
                    "INSERT INTO pbnopen_data_source_sync "
                    "(id, last_synced_at, synced_by_user, synced_by_name) "
                    "VALUES (1, '2026-01-01 00:00:00', 'previous', 'Previous Admin')"
                )

            with patch.object(pbnopen_import_service, "engine", test_engine):
                with self.assertRaisesRegex(ValueError, "columns do not match"):
                    pbnopen_import_service.replace_pbnopen_data(
                        b"Name,Extra\nNew,value\n",
                        synced_by_user="admin",
                        synced_by_name="Admin",
                    )

            with test_engine.connect() as connection:
                rows = connection.execute(
                    text("SELECT Name, Age FROM pbncleaner.fetch_pbnopen")
                ).all()
                sync = connection.execute(
                    text(
                        "SELECT last_synced_at, synced_by_user, synced_by_name "
                        "FROM pbnopen_data_source_sync WHERE id = 1"
                    )
                ).one()
            self.assertEqual(rows, [("Old", 99)])
            self.assertEqual(
                sync,
                ("2026-01-01 00:00:00", "previous", "Previous Admin"),
            )
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
                connection.exec_driver_sql(
                    "CREATE TABLE pbnopen_data_source_sync "
                    "(id INTEGER PRIMARY KEY, last_synced_at DATETIME NOT NULL, "
                    "synced_by_user VARCHAR(80) NOT NULL, synced_by_name VARCHAR(200) NOT NULL)"
                )
                connection.exec_driver_sql(
                    "INSERT INTO pbnopen_data_source_sync "
                    "(id, last_synced_at, synced_by_user, synced_by_name) "
                    "VALUES (1, '2026-01-01 00:00:00', 'previous', 'Previous Admin')"
                )

            with patch.object(pbnopen_import_service, "engine", test_engine):
                with self.assertRaises(SQLAlchemyError):
                    pbnopen_import_service.replace_pbnopen_data(
                        b"Name,Age\nNew,101\n",
                        synced_by_user="admin",
                        synced_by_name="Admin",
                    )

            with test_engine.connect() as connection:
                rows = connection.execute(
                    text("SELECT Name, Age FROM pbncleaner.fetch_pbnopen")
                ).all()
                sync = connection.execute(
                    text(
                        "SELECT last_synced_at, synced_by_user, synced_by_name "
                        "FROM pbnopen_data_source_sync WHERE id = 1"
                    )
                ).one()
            self.assertEqual(rows, [("Old", 99)])
            self.assertEqual(
                sync,
                ("2026-01-01 00:00:00", "previous", "Previous Admin"),
            )
        finally:
            test_engine.dispose()


class DtEmployeeSyncTests(unittest.TestCase):
    def setUp(self) -> None:
        self.test_engine = create_engine("sqlite:///:memory:")
        self.source_columns = (
            *pbnopen_import_service.EMPLOYEE_DIRECT_COLUMNS,
            *(source for _, source, _, _ in pbnopen_import_service.EMPLOYEE_REFERENCE_COLUMNS),
        )
        self.target_columns = (
            *pbnopen_import_service.EMPLOYEE_DIRECT_COLUMNS,
            *(target for target, _, _, _ in pbnopen_import_service.EMPLOYEE_REFERENCE_COLUMNS),
        )
        with self.test_engine.begin() as connection:
            connection.exec_driver_sql("ATTACH DATABASE ':memory:' AS pbncleaner")
            source_column_sql = ", ".join(f'"{column}" TEXT' for column in self.source_columns)
            connection.exec_driver_sql(
                f"CREATE TABLE pbncleaner.fetch_pbnopen ({source_column_sql})"
            )
            reference_targets = {
                target for target, _, _, _ in pbnopen_import_service.EMPLOYEE_REFERENCE_COLUMNS
            }
            target_column_sql = ", ".join(
                f'"{column}" {"INTEGER" if column in reference_targets else "TEXT"}'
                for column in self.target_columns
            )
            connection.exec_driver_sql(
                "CREATE TABLE pbncleaner.dt_employee "
                f"(employee_id INTEGER PRIMARY KEY AUTOINCREMENT, {target_column_sql}, "
                "CHECK (\"Nama Gelar\" != 'reject'))"
            )
            for _, _, reference_name, id_column in pbnopen_import_service.EMPLOYEE_REFERENCE_COLUMNS:
                connection.exec_driver_sql(
                    f"CREATE TABLE pbncleaner.{reference_name} "
                    f"({id_column} INTEGER PRIMARY KEY, value TEXT NOT NULL)"
                )
                connection.exec_driver_sql(
                    f"INSERT INTO pbncleaner.{reference_name} ({id_column}, value) VALUES (?, ?)",
                    (1, f"{reference_name} label"),
                )

    def tearDown(self) -> None:
        self.test_engine.dispose()

    def _source_record(self, nip: str, name: str) -> dict[str, str]:
        record = {column: f"source-{column}" for column in self.source_columns}
        record["NIP"] = nip
        record["Nama Gelar"] = name
        for _, source, reference_name, _ in pbnopen_import_service.EMPLOYEE_REFERENCE_COLUMNS:
            record[source] = f"{reference_name} label"
        return record

    def _insert_source(self, records: list[dict[str, str]]) -> None:
        quoted_columns = ", ".join(f'"{column}"' for column in self.source_columns)
        placeholders = ", ".join("?" for _ in self.source_columns)
        values = [tuple(record[column] for column in self.source_columns) for record in records]
        with self.test_engine.begin() as connection:
            connection.exec_driver_sql(
                f"INSERT INTO pbncleaner.fetch_pbnopen ({quoted_columns}) VALUES ({placeholders})",
                values,
            )

    def _insert_employee(self, employee_id: int, nip: str, name: str) -> None:
        values = {column: f"old-{column}" for column in self.target_columns}
        values["NIP"] = nip
        values["Nama Gelar"] = name
        values.update(
            {
                target: 1
                for target, _, _, _ in pbnopen_import_service.EMPLOYEE_REFERENCE_COLUMNS
            }
        )
        columns = ["employee_id", *self.target_columns]
        quoted_columns = ", ".join(f'"{column}"' for column in columns)
        placeholders = ", ".join("?" for _ in columns)
        with self.test_engine.begin() as connection:
            connection.exec_driver_sql(
                f"INSERT INTO pbncleaner.dt_employee ({quoted_columns}) VALUES ({placeholders})",
                (employee_id, *(values[column] for column in self.target_columns)),
            )

    def _employee_rows(self) -> list[dict[str, object]]:
        with self.test_engine.connect() as connection:
            return list(
                connection.execute(
                    text(
                        'SELECT employee_id, "NIP", "Nama Gelar", "Unit Eselon III", '
                        "pangkat_id, eselon_id, pendidikan_id, unit_kerja_id, rumpun_id "
                        "FROM pbncleaner.dt_employee ORDER BY employee_id"
                    )
                ).mappings()
            )

    def test_sync_maps_reference_labels_preserves_ids_and_removes_obsolete_rows(self) -> None:
        self._insert_source(
            [self._source_record("001", "Updated"), self._source_record("002", "New")]
        )
        self._insert_employee(100, "001", "Old")
        self._insert_employee(101, "003", "Obsolete")

        with patch.object(pbnopen_import_service, "engine", self.test_engine):
            row_count = pbnopen_import_service.sync_dt_employee_from_pbnopen()

        rows = self._employee_rows()
        by_nip = {row["NIP"]: row for row in rows}
        self.assertEqual(row_count, 2)
        self.assertEqual(set(by_nip), {"001", "002"})
        self.assertEqual(by_nip["001"]["employee_id"], 100)
        self.assertEqual(by_nip["001"]["Nama Gelar"], "Updated")
        self.assertEqual(by_nip["001"]["Unit Eselon III"], "source-Unit Eselon III")
        for reference_id in ("pangkat_id", "eselon_id", "pendidikan_id", "unit_kerja_id", "rumpun_id"):
            self.assertEqual(by_nip["001"][reference_id], 1)

    def test_missing_reference_mapping_leaves_employee_table_unchanged(self) -> None:
        source_record = self._source_record("001", "Updated")
        source_record["Pangkat"] = "Unmapped rank"
        self._insert_source([source_record])
        self._insert_employee(100, "001", "Old")

        with patch.object(pbnopen_import_service, "engine", self.test_engine):
            with self.assertRaisesRegex(ValueError, "reference mappings are missing"):
                pbnopen_import_service.sync_dt_employee_from_pbnopen()

        self.assertEqual(self._employee_rows()[0]["Nama Gelar"], "Old")

    def test_duplicate_source_nips_are_rejected_without_changes(self) -> None:
        self._insert_source(
            [self._source_record("001", "First"), self._source_record("001", "Duplicate")]
        )
        self._insert_employee(100, "001", "Old")

        with patch.object(pbnopen_import_service, "engine", self.test_engine):
            with self.assertRaisesRegex(ValueError, "duplicate NIPs"):
                pbnopen_import_service.sync_dt_employee_from_pbnopen()

        self.assertEqual(len(self._employee_rows()), 1)
        self.assertEqual(self._employee_rows()[0]["Nama Gelar"], "Old")

    def test_database_failure_rolls_back_updates_and_inserts(self) -> None:
        rejected_record = self._source_record("002", "reject")
        self._insert_source(
            [self._source_record("001", "Updated"), rejected_record]
        )
        self._insert_employee(100, "001", "Old")

        with patch.object(pbnopen_import_service, "engine", self.test_engine):
            with self.assertRaises(SQLAlchemyError):
                pbnopen_import_service.sync_dt_employee_from_pbnopen()

        rows = self._employee_rows()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["employee_id"], 100)
        self.assertEqual(rows[0]["Nama Gelar"], "Old")


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

    def test_normal_admin_can_read_data_source_sync_status(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="admin",
            auth_level=2,
        )
        app.dependency_overrides[get_history_db] = lambda: SimpleNamespace(
            get=lambda model, key: None,
        )
        try:
            response = TestClient(app).get("/admin/pbnopen-data-source/status")
        finally:
            app.dependency_overrides.pop(get_current_user, None)
            app.dependency_overrides.pop(get_history_db, None)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"last_synced_at": None, "synced_by_user": None, "synced_by_name": None},
        )

    def test_super_admin_can_replace_data_source_csv(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="root",
            name="Root",
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
        replace.assert_called_once_with(
            b"Name,Age\nAlice,30\n",
            synced_by_user="root",
            synced_by_name="Root",
        )

    def test_normal_admin_cannot_sync_dt_employee(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="admin",
            auth_level=2,
        )
        try:
            with patch(
                "app.api.auth.pbnopen_import_service.sync_dt_employee_from_pbnopen"
            ) as sync:
                response = TestClient(app).post("/admin/dt-employee/sync")
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        self.assertEqual(response.status_code, 403)
        sync.assert_not_called()

    def test_super_admin_can_sync_dt_employee(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="root",
            name="Root",
            auth_level=3,
        )
        try:
            with patch(
                "app.api.auth.pbnopen_import_service.sync_dt_employee_from_pbnopen",
                return_value=2,
            ) as sync:
                response = TestClient(app).post("/admin/dt-employee/sync")
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["row_count"], 2)
        sync.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
