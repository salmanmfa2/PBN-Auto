import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class User:
    username: str
    password_hash: str
    role: str = "user"
    status: str = "pending"
    is_active: bool = True
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    approved_at: datetime | None = None
    approved_by: str | None = None
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    sessions: list["UserSession"] = field(default_factory=list)


@dataclass
class UserSession:
    user_id: str
    token_hash: str
    expires_at: datetime
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    revoked_at: datetime | None = None
    user: User | None = None