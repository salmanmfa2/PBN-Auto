import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from app.db import InMemorySession
from app.models.auth import User, UserSession


SUPERUSER_USERNAME = os.getenv("SUPERUSER_USERNAME", "salman")
SUPERUSER_PASSWORD = os.getenv("SUPERUSER_PASSWORD", "loki")
SESSION_DAYS = int(os.getenv("SESSION_DAYS", "7"))


def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return f"pbkdf2_sha256${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, salt_hex, _ = stored_hash.split("$", 2)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    expected = _hash_password(password, bytes.fromhex(salt_hex))
    return hmac.compare_digest(expected, stored_hash)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _find_user(db: InMemorySession, username: str) -> User | None:
    return next((user for user in db.users.values() if user.username == username), None)


def ensure_superuser(db: InMemorySession) -> None:
    existing = _find_user(db, SUPERUSER_USERNAME)
    if existing:
        changed = False
        if existing.role != "superuser":
            existing.role = "superuser"
            changed = True
        if existing.status != "approved":
            existing.status = "approved"
            existing.approved_at = datetime.now(timezone.utc)
            changed = True
        if not existing.is_active:
            existing.is_active = True
            changed = True
        if changed:
            db.commit()
        return

    db.add(
        User(
            username=SUPERUSER_USERNAME,
            password_hash=_hash_password(SUPERUSER_PASSWORD),
            role="superuser",
            status="approved",
            is_active=True,
            approved_at=datetime.now(timezone.utc),
        )
    )
    db.commit()


def create_user(db: InMemorySession, username: str, password: str) -> User:
    normalized = username.strip().lower()
    if not normalized:
        raise ValueError("Username is required.")
    existing = _find_user(db, normalized)
    if existing:
        raise ValueError("Username is already registered.")

    user = User(username=normalized, password_hash=_hash_password(password), status="pending", role="user")
    db.add(user)
    db.commit()
    return user


def authenticate(db: InMemorySession, username: str, password: str) -> User:
    user = _find_user(db, username.strip().lower())
    if not user or not verify_password(password, user.password_hash):
        raise ValueError("Invalid username or password.")
    if not user.is_active:
        raise PermissionError("This user is inactive.")
    if user.status != "approved":
        raise PermissionError("This user is waiting for superuser approval.")
    return user


def create_session(db: InMemorySession, user: User) -> str:
    token = secrets.token_urlsafe(32)
    session = UserSession(
        user_id=user.id,
        token_hash=hash_token(token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS),
    )
    session.user = user
    user.sessions.append(session)
    db.add(session)
    db.commit()
    return token


def get_user_by_token(db: InMemorySession, token: str) -> User | None:
    session = next(
        (entry for entry in db.sessions.values() if entry.token_hash == hash_token(token)),
        None,
    )
    if not session or session.revoked_at is not None:
        return None
    now = datetime.now(timezone.utc)
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= now:
        return None
    return session.user


def revoke_session(db: InMemorySession, token: str) -> None:
    session = next(
        (entry for entry in db.sessions.values() if entry.token_hash == hash_token(token)),
        None,
    )
    if session and session.revoked_at is None:
        session.revoked_at = datetime.now(timezone.utc)
        db.commit()