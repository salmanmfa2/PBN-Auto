from datetime import date
from io import BytesIO
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from pptx import Presentation
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.auth import get_current_user, get_optional_current_user
from app.history_db import Base, get_history_db
from app.models.auth import User
from app.models.candidate_preparation import (
    CandidatePreparationCandidate,
    CandidatePreparationCandidateSnapshot,
    CandidatePreparationWorkspace,
)
from app.models.menu_access import MenuAccessPolicy
from app.services import candidate_preparation_service as candidate_service
from main import app


def employee_profile(
    employee_id: int,
    eselon_id: int = 4,
    **overrides: object,
) -> dict[str, object]:
    profile: dict[str, object] = {
        "employee_id": employee_id,
        "nip": f"19900101{employee_id:06d}",
        "nama": f"Kandidat {employee_id}",
        "eselon_id": eselon_id,
        "eselon": f"Eselon {eselon_id}",
        "jabatan": f"Jabatan {employee_id}",
        "unit_eselon_ii": "Direktorat A",
        "unit_eselon_iii": "Subdirektorat B",
        "gol": "IV/a",
        "pangkat": "Pembina",
        "pendidikan": "S2",
        "jurusan": "Administrasi Publik",
        "universitas": "Universitas Contoh",
        "tmt_jabatan": date(2020, 1, 15),
        "tanggal_lahir": "15/06/1985",
        "riwayat_jabatan": "",
        "consideration": "",
    }
    profile.update(overrides)
    return profile


def slide_text_by_id(slide, shape_id: int) -> str:
    def shapes():
        for shape in slide.shapes:
            yield shape
            if getattr(shape, "shapes", None) is not None:
                yield from shape.shapes

    return next(shape.text for shape in shapes() if shape.shape_id == shape_id)


