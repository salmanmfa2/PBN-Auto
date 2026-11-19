import unittest
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.auth import get_current_user, get_optional_current_user
from app.history_db import Base, _migrate_mutation_analysis_schema, get_history_db
from app.models.auth import User
from app.models.dataset_run import DatasetRun
from app.models.menu_access import MenuAccessPolicy
from app.models.mutation_analysis import (
    MutationAnalysisWorkspace,
    MutationAnalysisWorkspaceDataset,
)
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
                MutationAnalysisWorkspace.__table__,
                MutationAnalysisWorkspaceDataset.__table__,
                MenuAccessPolicy.__table__,
            ],
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
