from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException

from app.db import InMemorySession, get_db
from app.models.auth import User
from app.schemas.auth import AuthResponse, LoginRequest, MessageResponse, RegisterRequest, UserRead
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])
admin_router = APIRouter(prefix="/admin", tags=["admin"])


def _extract_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authentication is required.")
    return authorization.split(" ", 1)[1].strip()


def get_current_user(
    authorization: str | None = Header(default=None),
    db: InMemorySession = Depends(get_db),
) -> User:
    token = _extract_token(authorization)
    user = auth_service.get_user_by_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Session expired or invalid. Please sign in again.")
    return user


def get_superuser(user: User = Depends(get_current_user)) -> User:
    if user.role != "superuser":
        raise HTTPException(status_code=403, detail="Superuser privileges are required.")
    return user


@router.post("/register", response_model=UserRead)
def register(req: RegisterRequest, db: InMemorySession = Depends(get_db)):
    try:
        return auth_service.create_user(db, req.username, req.password)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, db: InMemorySession = Depends(get_db)):
    try:
        user = auth_service.authenticate(db, req.username, req.password)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    return {"token": auth_service.create_session(db, user), "user": user}


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/logout", response_model=MessageResponse)
def logout(authorization: str | None = Header(default=None), db: InMemorySession = Depends(get_db)):
    token = _extract_token(authorization)
    auth_service.revoke_session(db, token)
    return {"message": "Signed out."}


@admin_router.get("/users/pending", response_model=list[UserRead])
def pending_users(_: User = Depends(get_superuser), db: InMemorySession = Depends(get_db)):
    pending_users = [user for user in db.users.values() if user.status == "pending"]
    pending_users.sort(key=lambda user: user.created_at)
    return pending_users


@admin_router.post("/users/{user_id}/approve", response_model=UserRead)
def approve_user(user_id: str, superuser: User = Depends(get_superuser), db: InMemorySession = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.role == "superuser":
        raise HTTPException(status_code=422, detail="Superuser accounts do not need approval.")
    user.status = "approved"
    user.is_active = True
    user.approved_at = datetime.now(timezone.utc)
    user.approved_by = superuser.id
    db.commit()
    return user


@admin_router.post("/users/{user_id}/reject", response_model=UserRead)
def reject_user(user_id: str, _: User = Depends(get_superuser), db: InMemorySession = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.role == "superuser":
        raise HTTPException(status_code=422, detail="Superuser accounts cannot be rejected.")
    user.status = "rejected"
    user.is_active = False
    db.commit()
    return user