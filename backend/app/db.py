import os
from typing import Generator, Any


DATABASE_URL = os.getenv("DATABASE_URL", "")


class InMemorySession:
    def __init__(self) -> None:
        self.users: dict[str, Any] = {}
        self.sessions: dict[str, Any] = {}

    def add(self, obj: Any) -> None:
        if hasattr(obj, "id") and getattr(obj, "id", None):
            if obj.__class__.__name__ == "User":
                self.users[obj.id] = obj
            elif obj.__class__.__name__ == "UserSession":
                self.sessions[obj.id] = obj

    def get(self, model: type, object_id: str) -> Any | None:
        if model.__name__ == "User":
            return self.users.get(object_id)
        if model.__name__ == "UserSession":
            return self.sessions.get(object_id)
        return None

    def commit(self) -> None:
        return None

    def refresh(self, obj: Any) -> None:
        return None

    def close(self) -> None:
        return None

    def __enter__(self) -> "InMemorySession":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        self.close()
        return False


DB_SESSION = InMemorySession()


def get_db() -> Generator[InMemorySession, None, None]:
    yield DB_SESSION


def init_db() -> None:
    from app.services.auth_service import ensure_superuser

    ensure_superuser(DB_SESSION)