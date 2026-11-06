import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, joinedload

from app.models.auth import User, UserPreference, UserSession


SESSION_HOURS = 1


def _normalize_username(username: str) -> str:
    return username.strip().lower()


def _find_user(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(User.user == _normalize_username(username)))


def create_user(
    db: Session,
    username: str,
    name: str,
    password: str,
    auth_level: int = 1,
) -> User:
    normalized_user = _normalize_username(username)
    if not normalized_user:
        raise ValueError("User is required.")
    if db.get(User, normalized_user) is not None:
        raise ValueError("User is already registered.")

    account = User(
        user=normalized_user,
        name=name.strip(),
        auth_level=auth_level,
        password=password,
        is_active=True,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def authenticate(db: Session, username: str, password: str) -> User:
    account = _find_user(db, username)
    if not account or not hmac.compare_digest(
        account.password.encode("utf-8"),
        password.encode("utf-8"),
    ):
        raise ValueError("Invalid user or password.")
    if not account.is_active:
        raise PermissionError("This account is inactive.")
    return account


def create_session(db: Session, account: User) -> str:
    token = secrets.token_urlsafe(32)
    session = UserSession(
        username=account.user,
        token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=SESSION_HOURS),
    )
    db.add(session)
    db.commit()
    return token


def get_user_by_token(db: Session, token: str) -> User | None:
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    session = db.scalar(
        select(UserSession)
        .options(joinedload(UserSession.account))
        .where(UserSession.token_hash == token_hash)
    )
    if not session or session.revoked_at is not None:
        return None

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    effective_expiration = min(
        session.expires_at,
        session.created_at + timedelta(hours=SESSION_HOURS),
    )
    if effective_expiration <= now or not session.account.is_active:
        return None
    return session.account


def revoke_session(db: Session, token: str) -> None:
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    session = db.scalar(select(UserSession).where(UserSession.token_hash == token_hash))
    if session and session.revoked_at is None:
        session.revoked_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()


def revoke_user_sessions(db: Session, username: str) -> None:
    db.execute(
        update(UserSession)
        .where(UserSession.username == username, UserSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc).replace(tzinfo=None))
    )
    db.commit()


def active_superuser_count(db: Session) -> int:
    return db.scalar(
        select(func.count())
        .select_from(User)
        .where(User.auth_level == 3, User.is_active.is_(True))
    ) or 0


def get_theme_preference(db: Session, username: str) -> str:
    preference = db.get(UserPreference, username)
    return preference.theme if preference else "default"


def set_theme_preference(db: Session, username: str, theme: str) -> str:
    preference = db.get(UserPreference, username)
    if preference is None:
        preference = UserPreference(username=username, theme=theme)
        db.add(preference)
    else:
        preference.theme = theme
    db.commit()
    return preference.theme
