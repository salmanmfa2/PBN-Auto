import unittest

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from app.history_db import _auth_level_constraint_is_current, _migrate_auth_level_role


class AuthLevelMigrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        with self.engine.begin() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys = ON")
            connection.exec_driver_sql(
                "CREATE TABLE users ("
                "user VARCHAR(80) PRIMARY KEY, "
                "name VARCHAR(200) NOT NULL, "
                "auth_level INTEGER NOT NULL CHECK ("
                "auth_level IN (1, 2, 3) OR "
                "(auth_level = 4 AND user = 'salmanmfa')), "
                "password VARCHAR(255) NOT NULL, "
                "is_active BOOLEAN NOT NULL, "
                "created_at DATETIME NOT NULL)"
            )
            connection.exec_driver_sql(
                "INSERT INTO users "
                "(user, name, auth_level, password, is_active, created_at) "
                "VALUES ('salmanmfa', 'Salman', 3, 'password', 1, '2026-01-01 00:00:00')"
            )
            connection.exec_driver_sql(
                "CREATE TABLE user_sessions ("
                "id VARCHAR(36) PRIMARY KEY, "
                "user VARCHAR(80) NOT NULL REFERENCES users(user) ON DELETE CASCADE, "
                "token_hash VARCHAR(64) NOT NULL UNIQUE, "
                "expires_at DATETIME NOT NULL, "
                "created_at DATETIME NOT NULL, "
                "revoked_at DATETIME)"
            )
            connection.exec_driver_sql(
                "CREATE TABLE user_preferences ("
                "user VARCHAR(80) PRIMARY KEY REFERENCES users(user) ON DELETE CASCADE, "
                "theme VARCHAR(10) NOT NULL)"
            )
            connection.exec_driver_sql(
                "INSERT INTO user_sessions "
                "(id, user, token_hash, expires_at, created_at) "
                "VALUES ('session-1', 'salmanmfa', 'hash', "
                "'2026-01-02 00:00:00', '2026-01-01 00:00:00')"
            )
            connection.exec_driver_sql(
                "INSERT INTO user_preferences (user, theme) VALUES ('salmanmfa', 'dark')"
            )

    def tearDown(self) -> None:
        self.engine.dispose()

    def test_sqlite_migration_promotes_account_and_preserves_foreign_key_rows(self) -> None:
        _migrate_auth_level_role(self.engine)

        with self.engine.connect() as connection:
            owner = connection.execute(
                text("SELECT user, auth_level FROM users WHERE user = 'salmanmfa'")
            ).one()
            session = connection.execute(
                text("SELECT id, user FROM user_sessions")
            ).one()
            preference = connection.execute(
                text("SELECT user, theme FROM user_preferences")
            ).one()
            foreign_key_violations = connection.exec_driver_sql(
                "PRAGMA foreign_key_check"
            ).all()
            foreign_keys_enabled = connection.exec_driver_sql(
                "PRAGMA foreign_keys"
            ).scalar_one()

        self.assertEqual(owner, ("salmanmfa", 4))
        self.assertEqual(session, ("session-1", "salmanmfa"))
        self.assertEqual(preference, ("salmanmfa", "dark"))
        self.assertEqual(foreign_key_violations, [])
        self.assertEqual(foreign_keys_enabled, 1)

        checks = inspect(self.engine).get_check_constraints("users")
        auth_constraint = next(
            check["sqltext"]
            for check in checks
            if "auth_level" in (check["sqltext"] or "")
        )
        self.assertTrue(_auth_level_constraint_is_current(auth_constraint))
        self.assertFalse(
            _auth_level_constraint_is_current(
                "auth_level IN (1, 2, 3, 4) OR "
                "(auth_level = 4 AND user = 'salmanmfa')"
            )
        )
        _migrate_auth_level_role(self.engine)

        with self.engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO users "
                    "(user, name, auth_level, password, is_active, created_at) "
                    "VALUES ('another', 'Another', 4, 'password', 1, '2026-01-01 00:00:00')"
                )
            )

        with self.assertRaises(IntegrityError):
            with self.engine.begin() as connection:
                connection.execute(
                    text(
                        "INSERT INTO users "
                        "(user, name, auth_level, password, is_active, created_at) "
                        "VALUES ('invalid', 'Invalid', 5, 'password', 1, '2026-01-01 00:00:00')"
                    )
                )


if __name__ == "__main__":
    unittest.main()
