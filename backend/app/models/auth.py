import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.history_db import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "auth_level IN (1, 2, 3, 4)",
            name="chk_users_auth_level",
        ),
    )

    user: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    auth_level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )
    sessions: Mapped[list["UserSession"]] = relationship(
        back_populates="account",
        cascade="all, delete-orphan",
    )


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username: Mapped[str] = mapped_column(
        "user",
        String(80),
        ForeignKey("users.user", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    account: Mapped[User] = relationship(back_populates="sessions")


class UserPreference(Base):
    __tablename__ = "user_preferences"

    username: Mapped[str] = mapped_column(
        "user",
        String(80),
        ForeignKey("users.user", ondelete="CASCADE"),
        primary_key=True,
    )
    theme: Mapped[str] = mapped_column(String(10), nullable=False, default="default")
