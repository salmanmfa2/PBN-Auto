import unittest
from types import SimpleNamespace

from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

from app.api.auth import get_current_user, get_optional_current_user
from app.api.menu_access import _request_action, require_menu_access
from app.history_db import Base, get_history_db
from app.models.menu_access import MenuAccessPolicy
from app.services import menu_access_service
from main import app


class MenuAccessTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine, tables=[MenuAccessPolicy.__table__])
        self.db = Session(self.engine)
        self.user = SimpleNamespace(auth_level=0, user="guest", name="Guest")

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

    def settings_payload(self) -> dict[str, list[dict[str, int | str]]]:
        return {
            "policies": menu_access_service.get_menu_access_settings(self.db),
        }

    def test_public_settings_return_default_policy_for_all_menus(self) -> None:
        response = self.client.get("/menu-access")

        self.assertEqual(response.status_code, 200)
        policies = response.json()["policies"]
        self.assertEqual(
            [policy["menu_key"] for policy in policies],
            list(menu_access_service.MENU_KEYS),
        )
        admin_policy = next(policy for policy in policies if policy["menu_key"] == "admin")
        self.assertEqual(admin_policy["view_level"], 3)
        self.assertEqual(admin_policy["edit_level"], 3)

    def test_only_god_user_can_persist_menu_policies(self) -> None:
        self.user.auth_level = 3
        denied = self.client.put("/menu-access", json=self.settings_payload())
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(self.db.query(MenuAccessPolicy).count(), 0)

        self.user.auth_level = 4
        payload = self.settings_payload()
        payload["policies"][0]["view_level"] = 1
        payload["policies"][0]["edit_level"] = 1
        saved = self.client.put("/menu-access", json=payload)

        self.assertEqual(saved.status_code, 200)
        self.assertEqual(self.db.get(MenuAccessPolicy, "analytics").view_level, 1)
        self.assertEqual(self.db.get(MenuAccessPolicy, "analytics").edit_level, 1)

    def test_invalid_policy_updates_are_rejected_without_persisting(self) -> None:
        self.user.auth_level = 4
        payload = self.settings_payload()
        performance_policy = next(
            policy
            for policy in payload["policies"]
            if policy["menu_key"] == "analisis-kinerja"
        )
        performance_policy["view_level"] = 2
        performance_policy["edit_level"] = 1

        response = self.client.put("/menu-access", json=payload)

        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.db.query(MenuAccessPolicy).count(), 0)

    def test_menu_dependency_enforces_threshold_and_allows_god_user(self) -> None:
        self.db.add(
            MenuAccessPolicy(menu_key="admin", view_level=3, edit_level=3)
        )
        self.db.commit()
        check_view_access = require_menu_access("admin", "view")
        request = Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/admin",
                "headers": [],
            }
        )

        with self.assertRaises(HTTPException) as error:
            check_view_access(request, self.db, SimpleNamespace(auth_level=2))
        self.assertEqual(error.exception.status_code, 403)
        self.assertIsNone(
            check_view_access(request, self.db, SimpleNamespace(auth_level=4))
        )

    def test_stored_dataset_restore_is_a_view_action(self) -> None:
        request = Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/stored-datasets/123/restore",
                "headers": [],
            }
        )

        self.assertEqual(_request_action(request), "view")
