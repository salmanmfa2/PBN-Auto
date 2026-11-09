from fastapi import APIRouter, Depends, File, Header, HTTPException, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.history_db import get_history_db
from app.models.auth import User
from app.schemas.auth import (
    AdminUserCreate,
    AdminUserUpdate,
    AuthResponse,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ThemePreferenceRead,
    ThemePreferenceUpdate,
    UserRead,
)
from app.services import auth_service
from app.services import pbnopen_import_service


router = APIRouter(prefix="/auth", tags=["auth"])
admin_router = APIRouter(prefix="/admin", tags=["admin"])
MAX_PBNOPEN_CSV_SIZE = 50 * 1024 * 1024


def _extract_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authentication is required.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Authentication is required.")
    return token


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_history_db),
) -> User:
    token = _extract_token(authorization)
    user = auth_service.get_user_by_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Session expired or invalid. Please sign in again.")
    return user


def get_admin_user(user: User = Depends(get_current_user)) -> User:
    if user.auth_level < 2:
        raise HTTPException(status_code=403, detail="Admin privileges are required.")
    return user


def get_super_admin(user: User = Depends(get_current_user)) -> User:
    if user.auth_level != 3:
        raise HTTPException(status_code=403, detail="Super Admin privileges are required.")
    return user


async def _read_pbnopen_csv(file: UploadFile) -> bytes:
    filename = file.filename or ""
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")
    content = await file.read(MAX_PBNOPEN_CSV_SIZE + 1)
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded CSV is empty.")
    if len(content) > MAX_PBNOPEN_CSV_SIZE:
        raise HTTPException(status_code=413, detail="CSV exceeds the 50 MB limit.")
    return content


@admin_router.post("/pbnopen-data-source/validate")
async def validate_pbnopen_data_source(
    file: UploadFile = File(...),
    _: User = Depends(get_super_admin),
):
    content = await _read_pbnopen_csv(file)
    try:
        result = pbnopen_import_service.validate_pbnopen_csv(content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (RuntimeError, SQLAlchemyError) as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not validate against 'pbncleaner.fetch_pbnopen'. Check database connectivity and table availability.",
        ) from exc
    return {"filename": file.filename, **result}


@admin_router.post("/pbnopen-data-source/replace")
async def replace_pbnopen_data_source(
    file: UploadFile = File(...),
    _: User = Depends(get_super_admin),
):
    content = await _read_pbnopen_csv(file)
    try:
        row_count = pbnopen_import_service.replace_pbnopen_data(content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (RuntimeError, SQLAlchemyError) as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not replace 'pbncleaner.fetch_pbnopen'. Verify the table state before retrying; check database connectivity and schema.",
        ) from exc
    return {"message": "PBN Open data source replaced successfully.", "row_count": row_count}


@router.post("/register", response_model=UserRead, status_code=201)
def register(req: RegisterRequest, db: Session = Depends(get_history_db)):
    try:
        return auth_service.create_user(db, req.user, req.name, req.password)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="User is already registered.") from exc


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Session = Depends(get_history_db)):
    try:
        user = auth_service.authenticate(db, req.user, req.password)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return {"token": auth_service.create_session(db, user), "user": user}


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)):
    return user


@router.get("/preferences/theme", response_model=ThemePreferenceRead)
def get_theme_preference(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    return {"theme": auth_service.get_theme_preference(db, user.user)}


@router.put("/preferences/theme", response_model=ThemePreferenceRead)
def update_theme_preference(
    request: ThemePreferenceUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    return {"theme": auth_service.set_theme_preference(db, user.user, request.theme)}


@router.post("/logout", response_model=MessageResponse)
def logout(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_history_db),
):
    token = _extract_token(authorization)
    auth_service.revoke_session(db, token)
    return {"message": "Signed out."}


@admin_router.get("/users", response_model=list[UserRead])
def list_users(
    _: User = Depends(get_super_admin),
    db: Session = Depends(get_history_db),
):
    return db.scalars(select(User).order_by(User.auth_level.desc(), User.user)).all()


@admin_router.post("/users", response_model=UserRead, status_code=201)
def create_managed_user(
    request: AdminUserCreate,
    _: User = Depends(get_super_admin),
    db: Session = Depends(get_history_db),
):
    try:
        return auth_service.create_user(
            db,
            request.user,
            request.name,
            request.password,
            request.auth_level,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="User is already registered.") from exc


@admin_router.put("/users/{username}", response_model=UserRead)
def update_managed_user(
    username: str,
    request: AdminUserUpdate,
    current_user: User = Depends(get_super_admin),
    db: Session = Depends(get_history_db),
):
    account = db.get(User, username.strip().lower())
    if account is None:
        raise HTTPException(status_code=404, detail="User not found.")
    if account.user == current_user.user and (request.auth_level != 3 or not request.is_active):
        raise HTTPException(status_code=409, detail="You cannot remove your own Super Admin access.")

    loses_last_super_admin = (
        account.auth_level == 3
        and account.is_active
        and (request.auth_level != 3 or not request.is_active)
        and auth_service.active_superuser_count(db) <= 1
    )
    if loses_last_super_admin:
        raise HTTPException(status_code=409, detail="At least one active Super Admin must remain.")

    account.name = request.name
    account.auth_level = request.auth_level
    account.is_active = request.is_active
    if request.password is not None:
        account.password = request.password
    db.commit()
    db.refresh(account)
    auth_service.revoke_user_sessions(db, account.user)
    return account


@admin_router.delete("/users/{username}", status_code=204)
def delete_managed_user(
    username: str,
    current_user: User = Depends(get_super_admin),
    db: Session = Depends(get_history_db),
) -> Response:
    normalized_username = username.strip().lower()
    account = db.get(User, normalized_username)
    if account is None:
        raise HTTPException(status_code=404, detail="User not found.")
    if account.user == current_user.user:
        raise HTTPException(status_code=409, detail="You cannot delete your own account.")
    if account.auth_level == 3 and account.is_active and auth_service.active_superuser_count(db) <= 1:
        raise HTTPException(status_code=409, detail="At least one active Super Admin must remain.")

    db.delete(account)
    db.commit()
    return Response(status_code=204)
