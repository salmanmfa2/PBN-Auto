import unittest
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.auth import create_managed_user, get_god_user, get_super_admin, update_managed_user
from app.history_db import Base
from app.models.auth import User, UserPreference, UserSession
from app.schemas.auth import AdminUserCreate, AdminUserUpdate, ThemePreferenceUpdate
from app.services import auth_service


class AuthServiceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(
            self.engine,
            tables=[User.__table__, UserSession.__table__, UserPreference.__table__],
        )
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_create_user_stores_selected_fields_and_auth_level(self):
        user = auth_service.create_user(
            self.db,
            "  Alice  ",
            "Alice Example",
            "plain-password",
        )

        self.assertEqual(user.user, "alice")
        self.assertEqual(user.name, "Alice Example")
        self.assertEqual(user.auth_level, 1)
        self.assertEqual(user.password, "plain-password")
        self.assertTrue(user.is_active)

    def test_authenticate_requires_exact_password_and_active_account(self):
        account = auth_service.create_user(self.db, "alice", "Alice", "plain-password")

        with self.assertRaises(ValueError):
            auth_service.authenticate(self.db, "alice", "incorrect")
        self.assertEqual(
            auth_service.authenticate(self.db, "ALICE", "plain-password").user,
            account.user,
        )

        account.is_active = False
        self.db.commit()
        with self.assertRaises(PermissionError):
            auth_service.authenticate(self.db, "alice", "plain-password")

    def test_sessions_are_persisted_and_revocable(self):
        account = auth_service.create_user(self.db, "alice", "Alice", "plain-password")
        before_creation = datetime.now(timezone.utc).replace(tzinfo=None)
        token = auth_service.create_session(self.db, account)
        after_creation = datetime.now(timezone.utc).replace(tzinfo=None)

        self.assertEqual(auth_service.get_user_by_token(self.db, token).user, "alice")
        session = self.db.query(UserSession).filter_by(username="alice").one()
        self.assertGreaterEqual(session.expires_at, before_creation + timedelta(hours=1))
        self.assertLessEqual(session.expires_at, after_creation + timedelta(hours=1))
        auth_service.revoke_session(self.db, token)
        self.assertIsNone(auth_service.get_user_by_token(self.db, token))

    def test_expired_session_is_rejected(self):
        account = auth_service.create_user(self.db, "alice", "Alice", "plain-password")
        token = auth_service.create_session(self.db, account)
        session = self.db.query(UserSession).filter_by(username="alice").one()
        session.expires_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=1)
        self.db.commit()

        self.assertIsNone(auth_service.get_user_by_token(self.db, token))

    def test_existing_long_session_is_capped_at_one_hour_from_creation(self):
        account = auth_service.create_user(self.db, "alice", "Alice", "plain-password")
        token = auth_service.create_session(self.db, account)
        session = self.db.query(UserSession).filter_by(username="alice").one()
        session.created_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=2)
        session.expires_at = session.created_at + timedelta(days=7)
        self.db.commit()

        self.assertIsNone(auth_service.get_user_by_token(self.db, token))

    def test_super_admin_count_includes_active_super_admin_and_god_user_accounts(self):
        auth_service.create_user(self.db, "super", "Super Admin", "pw", auth_level=3)
        auth_service.create_user(self.db, "salmanmfa", "God User", "pw", auth_level=4)
        auth_service.create_user(self.db, "admin", "Admin", "pw", auth_level=2)
        self.assertEqual(auth_service.active_superuser_count(self.db), 2)

        super_admin = self.db.get(User, "super")
        super_admin.is_active = False
        self.db.commit()
        self.assertEqual(auth_service.active_superuser_count(self.db), 1)

    def test_super_admin_and_any_level_four_account_pass_role_dependencies(self):
        admin = auth_service.create_user(self.db, "admin", "Admin", "pw", auth_level=2)
        super_admin = auth_service.create_user(self.db, "super", "Super Admin", "pw", auth_level=3)
        god_user = auth_service.create_user(
            self.db,
            "salmanmfa",
            "God User",
            "pw",
            auth_level=4,
        )

        with self.assertRaises(HTTPException) as error:
            get_super_admin(admin)
        self.assertEqual(error.exception.status_code, 403)
        self.assertIs(get_super_admin(super_admin), super_admin)
        self.assertIs(get_super_admin(god_user), god_user)
        with self.assertRaises(HTTPException) as error:
            get_god_user(super_admin)
        self.assertEqual(error.exception.status_code, 403)

        another_level_four = type("User", (), {"auth_level": 4, "user": "another"})()
        self.assertIs(get_super_admin(another_level_four), another_level_four)
        self.assertIs(get_god_user(another_level_four), another_level_four)

    def test_auth_level_four_is_available_for_any_username(self):
        account = auth_service.create_user(self.db, "another", "Another", "pw", auth_level=4)
        self.assertEqual(account.auth_level, 4)

    def test_managed_user_creation_accepts_level_four(self):
        request = AdminUserCreate(
                user="another",
                name="Another",
                password="password",
                auth_level=4,
            )

        self.assertEqual(request.auth_level, 4)

    def test_only_level_four_admin_can_assign_level_four(self):
        super_admin = auth_service.create_user(self.db, "super", "Super Admin", "pw", auth_level=3)
        god_user = auth_service.create_user(self.db, "god", "God User", "pw", auth_level=4)
        request = AdminUserCreate(
            user="another",
            name="Another",
            password="pass",
            auth_level=4,
        )

        with self.assertRaises(HTTPException) as error:
            create_managed_user(request, super_admin, self.db)
        self.assertEqual(error.exception.status_code, 403)

        created = create_managed_user(request, god_user, self.db)
        self.assertEqual(created.auth_level, 4)

    def test_super_admin_cannot_demote_or_deactivate_their_own_account(self):
        super_admin = auth_service.create_user(self.db, "super", "Super Admin", "pw", auth_level=3)

        with self.assertRaises(HTTPException) as error:
            update_managed_user(
                "super",
                AdminUserUpdate(name="Super Admin", auth_level=2, is_active=True),
                super_admin,
                self.db,
            )
        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(self.db.get(User, "super").auth_level, 3)

    def test_only_level_four_admin_can_manage_level_four_account(self):
        auth_service.create_user(self.db, "super", "Super Admin", "pw", auth_level=3)
        god_user = auth_service.create_user(
            self.db,
            "god",
            "God User",
            "pw",
            auth_level=4,
        )
        request = AdminUserUpdate(name="God User", auth_level=4, is_active=True)

        with self.assertRaises(HTTPException) as error:
            update_managed_user("god", request, self.db.get(User, "super"), self.db)
        self.assertEqual(error.exception.status_code, 403)

        with self.assertRaises(HTTPException) as error:
            update_managed_user(
                "god",
                AdminUserUpdate(name="God User", auth_level=3, is_active=True),
                god_user,
                self.db,
            )
        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(self.db.get(User, "god").auth_level, 4)

    def test_theme_preference_is_per_user_and_defaults_to_default(self):
        auth_service.create_user(self.db, "alice", "Alice", "pw")
        auth_service.create_user(self.db, "bob", "Bob", "pw")

        self.assertEqual(auth_service.get_theme_preference(self.db, "alice"), "default")
        self.assertEqual(auth_service.get_theme_preference(self.db, "bob"), "default")

        auth_service.set_theme_preference(self.db, "alice", "light")

        self.assertEqual(auth_service.get_theme_preference(self.db, "alice"), "light")
        self.assertEqual(auth_service.get_theme_preference(self.db, "bob"), "default")
        auth_service.set_theme_preference(self.db, "alice", "dark")
        self.assertEqual(auth_service.get_theme_preference(self.db, "alice"), "dark")

    def test_theme_preference_accepts_only_supported_modes(self):
        for theme in ("default", "dark", "light"):
            self.assertEqual(ThemePreferenceUpdate(theme=theme).theme, theme)

        with self.assertRaises(ValidationError):
            ThemePreferenceUpdate.model_validate({"theme": "system"})


if __name__ == "__main__":
    unittest.main()
