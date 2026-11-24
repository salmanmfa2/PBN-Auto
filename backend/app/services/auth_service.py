import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from pwdlib import PasswordHash
from pwdlib.exceptions import HashVerificationError, UnknownHashError
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, joinedload

from app.models.auth import User, UserPreference, UserSession

SESSION_HOURS = 2
password_hash = PasswordHash.recommended()
DUMMY_HASH = password_hash.hash("dummy-password-for-timing-protection")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _normalize_username(username: str) -> str:
    return username.strip().lower()


def _find_user(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(User.user == _normalize_username(username)))


def hash_password(password: str) -> str:
    return password_hash.hash(password)


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
    if any(character.isspace() for character in normalized_user):
        raise ValueError("Username must not contain spaces.")
    if _find_user(db, normalized_user) is not None:
        raise ValueError("User is already registered.")

    account = User(
        user=normalized_user,
        name=name.strip(),
        auth_level=auth_level,
        password=password_hash.hash(password),
        is_active=True,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def authenticate(db: Session, username: str, password: str) -> User:
    account = _find_user(db, username)
    if account is None:
        password_hash.verify(password, DUMMY_HASH)
        raise ValueError("Invalid user or password.")

    replacement_hash = None
    try:
        verified, replacement_hash = password_hash.verify_and_update(
            password,
            account.password,
        )
    except UnknownHashError:
        password_hash.verify(password, DUMMY_HASH)
        verified = hmac.compare_digest(
            password.encode("utf-8"),
            account.password.encode("utf-8"),
        )
        if verified:
            replacement_hash = hash_password(password)
    except HashVerificationError:
        verified = False

    if not verified:
        raise ValueError("Invalid user or password.")
    if not account.is_active:
        raise PermissionError("This account is inactive.")
    if replacement_hash is not None:
        account.password = replacement_hash
        db.commit()
    return account


def create_session(db: Session, account: User) -> str:
    token = secrets.token_urlsafe(32)
    session = UserSession(
        username=account.user,
        token_hash=_hash_token(token),
        expires_at=_utcnow() + timedelta(hours=SESSION_HOURS),
    )
    db.add(session)
    db.commit()
    return token


def get_user_by_token(db: Session, token: str) -> User | None:
    session = db.scalar(
        select(UserSession)
        .options(joinedload(UserSession.account))
        .where(UserSession.token_hash == _hash_token(token))
    )
    if not session or session.revoked_at is not None:
        return None
    effective_expiration = min(
        session.expires_at,
        session.created_at + timedelta(hours=SESSION_HOURS),
    )
    if effective_expiration <= _utcnow() or not session.account.is_active:
        return None
    return session.account


def revoke_session(db: Session, token: str) -> None:
    session = db.scalar(
        select(UserSession).where(UserSession.token_hash == _hash_token(token))
    )
    if session and session.revoked_at is None:
        session.revoked_at = _utcnow()
        db.commit()


def get_session_expiration(db: Session, token: str) -> datetime | None:
    session = db.scalar(
        select(UserSession)
        .options(joinedload(UserSession.account))
        .where(UserSession.token_hash == _hash_token(token))
    )
    if not session or session.revoked_at is not None:
        return None
    effective_expiration = min(
        session.expires_at,
        session.created_at + timedelta(hours=SESSION_HOURS),
    )
    if effective_expiration <= _utcnow() or not session.account.is_active:
        return None
    return effective_expiration


def refresh_session(db: Session, token: str) -> tuple[str, datetime, User] | None:
    session = db.scalar(
        select(UserSession)
        .options(joinedload(UserSession.account))
        .where(UserSession.token_hash == _hash_token(token))
    )
    if not session or session.revoked_at is not None:
        return None
    effective_expiration = min(
        session.expires_at,
        session.created_at + timedelta(hours=SESSION_HOURS),
    )
    if effective_expiration <= _utcnow() or not session.account.is_active:
        return None

    session.revoked_at = _utcnow()
    new_token = create_session(db, session.account)
    db.commit()
    new_session = db.scalar(
        select(UserSession)
        .where(UserSession.token_hash == _hash_token(new_token))
    )
    if new_session is None:
        return None
    return new_token, new_session.expires_at, session.account


def revoke_user_sessions(db: Session, username: str) -> None:
    normalized_user = _normalize_username(username)
    db.execute(
        update(UserSession)
        .where(UserSession.username == normalized_user, UserSession.revoked_at.is_(None))
        .values(revoked_at=_utcnow())
    )
    db.commit()


def active_superuser_count(db: Session) -> int:
    return db.scalar(
        select(func.count())
        .select_from(User)
        .where(User.auth_level >= 3, User.is_active.is_(True))
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


def get_landing_ui_preference(db: Session, username: str) -> str:
    preference = db.get(UserPreference, username)
    return preference.landing_ui if preference else "legacy"


def set_landing_ui_preference(db: Session, username: str, landing_ui: str) -> str:
    preference = db.get(UserPreference, username)
    if preference is None:
        preference = UserPreference(
            username=username,
            theme="default",
            landing_ui=landing_ui,
        )
        db.add(preference)
    else:
        preference.landing_ui = landing_ui
    db.commit()
    return preference.landing_ui