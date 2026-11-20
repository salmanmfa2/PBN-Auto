import unittest
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.api.auth import get_current_user, get_optional_current_user
from app.history_db import Base, get_history_db
from app.models.menu_access import MenuAccessPolicy
from app.services import pbnopen_import_service
from app.services.pbnopen_import_service import _read_csv
from main import app


class PbnOpenCsvValidationTests(unittest.TestCase):
    def test_database_maintenance_catalog_discovers_live_schema_tables(self) -> None:
        fake_connection = unittest.mock.MagicMock()
        fake_context = unittest.mock.MagicMock()
        fake_context.__enter__.return_value = fake_connection
        fake_context.__exit__.return_value = False
        fake_inspector = SimpleNamespace(
            get_table_names=lambda schema=None: [
                "fetch_pbnopen",
                "dt_employee",
                "new_live_table",
            ],
        )
        with patch(
            "app.services.pbnopen_import_service.engine.connect",
            return_value=fake_context,
        ), patch(
            "app.services.pbnopen_import_service.inspect",
            return_value=fake_inspector,
        ):
            catalog = pbnopen_import_service.get_table_maintenance_catalog()

        discovered = next(
            item for item in catalog if item["key"] == "new_live_table"
        )
        self.assertEqual(discovered["label"], "Database table: new_live_table")
        self.assertEqual(discovered["operation"], "replace")

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
            connection.exec_driver_sql(
                f"CREATE TABLE pbncleaner.fetch_pbnopen_q2_2026 ({source_column_sql})"
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
            connection.exec_driver_sql(
                "CREATE TABLE pbncleaner.dt_employee_q2_2026 "
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

    def _insert_source(
        self,
        records: list[dict[str, str]],
        table_name: str = "fetch_pbnopen",
    ) -> None:
        quoted_columns = ", ".join(f'"{column}"' for column in self.source_columns)
        placeholders = ", ".join("?" for _ in self.source_columns)
        values = [tuple(record[column] for column in self.source_columns) for record in records]
        with self.test_engine.begin() as connection:
            connection.exec_driver_sql(
                f"INSERT INTO pbncleaner.{table_name} ({quoted_columns}) VALUES ({placeholders})",
                values,
            )

    def _insert_employee(
        self,
        employee_id: int,
        nip: str,
        name: str,
        table_name: str = "dt_employee",
    ) -> None:
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
                f"INSERT INTO pbncleaner.{table_name} ({quoted_columns}) VALUES ({placeholders})",
                (employee_id, *(values[column] for column in self.target_columns)),
            )

    def _employee_rows(self, table_name: str = "dt_employee") -> list[dict[str, object]]:
        with self.test_engine.connect() as connection:
            return list(
                connection.execute(
                    text(
                        'SELECT employee_id, "NIP", "Nama Gelar", "Unit Eselon III", '
                        f"pangkat_id, eselon_id, pendidikan_id, unit_kerja_id, rumpun_id "
                        f"FROM pbncleaner.{table_name} ORDER BY employee_id"
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

    def test_q2_sync_preview_is_read_only_and_sync_preserves_employee_ids(self) -> None:
        self._insert_source(
            [self._source_record("001", "Updated Q2"), self._source_record("002", "New Q2")],
            table_name="fetch_pbnopen_q2_2026",
        )
        self._insert_employee(200, "001", "Old Q2", table_name="dt_employee_q2_2026")
        self._insert_employee(201, "003", "Obsolete Q2", table_name="dt_employee_q2_2026")

        with patch.object(pbnopen_import_service, "engine", self.test_engine):
            preview = pbnopen_import_service.preview_employee_table_sync(
                "dt_employee_q2_2026"
            )
            self.assertEqual(preview["row_count"], 2)
            self.assertEqual(preview["updated_count"], 1)
            self.assertEqual(preview["inserted_count"], 1)
            self.assertEqual(preview["deleted_count"], 1)
            before_apply = self._employee_rows("dt_employee_q2_2026")
            self.assertEqual(before_apply[0]["Nama Gelar"], "Old Q2")

            result = pbnopen_import_service.sync_employee_table("dt_employee_q2_2026")

        rows = self._employee_rows("dt_employee_q2_2026")
        by_nip = {row["NIP"]: row for row in rows}
        self.assertEqual(result["row_count"], 2)
        self.assertEqual(result["updated_count"], 1)
        self.assertEqual(result["inserted_count"], 1)
        self.assertEqual(result["deleted_count"], 1)
        self.assertEqual(set(by_nip), {"001", "002"})
        self.assertEqual(by_nip["001"]["employee_id"], 200)
        self.assertEqual(by_nip["001"]["Nama Gelar"], "Updated Q2")

    def test_q2_source_preview_and_replacement(self) -> None:
        self._insert_source(
            [self._source_record("001", "Old Q2")],
            table_name="fetch_pbnopen_q2_2026",
        )
        replacement = self._source_record("002", "New Q2")
        csv_content = (
            ",".join(self.source_columns)
            + "\n"
            + ",".join(replacement[column] for column in self.source_columns)
            + "\n"
        ).encode()

        with patch.object(pbnopen_import_service, "engine", self.test_engine):
            preview = pbnopen_import_service.preview_table_maintenance_csv(
                "fetch_pbnopen_q2_2026",
                csv_content,
            )
            self.assertEqual(preview["row_count"], 1)
            self.assertEqual(preview["current_row_count"], 1)
            with self.test_engine.connect() as connection:
                before_apply = connection.execute(
                    text("SELECT NIP, `Nama Gelar` FROM pbncleaner.fetch_pbnopen_q2_2026")
                ).one()
            self.assertEqual(before_apply, ("001", "Old Q2"))

            result = pbnopen_import_service.apply_table_maintenance_csv(
                "fetch_pbnopen_q2_2026",
                csv_content,
                synced_by_user="salmanmfa",
                synced_by_name="Salman",
            )

        with self.test_engine.connect() as connection:
            rows = connection.execute(
                text("SELECT NIP, `Nama Gelar` FROM pbncleaner.fetch_pbnopen_q2_2026")
            ).all()
        self.assertEqual(result["row_count"], 1)
        self.assertEqual(rows, [("002", "New Q2")])

    def test_reference_update_preserves_ids_and_rejects_removing_used_ids(self) -> None:
        self._insert_employee(100, "001", "Employee")
        with patch.object(pbnopen_import_service, "engine", self.test_engine):
            with self.assertRaisesRegex(ValueError, "still uses them"):
                pbnopen_import_service.preview_table_maintenance_csv(
                    "ref_pangkat",
                    b"pangkat_id,value\n2,New rank\n",
                )

            content = b"pangkat_id,value\n1,Updated rank\n2,New rank\n"
            preview = pbnopen_import_service.preview_table_maintenance_csv(
                "ref_pangkat",
                content,
            )
            self.assertEqual(preview["updated_count"], 1)
            self.assertEqual(preview["inserted_count"], 1)
            result = pbnopen_import_service.apply_table_maintenance_csv(
                "ref_pangkat",
                content,
                synced_by_user="salmanmfa",
                synced_by_name="Salman",
            )

        with self.test_engine.connect() as connection:
            rows = connection.execute(
                text("SELECT pangkat_id, value FROM pbncleaner.ref_pangkat ORDER BY pangkat_id")
            ).all()
        self.assertEqual(result["updated_count"], 1)
        self.assertEqual(result["inserted_count"], 1)
        self.assertEqual(rows, [(1, "Updated rank"), (2, "New rank")])

    def test_database_maintenance_rejects_non_allowlisted_target(self) -> None:
        with patch.object(pbnopen_import_service, "engine", self.test_engine):
            with self.assertRaisesRegex(ValueError, "not an allowed database-maintenance target"):
                pbnopen_import_service.preview_table_maintenance_csv(
                    "users",
                    b"user,name\nroot,Root\n",
                )

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
    def setUp(self) -> None:
        self.menu_engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            self.menu_engine,
            tables=[MenuAccessPolicy.__table__],
        )

        def override_history_db():
            with Session(self.menu_engine) as session:
                yield session

        app.dependency_overrides[get_history_db] = override_history_db
        app.dependency_overrides[get_optional_current_user] = self.get_optional_user

    def get_optional_user(self):
        user_override = app.dependency_overrides.get(get_current_user)
        return user_override() if user_override is not None else None

    def tearDown(self) -> None:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_optional_current_user, None)
        app.dependency_overrides.pop(get_history_db, None)
        self.menu_engine.dispose()

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

        self.assertEqual(response.status_code, 403)

    def test_super_admin_cannot_replace_data_source_csv(self) -> None:
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

        self.assertEqual(response.status_code, 403)
        replace.assert_not_called()

    def test_god_user_can_replace_data_source_csv(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="salmanmfa",
            name="Salman",
            auth_level=4,
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
            synced_by_user="salmanmfa",
            synced_by_name="Salman",
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

    def test_super_admin_cannot_sync_dt_employee(self) -> None:
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

        self.assertEqual(response.status_code, 403)
        sync.assert_not_called()

    def test_god_user_can_sync_dt_employee(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="salmanmfa",
            name="Salman",
            auth_level=4,
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

    def test_level_three_cannot_open_database_maintenance_catalog(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="root",
            name="Root",
            auth_level=3,
        )
        try:
            with patch(
                "app.api.auth.pbnopen_import_service.get_table_maintenance_catalog"
            ) as get_tables:
                response = TestClient(app).get("/admin/database/tables")
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        self.assertEqual(response.status_code, 403)
        get_tables.assert_not_called()

    def test_level_three_cannot_preview_database_csv(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="root",
            name="Root",
            auth_level=3,
        )
        try:
            with patch(
                "app.api.auth.pbnopen_import_service.preview_table_maintenance_csv"
            ) as preview:
                response = TestClient(app).post(
                    "/admin/database/fetch_pbnopen_q2_2026/preview",
                    files={"file": ("data.csv", "Name,Age\nAlice,30\n", "text/csv")},
                )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        self.assertEqual(response.status_code, 403)
        preview.assert_not_called()

    def test_god_user_can_preview_database_csv(self) -> None:
        preview_result = {
            "target_key": "fetch_pbnopen_q2_2026",
            "table_name": "fetch_pbnopen_q2_2026",
            "operation": "replace",
            "columns": ["Name", "Age"],
            "row_count": 1,
            "current_row_count": 0,
            "inserted_count": 1,
            "updated_count": 0,
            "deleted_count": 0,
        }
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="salmanmfa",
            name="Salman",
            auth_level=4,
        )
        try:
            with patch(
                "app.api.auth.pbnopen_import_service.preview_table_maintenance_csv",
                return_value=preview_result,
            ) as preview:
                response = TestClient(app).post(
                    "/admin/database/fetch_pbnopen_q2_2026/preview",
                    files={"file": ("data.csv", "Name,Age\nAlice,30\n", "text/csv")},
                )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["filename"], "data.csv")
        self.assertEqual(response.json()["row_count"], 1)
        preview.assert_called_once_with(
            "fetch_pbnopen_q2_2026",
            b"Name,Age\nAlice,30\n",
        )

    def test_god_user_can_open_database_maintenance_catalog(self) -> None:
        catalog = [
            {
                "key": "fetch_pbnopen_q2_2026",
                "table_name": "fetch_pbnopen_q2_2026",
                "label": "PBN Open source (Q2 2026)",
                "operation": "replace",
                "source_table": None,
            }
        ]
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="salmanmfa",
            name="Salman",
            auth_level=4,
        )
        try:
            with patch(
                "app.api.auth.pbnopen_import_service.get_table_maintenance_catalog",
                return_value=catalog,
            ) as get_tables:
                response = TestClient(app).get("/admin/database/tables")
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"tables": catalog})
        get_tables.assert_called_once_with()

    def test_any_level_four_account_can_use_database_maintenance(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="someone-else",
            name="Someone Else",
            auth_level=4,
        )
        try:
            with patch(
                "app.api.auth.pbnopen_import_service.get_table_maintenance_catalog"
            ) as get_tables:
                response = TestClient(app).get("/admin/database/tables")
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        self.assertEqual(response.status_code, 200)
        get_tables.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