class CandidatePreparationApiTests(unittest.TestCase):
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
                CandidatePreparationWorkspace.__table__,
                CandidatePreparationCandidate.__table__,
                CandidatePreparationCandidateSnapshot.__table__,
                MenuAccessPolicy.__table__,
            ],
        )
        self.db = Session(self.engine)
        self.db.add_all(
            [
                User(user="owner", name="Owner", password=""),
                User(user="other", name="Other", password=""),
            ]
        )
        self.db.commit()
        self.user = SimpleNamespace(user="owner", auth_level=1, name="Owner")

        def override_history_db():
            yield self.db

        app.dependency_overrides[get_history_db] = override_history_db
        app.dependency_overrides[get_current_user] = lambda: self.user
        app.dependency_overrides[get_optional_current_user] = lambda: self.user
        self.client = TestClient(app, raise_server_exceptions=False)

    def tearDown(self) -> None:
        app.dependency_overrides.pop(get_history_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_optional_current_user, None)
        self.db.close()
        self.engine.dispose()

    def create_workspace(
        self,
        *,
        output_style: str = "Single",
        priority: str = "med",
        workspace_name: str = "Workspace Kandidat",
    ) -> dict[str, object]:
        response = self.client.post(
            "/candidate-preparation/workspaces",
            json={
                "workspace_name": workspace_name,
                "target_jabatan": "Direktur Contoh",
                "date": "2026-01-15",
                "priority": priority,
                "output_style": output_style,
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def add_candidate(
        self,
        workspace_id: str,
        employee_id: int,
        eselon_id: int,
        consideration: str = "",
    ):
        with patch(
            "app.services.candidate_preparation_service.fetch_employee_profiles",
            return_value={employee_id: employee_profile(employee_id, eselon_id)},
        ):
            return self.client.post(
                f"/candidate-preparation/workspaces/{workspace_id}/candidates",
                json={
                    "employee_id": employee_id,
                    "consideration": consideration,
                },
            )

    def test_workspace_persistence_priority_sort_and_candidate_consideration(self) -> None:
        low = self.create_workspace(
            priority="low",
            workspace_name="Workspace Low",
        )
        self.assertEqual(low["target_jabatan"], "Direktur Contoh")
        self.assertEqual(low["date"], "2026-01-15")
        self.assertEqual(low["output_style"], "Single")
        self.create_workspace(priority="high", workspace_name="Workspace High")
        self.create_workspace(priority="med", workspace_name="Workspace Medium")

        workspaces_response = self.client.get("/candidate-preparation/workspaces")
        self.assertEqual(workspaces_response.status_code, 200)
        self.assertEqual(
            [workspace["priority"] for workspace in workspaces_response.json()],
            ["high", "med", "low"],
        )

        response = self.add_candidate(
            str(low["id"]),
            501,
            4,
            "Pengalaman memimpin unit terkait.",
        )
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["sort_order"], 0)

        updated = self.client.put(
            f"/candidate-preparation/workspaces/{low['id']}/candidates/501",
            json={"consideration": "Rekam jejak dan kompetensi."},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["consideration"], "Rekam jejak dan kompetensi.")

        with patch(
            "app.services.candidate_preparation_service.fetch_employee_profiles",
            return_value={501: employee_profile(501, 4)},
        ):
            restored = self.client.get(
                f"/candidate-preparation/workspaces/{low['id']}/candidates",
            )
        self.assertEqual(restored.status_code, 200)
        self.assertEqual(len(restored.json()), 1)
        self.assertEqual(restored.json()[0]["employee_id"], 501)
        self.assertEqual(restored.json()[0]["consideration"], "Rekam jejak dan kompetensi.")
        self.assertEqual(restored.json()[0]["nama"], "Kandidat 501")

    def test_workspace_and_candidate_input_validation(self) -> None:
        invalid_workspace = self.client.post(
            "/candidate-preparation/workspaces",
            json={
                "workspace_name": " ",
                "target_jabatan": "Direktur Contoh",
                "date": "2026-01-15",
                "priority": "urgent",
                "output_style": "Single",
            },
        )
        self.assertEqual(invalid_workspace.status_code, 422)

        workspace = self.create_workspace()
        invalid_candidate = self.client.post(
            f"/candidate-preparation/workspaces/{workspace['id']}/candidates",
            json={"employee_id": 0, "consideration": ""},
        )
        self.assertEqual(invalid_candidate.status_code, 422)

    def test_only_allowed_eselon_ids_can_be_added(self) -> None:
        workspace = self.create_workspace()
        for employee_id, eselon_id in zip((601, 602, 603, 604), (2, 3, 4, 6)):
            with self.subTest(eselon_id=eselon_id):
                response = self.add_candidate(
                    str(workspace["id"]),
                    employee_id,
                    eselon_id,
                )
                self.assertEqual(response.status_code, 201, response.text)

        blocked = self.add_candidate(str(workspace["id"]), 699, 5)
        self.assertEqual(blocked.status_code, 422)
        duplicate = self.add_candidate(str(workspace["id"]), 601, 2)
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(
            self.db.query(CandidatePreparationCandidate)
            .filter_by(workspace_id=workspace["id"])
            .count(),
            4,
        )

    def test_candidate_workspace_is_owner_scoped(self) -> None:
        workspace = self.create_workspace()
        self.user = SimpleNamespace(user="other", auth_level=1, name="Other")

        response = self.client.get(
            f"/candidate-preparation/workspaces/{workspace['id']}/candidates",
        )

        self.assertEqual(response.status_code, 404)

    def test_candidate_menu_requires_authenticated_user_level(self) -> None:
        self.user = SimpleNamespace(user="guest", auth_level=0, name="Guest")

        response = self.client.get("/candidate-preparation/workspaces")

        self.assertEqual(response.status_code, 403)

    def test_staged_candidate_edits_are_persisted_and_used_for_export(self) -> None:
        workspace = self.create_workspace(output_style="Single")
        added = self.add_candidate(str(workspace["id"]), 1301, 4)
        self.assertEqual(added.status_code, 201, added.text)

        staged = {
            "consideration": "Pertimbangan yang ditahapkan.",
            "nip": "nip-edit",
            "nama": "Nama Edit",
            "eselon_id": 4,
            "eselon": "Eselon IV Edit",
            "jabatan": "Jabatan Edit",
            "unit_eselon_ii": "Unit II Edit",
            "unit_eselon_iii": "Unit III Edit",
            "gol": "III/d",
            "pangkat": "Penata",
            "pendidikan": "S1",
            "jurusan": "Keuangan",
            "universitas": "Universitas Edit",
            "tmt_jabatan": "2021-02-01",
            "tanggal_lahir": "01/01/1988",
            "riwayat_jabatan": "Riwayat Edit Satu\nRiwayat Edit Dua",
        }
        with patch(
            "app.services.candidate_preparation_service.fetch_employee_profiles",
            return_value={1301: employee_profile(1301, 4)},
        ):
            updated = self.client.put(
                f"/candidate-preparation/workspaces/{workspace['id']}/candidates/1301",
                json=staged,
            )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["nama"], "Nama Edit")

        live_profile = employee_profile(
            1301,
            4,
            nama="Nama Database Lama",
            nip="nip-database",
            jabatan="Jabatan Database",
        )
        with patch(
            "app.services.candidate_preparation_service.fetch_employee_profiles",
            return_value={1301: live_profile},
        ):
            response = self.client.post(
                f"/candidate-preparation/workspaces/{workspace['id']}/export",
            )

        self.assertEqual(response.status_code, 200, response.text)
        presentation = Presentation(BytesIO(response.content))
        slide = presentation.slides[0]
        self.assertEqual(slide_text_by_id(slide, 11), "Nama Edit")
        self.assertIn("Jabatan Edit", slide_text_by_id(slide, 12))
        self.assertIn("Unit II Edit", slide_text_by_id(slide, 12))
        self.assertEqual(slide_text_by_id(slide, 13), "III/d")
        self.assertEqual(
            slide_text_by_id(slide, 20),
            "Pertimbangan yang ditahapkan.",
        )
        self.assertEqual(
            slide_text_by_id(slide, 22),
            "Riwayat Edit Satu\nRiwayat Edit Dua",
        )

    def test_initial_tour_of_duty_snapshot_comes_from_history_table(self) -> None:
        workspace = self.create_workspace(output_style="Single")
        history_profile = employee_profile(
            1302,
            4,
            riwayat_jabatan="Riwayat Pertama\nRiwayat Kedua\nRiwayat Ketiga",
        )
        with patch(
            "app.services.candidate_preparation_service.fetch_employee_profiles",
            return_value={1302: history_profile},
        ) as fetch_profiles:
            added = self.client.post(
                f"/candidate-preparation/workspaces/{workspace['id']}/candidates",
                json={"employee_id": 1302, "consideration": ""},
            )
            self.assertEqual(added.status_code, 201, added.text)
            self.assertTrue(
                fetch_profiles.call_args.kwargs.get("include_history")
            )
            restored = self.client.get(
                f"/candidate-preparation/workspaces/{workspace['id']}/candidates",
            )

        self.assertEqual(restored.status_code, 200, restored.text)
        candidate = restored.json()[0]
        self.assertEqual(
            candidate["riwayat_jabatan"],
            "Riwayat Pertama\nRiwayat Kedua\nRiwayat Ketiga",
        )

        with patch(
            "app.services.candidate_preparation_service.fetch_employee_profiles",
            return_value={1302: history_profile},
        ):
            exported = self.client.post(
                f"/candidate-preparation/workspaces/{workspace['id']}/export",
            )
        self.assertEqual(exported.status_code, 200, exported.text)
        slide = Presentation(BytesIO(exported.content)).slides[0]
        self.assertEqual(
            slide_text_by_id(slide, 22),
            "Riwayat Pertama\nRiwayat Kedua\nRiwayat Ketiga",
        )

    def test_export_revalidates_current_employee_eselon(self) -> None:
        workspace = self.create_workspace()
        added = self.add_candidate(str(workspace["id"]), 701, 4)
        self.assertEqual(added.status_code, 201, added.text)

        with patch(
            "app.services.candidate_preparation_service.fetch_employee_profiles",
            return_value={701: employee_profile(701, 5)},
        ), patch(
            "app.services.candidate_preparation_service.build_single_profile",
        ) as build_profile:
            response = self.client.post(
                f"/candidate-preparation/workspaces/{workspace['id']}/export",
            )

        self.assertEqual(response.status_code, 422)
        build_profile.assert_not_called()

    def test_single_export_is_one_pptx_with_one_slide_per_candidate(self) -> None:
        workspace = self.create_workspace(output_style="Single")
        self.assertEqual(self.add_candidate(str(workspace["id"]), 801, 4).status_code, 201)
        self.assertEqual(self.add_candidate(str(workspace["id"]), 802, 6).status_code, 201)

        with patch(
            "app.services.candidate_preparation_service.fetch_employee_profiles",
            return_value={
                801: employee_profile(801, 4),
                802: employee_profile(802, 6),
            },
        ):
            multiple_response = self.client.post(
                f"/candidate-preparation/workspaces/{workspace['id']}/export",
            )

        self.assertEqual(multiple_response.status_code, 200, multiple_response.text)
        self.assertTrue(
            multiple_response.headers["content-type"].startswith(
                candidate_service.POWERPOINT_MEDIA_TYPE,
            ),
        )
        presentation = Presentation(BytesIO(multiple_response.content))
        self.assertEqual(len(presentation.slides), 2)
        self.assertEqual(slide_text_by_id(presentation.slides[0], 11), "Kandidat 801")
        self.assertEqual(slide_text_by_id(presentation.slides[1], 11), "Kandidat 802")

        removed = self.client.delete(
            f"/candidate-preparation/workspaces/{workspace['id']}/candidates/802",
        )
        self.assertEqual(removed.status_code, 204)
        with patch(
            "app.services.candidate_preparation_service.fetch_employee_profiles",
            return_value={801: employee_profile(801, 4)},
        ):
            single_response = self.client.post(
                f"/candidate-preparation/workspaces/{workspace['id']}/export",
            )

        self.assertEqual(single_response.status_code, 200, single_response.text)
        self.assertTrue(
            single_response.headers["content-type"].startswith(
                candidate_service.POWERPOINT_MEDIA_TYPE,
            ),
        )
        self.assertEqual(len(Presentation(BytesIO(single_response.content)).slides), 1)

    def test_batch_export_returns_one_pptx_with_additional_slides(self) -> None:
        workspace = self.create_workspace(output_style="Batch")
        for employee_id in (901, 902, 903):
            response = self.add_candidate(
                str(workspace["id"]),
                employee_id,
                4,
            )
            self.assertEqual(response.status_code, 201, response.text)

        with patch(
            "app.services.candidate_preparation_service.fetch_employee_profiles",
            return_value={
                employee_id: employee_profile(employee_id, 4)
                for employee_id in (901, 902, 903)
            },
        ):
            response = self.client.post(
                f"/candidate-preparation/workspaces/{workspace['id']}/export",
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(
            response.headers["content-type"].startswith(
                candidate_service.POWERPOINT_MEDIA_TYPE,
            ),
        )
        presentation = Presentation(BytesIO(response.content))
        self.assertEqual(len(presentation.slides), 2)
        self.assertEqual(slide_text_by_id(presentation.slides[1], 39), "Kandidat 903")


class CandidatePreparationTemplateTests(unittest.TestCase):
    def test_employee_profile_lookup_joins_history_by_nip(self) -> None:
        employee_engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        try:
            with employee_engine.begin() as connection:
                connection.exec_driver_sql(
                    "ATTACH DATABASE ':memory:' AS pbncleaner",
                )
                connection.exec_driver_sql(
                    """
                    CREATE TABLE pbncleaner.dt_employee (
                        employee_id INTEGER PRIMARY KEY,
                        NIP TEXT,
                        `Nama Gelar` TEXT,
                        eselon_id INTEGER,
                        `Jabatan` TEXT,
                        `Unit Eselon II` TEXT,
                        `Unit Eselon III` TEXT,
                        `Gol` TEXT,
                        pangkat_id INTEGER,
                        pendidikan_id INTEGER,
                        `Jurusan` TEXT,
                        `Universitas/Sekolah Tinggi` TEXT,
                        `TMT Jabatan` TEXT,
                        `Tanggal Lahir` TEXT
                    )
                    """,
                )
                connection.exec_driver_sql(
                    "CREATE TABLE pbncleaner.ref_eselon (eselon_id INTEGER, value TEXT)",
                )
                connection.exec_driver_sql(
                    "CREATE TABLE pbncleaner.ref_pangkat (pangkat_id INTEGER, value TEXT)",
                )
                connection.exec_driver_sql(
                    "CREATE TABLE pbncleaner.ref_pendidikan_terakhir "
                    "(pendidikan_id INTEGER, value TEXT)",
                )
                connection.exec_driver_sql(
                    "CREATE TABLE pbncleaner.ref_history_jabatan "
                    "(nip TEXT, eselon_id INTEGER, Jabatan TEXT)",
                )
                connection.execute(
                    text(
                        """
                        INSERT INTO pbncleaner.dt_employee VALUES
                        (1201, 'nip-1201', 'Kandidat Query', 4, 'Jabatan Query',
                         'Unit II', 'Unit III', 'IV/a', 7, 2, 'Administrasi',
                         'Universitas Query', '2020-01-15', '15/06/1985')
                        """
                    )
                )
                connection.execute(
                    text("INSERT INTO pbncleaner.ref_eselon VALUES (4, 'Eselon IV')")
                )
                connection.execute(
                    text("INSERT INTO pbncleaner.ref_pangkat VALUES (7, 'Pembina')")
                )
                connection.execute(
                    text(
                        "INSERT INTO pbncleaner.ref_pendidikan_terakhir "
                        "VALUES (2, 'S2')",
                    )
                )
                connection.execute(
                    text(
                        "INSERT INTO pbncleaner.ref_history_jabatan VALUES "
                        "('nip-1201', 4, 'Riwayat sesuai NIP'), "
                        "('other-nip', 4, 'Riwayat pegawai lain')",
                    )
                )

            profiles = candidate_service.fetch_employee_profiles(
                [1201],
                include_history=True,
                database_engine=employee_engine,
            )
        finally:
            employee_engine.dispose()

        self.assertEqual(profiles[1201]["riwayat_jabatan"], "Riwayat sesuai NIP")
        self.assertEqual(profiles[1201]["pangkat"], "Pembina")
        self.assertEqual(profiles[1201]["pendidikan"], "S2")

    def test_single_template_replaces_fields_and_uses_first_three_history_lines(self) -> None:
        candidate = employee_profile(
            901,
            4,
            riwayat_jabatan=(
                "Posisi Satu\n \nPosisi Dua\r\nPosisi Tiga\rPosisi Empat"
            ),
            consideration="Memiliki pengalaman relevan.",
        )

        content = candidate_service.build_single_profile(
            "Direktur Tujuan",
            candidate,
            today=date(2026, 1, 1),
        )
        slide = Presentation(BytesIO(content)).slides[0]

        self.assertIn("Direktur Tujuan", slide_text_by_id(slide, 8))
        self.assertEqual(slide_text_by_id(slide, 11), "Kandidat 901")
        self.assertIn("Jabatan 901", slide_text_by_id(slide, 12))
        self.assertIn("Unit Eselon III: Subdirektorat B", slide_text_by_id(slide, 12))
        self.assertIn("Unit Eselon II: Direktorat A", slide_text_by_id(slide, 12))
        self.assertEqual(slide_text_by_id(slide, 13), "IV/a")
        self.assertIn("S2", slide_text_by_id(slide, 17))
        self.assertIn("Administrasi Publik", slide_text_by_id(slide, 17))
        self.assertIn("Universitas Contoh", slide_text_by_id(slide, 17))
        self.assertEqual(
            slide_text_by_id(slide, 20),
            "Memiliki pengalaman relevan.",
        )
        self.assertEqual(
            slide_text_by_id(slide, 22),
            "Posisi Satu\nPosisi Dua\nPosisi Tiga",
        )

    def test_single_template_position_details_follow_confirmed_eselon_rules(self) -> None:
        for eselon_id, expected_units in (
            (4, ("Unit Eselon III", "Unit Eselon II")),
            (6, ("Unit Eselon III", "Unit Eselon II")),
            (3, ("Unit Eselon II",)),
            (2, ()),
        ):
            with self.subTest(eselon_id=eselon_id):
                slide = Presentation(
                    BytesIO(
                        candidate_service.build_single_profile(
                            "Target",
                            employee_profile(eselon_id, eselon_id),
                        )
                    )
                ).slides[0]
                details = slide_text_by_id(slide, 12)
                for unit in ("Unit Eselon II", "Unit Eselon III"):
                    self.assertEqual(unit in details, unit in expected_units)

    def test_batch_template_places_two_candidates_per_slide_in_order(self) -> None:
        candidates = [
            employee_profile(
                1001,
                4,
                nama="Kandidat Batch 1",
                consideration="Pertimbangan satu.",
                tmt_jabatan=date(2020, 1, 15),
                tanggal_lahir="15/06/1985",
            ),
            employee_profile(
                1002,
                6,
                nama="Kandidat Batch 2",
                consideration="Pertimbangan dua.",
            ),
        ]

        content = candidate_service.build_batch_profiles(
            "Direktur Batch",
            candidates,
            today=date(2026, 1, 1),
        )
        presentation = Presentation(BytesIO(content))

        self.assertEqual(len(presentation.slides), 1)
        slide = presentation.slides[0]
        self.assertIn("Direktur Batch", slide_text_by_id(slide, 8))
        self.assertEqual(slide_text_by_id(slide, 39), "Kandidat Batch 1")
        self.assertEqual(slide_text_by_id(slide, 82), "Kandidat Batch 2")
        self.assertEqual(slide_text_by_id(slide, 41), "Jabatan 1001")
        self.assertIn("Masa Kerja: 5 Tahun 11 Bulan", slide_text_by_id(slide, 44))
        self.assertIn("Masa Kerja:", slide_text_by_id(slide, 88))
        self.assertIn("Pembina", slide_text_by_id(slide, 73))
        self.assertIn("IV/a", slide_text_by_id(slide, 73))
        self.assertIn("40 Tahun 6 Bulan", slide_text_by_id(slide, 79))
        self.assertIn("Administrasi Publik", slide_text_by_id(slide, 48))
        self.assertIn("Universitas Contoh", slide_text_by_id(slide, 48))
        self.assertIn("Pertimbangan satu.", slide_text_by_id(slide, 48))
        self.assertEqual(slide_text_by_id(slide, 80), "1")
        self.assertEqual(slide_text_by_id(slide, 99), "2")

    def test_batch_template_duplicates_slides_and_keeps_candidate_order(self) -> None:
        candidates = [
            employee_profile(1100 + index, 4, nama=f"Urutan {index}")
            for index in range(1, 6)
        ]

        content = candidate_service.build_batch_profiles(
            "Target",
            candidates,
            today=date(2026, 1, 1),
        )
        presentation = Presentation(BytesIO(content))

        self.assertEqual(len(presentation.slides), 3)
        expected_names = (
            ("Urutan 1", "Urutan 2"),
            ("Urutan 3", "Urutan 4"),
            ("Urutan 5", ""),
        )
        for slide, names in zip(presentation.slides, expected_names):
            self.assertEqual(
                (
                    slide_text_by_id(slide, 39),
                    slide_text_by_id(slide, 82),
                ),
                names,
            )
        self.assertEqual(slide_text_by_id(presentation.slides[2], 83), "")


if __name__ == "__main__":
    unittest.main()
