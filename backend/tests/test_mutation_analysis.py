import os
import tempfile
import unittest
from datetime import date, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.auth import get_current_user, get_optional_current_user
from app.api.mutation_analysis import _category_for_eselon_id, _format_job_duration
from app.history_db import Base, _migrate_mutation_analysis_schema, get_history_db
from app.models.auth import User
from app.models.cleaning_history import CleaningHistory
from app.models.dataset_run import DatasetRun
from app.models.menu_access import MenuAccessPolicy
from app.models.mutation_analysis import (
    MutationAnalysisWorkspace,
    MutationAnalysisWorkspaceDataset,
)
from app.storage.dataset_store import DatasetStore
from main import app


class MutationWorkspaceDatasetTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            self.engine,
            tables=[
                User.__table__,
                DatasetRun.__table__,
                CleaningHistory.__table__,
                MutationAnalysisWorkspace.__table__,
                MutationAnalysisWorkspaceDataset.__table__,
                MenuAccessPolicy.__table__,
            ],
        )
        with self.engine.begin() as connection:
            connection.execute(
                text(
                    """
                    CREATE TABLE dataset_files (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        dataset_id VARCHAR(64) NOT NULL,
                        version_number INTEGER NOT NULL,
                        file_role VARCHAR(16) NOT NULL,
                        original_filename VARCHAR(255) NOT NULL,
                        stored_filename VARCHAR(255) NOT NULL,
                        content_type VARCHAR(100),
                        file_size_bytes BIGINT,
                        storage_path VARCHAR(1024) NOT NULL,
                        google_drive_file_id VARCHAR(255),
                        google_drive_web_url VARCHAR(1024),
                        google_drive_folder_id VARCHAR(255),
                        created_at DATETIME,
                        created_by VARCHAR(100),
                        is_deleted BOOLEAN NOT NULL DEFAULT 0,
                        deleted_at DATETIME
                    )
                    """
                )
            )
        self.db = Session(self.engine)
        self.user = SimpleNamespace(user="owner", auth_level=1, name="Owner")
        self.other_user = SimpleNamespace(user="other", auth_level=1, name="Other")
        self.db.add_all(
            [
                User(user="owner", name="Owner", password=""),
                User(user="other", name="Other", password=""),
                DatasetRun(
                    dataset_id="dataset-admin",
                    run_name="admin",
                    original_filename="admin.csv",
                ),
                DatasetRun(
                    dataset_id="dataset-pengawas",
                    run_name="pengawas",
                    original_filename="pengawas.csv",
                ),
                MutationAnalysisWorkspace(
                    id="workspace-admin",
                    created_by="owner",
                    eselon_choice="Administrator",
                    title="Admin",
                ),
                MutationAnalysisWorkspace(
                    id="workspace-pengawas",
                    created_by="owner",
                    eselon_choice="Pengawas",
                    title="Pengawas",
                ),
            ]
        )
        self.db.commit()

        def override_history_db():
            yield self.db

        app.dependency_overrides[get_history_db] = override_history_db
        app.dependency_overrides[get_current_user] = lambda: self.user
        app.dependency_overrides[get_optional_current_user] = lambda: self.user
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.pop(get_history_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_optional_current_user, None)
        self.db.close()
        self.engine.dispose()

    def test_workspace_dataset_assignment_is_isolated_and_unique(self) -> None:
        admin_response = self.client.put(
            "/mutation-analysis/workspaces/workspace-admin/dataset",
            json={"dataset_id": "dataset-admin"},
        )
        pengawas_response = self.client.put(
            "/mutation-analysis/workspaces/workspace-pengawas/dataset",
            json={"dataset_id": "dataset-pengawas"},
        )

        self.assertEqual(admin_response.status_code, 200)
        self.assertEqual(admin_response.json()["dataset_id"], "dataset-admin")
        self.assertEqual(pengawas_response.status_code, 200)
        self.assertEqual(pengawas_response.json()["dataset_id"], "dataset-pengawas")

        duplicate_response = self.client.put(
            "/mutation-analysis/workspaces/workspace-pengawas/dataset",
            json={"dataset_id": "dataset-admin"},
        )
        self.assertEqual(duplicate_response.status_code, 409)

        listed = self.client.get("/mutation-analysis/workspaces")
        self.assertEqual(listed.status_code, 200)
        by_id = {workspace["id"]: workspace for workspace in listed.json()}
        self.assertEqual(by_id["workspace-admin"]["dataset_id"], "dataset-admin")
        self.assertEqual(by_id["workspace-pengawas"]["dataset_id"], "dataset-pengawas")

    def test_workspace_dataset_assignment_requires_workspace_ownership(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: self.other_user

        response = self.client.put(
            "/mutation-analysis/workspaces/workspace-admin/dataset",
            json={"dataset_id": "dataset-admin"},
        )

        self.assertEqual(response.status_code, 404)
        self.assertIsNone(self.db.get(MutationAnalysisWorkspaceDataset, "workspace-admin"))

    def test_workspace_upload_persists_file_and_restores_after_cache_clear(self) -> None:
        content = b"Name,Value\nAlice,One\nBob,Two\n"
        with tempfile.TemporaryDirectory() as storage_root:
            with patch.dict(os.environ, {"DATASET_STORAGE_ROOT": storage_root}):
                uploaded = self.client.post(
                    "/mutation-analysis/workspaces/workspace-admin/upload",
                    files={"file": ("employees.csv", content, "text/csv")},
                )
                self.assertEqual(uploaded.status_code, 200, uploaded.text)
                dataset_id = uploaded.json()["dataset_id"]
                assignment = self.db.get(
                    MutationAnalysisWorkspaceDataset,
                    "workspace-admin",
                )
                self.assertIsNotNone(assignment)
                self.assertEqual(assignment.dataset_id, dataset_id)

                DatasetStore.delete(dataset_id)
                restored = self.client.post(f"/stored-datasets/{dataset_id}/restore")
                self.assertEqual(restored.status_code, 200, restored.text)
                self.assertEqual(restored.json()["dataset_id"], dataset_id)
                self.assertEqual(restored.json()["row_count"], 2)

                DatasetStore.delete(dataset_id)
                workspace_restored = self.client.post(
                    "/mutation-analysis/workspaces/workspace-admin/dataset/restore",
                )
                self.assertEqual(workspace_restored.status_code, 200, workspace_restored.text)
                self.assertEqual(
                    workspace_restored.json()["raw_preview"]["dataset_id"],
                    dataset_id,
                )
                self.assertEqual(workspace_restored.json()["preview"]["row_count"], 2)
                self.assertIsNone(workspace_restored.json()["auto_clean_mode"])

        DatasetStore.delete(dataset_id)

    def test_workspace_analysis_uses_employee_eselon_and_persists_manual_categories(self) -> None:
        content = (
            "NIP,Kategori,TMT Jabatan Lama\n"
            "111111111111111111,Promosi,old date\n"
            "222222222222222222,Mutasi,old date\n"
        ).encode()
        employee_rows = [
            {
                "NIP": "111111111111111111",
                "Nama Gelar": "Pegawai Satu",
                "Jabatan": "Jabatan Satu",
                "Unit Eselon II": "Unit A",
                "Unit Eselon III": "Unit A.1",
                "Unit Eselon IV": "Unit A.1.a",
                "eselon_id": 4,
                "TMT Jabatan": datetime(2020, 7, 20),
                "Eselon": "IV.A",
            },
            {
                "NIP": "222222222222222222",
                "Nama Gelar": "Pegawai Dua",
                "Jabatan": "Jabatan Dua",
                "Unit Eselon II": "Unit B",
                "Unit Eselon III": "Unit B.1",
                "Unit Eselon IV": "Unit B.1.a",
                "eselon_id": None,
                "TMT Jabatan": None,
                "Eselon": "",
            },
        ]

        with tempfile.TemporaryDirectory() as storage_root:
            with (
                patch.dict(os.environ, {"DATASET_STORAGE_ROOT": storage_root}),
                patch("app.api.mutation_analysis.engine.connect") as connect,
            ):
                connection = MagicMock()
                connection.execute.return_value.mappings.return_value.all.return_value = employee_rows
                connect.return_value.__enter__.return_value = connection

                uploaded = self.client.post(
                    "/mutation-analysis/workspaces/workspace-admin/upload",
                    files={"file": ("employees.csv", content, "text/csv")},
                )
                self.assertEqual(uploaded.status_code, 200, uploaded.text)
                dataset_id = uploaded.json()["dataset_id"]

                analyzed = self.client.post(
                    "/mutation-analysis/workspaces/workspace-admin/dataset/analyze",
                    json={"sheet_name": "Sheet1"},
                )
                self.assertEqual(analyzed.status_code, 200, analyzed.text)
                result = analyzed.json()
                self.assertEqual(result["matched_count"], 2)
                self.assertEqual(
                    [row["Kategori"] for row in result["preview"]["rows"]],
                    ["Promosi", "Pilih/Unidentified"],
                )
                self.assertIn("Masa Jabatan", result["preview"]["columns"])
                self.assertNotIn("TMT Jabatan Lama", result["preview"]["columns"])
                self.assertEqual(
                    result["preview"]["rows"][0]["Masa Jabatan"],
                    _format_job_duration(date(2020, 7, 20)),
                )
                self.assertEqual(
                    result["matches"]["111111111111111111"]["kategori"],
                    _category_for_eselon_id(4, "Administrator"),
                )

                saved = self.client.put(
                    "/mutation-analysis/workspaces/workspace-admin/categories",
                    json={
                        "sheet_name": "Sheet1",
                        "categories": [
                            {"row_index": 0, "category": "Demosi"},
                            {"row_index": 1, "category": "Mutasi"},
                        ],
                    },
                )
                self.assertEqual(saved.status_code, 200, saved.text)
                self.assertEqual(saved.json()["rows"][0]["Kategori"], "Demosi")
                self.assertEqual(saved.json()["rows"][1]["Kategori"], "Mutasi")
                self.assertNotIn("__mutation_manual_category", saved.json()["columns"]                )

                reanalyzed = self.client.post(
                    "/mutation-analysis/workspaces/workspace-admin/dataset/analyze",
                    json={"sheet_name": "Sheet1"},
                )
                self.assertEqual(reanalyzed.status_code, 200, reanalyzed.text)
                self.assertEqual(
                    [row["Kategori"] for row in reanalyzed.json()["preview"]["rows"]],
                    ["Demosi", "Mutasi"],
                )

                DatasetStore.delete(dataset_id)
                restored = self.client.post(
                    "/mutation-analysis/workspaces/workspace-admin/dataset/restore",
                )
                self.assertEqual(restored.status_code, 200, restored.text)
                restored_preview = restored.json()["preview"]
                self.assertEqual(restored_preview["rows"][0]["Kategori"], "Demosi")
                self.assertEqual(restored_preview["rows"][1]["Kategori"], "Mutasi")
                self.assertEqual(
                    restored_preview["rows"][0]["__mutation_manual_category"],
                    "Demosi",
                )
                self.assertEqual(
                    restored_preview["rows"][1]["__mutation_manual_category"],
                    "Mutasi",
                )

        DatasetStore.delete(dataset_id)

    def test_mutation_category_mapping_and_duration_boundaries(self) -> None:
        self.assertEqual(_category_for_eselon_id(11, "Administrator"), "Mutasi")
        self.assertEqual(_category_for_eselon_id(3, "Administrator"), "Mutasi")
        for eselon_id in (4, 5, 6):
            self.assertEqual(_category_for_eselon_id(eselon_id, "Administrator"), "Promosi")
        self.assertEqual(_category_for_eselon_id(2, "Administrator"), "Demosi")
        for eselon_id in (1, 7, 8, 9, 10, None):
            self.assertIsNone(_category_for_eselon_id(eselon_id, "Administrator"))

        self.assertEqual(_category_for_eselon_id(4, "Pengawas"), "Mutasi")
        self.assertEqual(
            _category_for_eselon_id(6, "Pengawas"),
            "Perpindahan dari Fungsional",
        )
        for eselon_id in (5, 7, 8, 9, 10):
            self.assertEqual(_category_for_eselon_id(eselon_id, "Pengawas"), "Promosi")
        for eselon_id in (1, 2, 3, 11):
            self.assertEqual(_category_for_eselon_id(eselon_id, "Pengawas"), "Demosi")
        self.assertIsNone(_category_for_eselon_id(None, "Pengawas"))

        self.assertEqual(
            _format_job_duration(date(2020, 7, 20), today=date(2026, 11, 20)),
            "6 Tahun 4 Bulan",
        )
        self.assertEqual(
            _format_job_duration(date(2026, 10, 31), today=date(2026, 11, 30)),
            "0 Tahun 1 Bulan",
        )

    def test_talent_finder_filters_and_search_work_without_workspace_dataset(self) -> None:
        with patch("app.api.mutation_analysis.engine.connect") as connect:
            connection = MagicMock()
            eselon_result = MagicMock()
            eselon_result.mappings.return_value.all.return_value = [
                {"id": 4, "label": "IV.A"},
            ]
            rumpun_result = MagicMock()
            rumpun_result.mappings.return_value.all.return_value = [
                {"id": 3, "label": "ADMINISTRASI PUBLIK"},
            ]
            connection.execute.side_effect = [eselon_result, rumpun_result]
            connect.return_value.__enter__.return_value = connection

            options_response = self.client.get(
                "/mutation-analysis/talent-finder/filter-options",
            )

        self.assertEqual(options_response.status_code, 200, options_response.text)
        self.assertEqual(options_response.json()["eselon"], [{"id": 4, "label": "IV.A"}])
        self.assertEqual(
            options_response.json()["rumpun"],
            [{"id": 3, "label": "ADMINISTRASI PUBLIK"}],
        )

        with patch("app.api.mutation_analysis.engine.connect") as connect:
            connection = MagicMock()
            count_result = MagicMock()
            count_result.scalar_one.return_value = 17
            connection.execute.return_value = count_result
            connect.return_value.__enter__.return_value = connection

            count_response = self.client.post(
                "/mutation-analysis/talent-finder/count",
                json={
                    "eselon_ids": [4],
                    "name": "Contoh",
                    "rumpun_ids": [3],
                },
            )

        self.assertEqual(count_response.status_code, 200, count_response.text)
        self.assertEqual(count_response.json()["total"], 17)

        employee_row = {
            "employee_id": 42,
            "nama": "Pegawai Contoh",
            "eselon": "IV.A",
            "usia": 35,
            "jabatan": "Kepala Seksi",
            "pendidikan": "S2",
            "jurusan": "Administrasi",
            "universitas": "Universitas Contoh",
            "homebase": "Jakarta",
            "eselon_id": 4,
            "TMT Jabatan": datetime(2019, 7, 20),
            "TMT Es3": None,
            "TMT Es2": None,
            "TMT Es4": datetime(2020, 7, 20),
            "TMT JF Ahli Madya": None,
            "TMT JF Ahli Muda": None,
            "TMT JF Keterampilan": None,
            "TMT JF Keahlian": None,
        }
        with patch("app.api.mutation_analysis.engine.connect") as connect:
            connection = MagicMock()
            count_result = MagicMock()
            count_result.scalar_one.return_value = 1
            employees_result = MagicMock()
            employees_result.mappings.return_value.all.return_value = [employee_row]
            connection.execute.side_effect = [count_result, employees_result]
            connect.return_value.__enter__.return_value = connection

            search_response = self.client.post(
                "/mutation-analysis/talent-finder/search",
                json={
                    "eselon_ids": [4],
                    "name": "Contoh",
                    "rumpun_ids": [3],
                    "page": 1,
                    "page_size": 10,
                    "sort_by": "lama_jabatan",
                    "sort_order": "asc",
                },
            )

        self.assertEqual(search_response.status_code, 200, search_response.text)
        result = search_response.json()
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["employees"][0]["nama"], "Pegawai Contoh")
        self.assertEqual(result["employees"][0]["lama_eselon"], "6 Tahun 4 Bulan")
        self.assertEqual(result["employees"][0]["lama_jabatan"], _format_job_duration(date(2019, 7, 20)))
        self.assertEqual(result["employees"][0]["homebase"], "Jakarta")
        count_parameters = connection.execute.call_args_list[0].args[1]
        result_parameters = connection.execute.call_args_list[1].args[1]
        self.assertEqual(count_parameters["eselon_ids"], [4])
        self.assertEqual(count_parameters["rumpun_ids"], [3])
        self.assertEqual(count_parameters["name_pattern"], "%contoh%")
        self.assertEqual(result_parameters["limit"], 10)
        self.assertEqual(result_parameters["offset"], 0)

    def test_workspace_create_update_and_delete(self) -> None:
        created = self.client.post(
            "/mutation-analysis/workspaces",
            json={
                "eselon_choice": "Administrator",
                "title": "Batch Juni",
                "tmt": "2026-06-01",
                "description": "Workspace description",
                "status": "Aktif",
            },
        )
        self.assertEqual(created.status_code, 201)
        workspace_id = created.json()["id"]
        self.assertEqual(created.json()["tmt"], "2026-06-01")

        updated = self.client.put(
            f"/mutation-analysis/workspaces/{workspace_id}",
            json={
                "title": "Batch Juli",
                "tmt": "2026-07-01",
                "description": "Updated description",
                "status": "Inaktif",
            },
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["title"], "Batch Juli")
        self.assertEqual(updated.json()["status"], "Inaktif")

        deleted = self.client.delete(f"/mutation-analysis/workspaces/{workspace_id}")
        self.assertEqual(deleted.status_code, 204)
        self.assertIsNone(self.db.get(MutationAnalysisWorkspace, workspace_id))

    def test_existing_workspace_table_gets_new_fields(self) -> None:
        legacy_engine = create_engine("sqlite://")
        try:
            with legacy_engine.begin() as connection:
                connection.execute(
                    text(
                        "CREATE TABLE mutation_analysis_workspaces "
                        "(id VARCHAR(36) PRIMARY KEY)"
                    )
                )
                connection.execute(
                    text(
                        "INSERT INTO mutation_analysis_workspaces (id) "
                        "VALUES ('legacy-workspace')"
                    )
                )

            _migrate_mutation_analysis_schema(legacy_engine)

            column_names = {
                column["name"]
                for column in inspect(legacy_engine).get_columns(
                    "mutation_analysis_workspaces"
                )
            }
            self.assertIn("tmt", column_names)
            self.assertIn("status", column_names)
            with legacy_engine.connect() as connection:
                status = connection.execute(
                    text(
                        "SELECT status FROM mutation_analysis_workspaces "
                        "WHERE id = 'legacy-workspace'"
                    )
                ).scalar_one()
            self.assertEqual(status, "Aktif")
        finally:
            legacy_engine.dispose()


if __name__ == "__main__":
    unittest.main()
