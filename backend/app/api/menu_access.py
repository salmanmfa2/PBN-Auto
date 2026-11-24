from collections.abc import Callable

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.auth import get_god_user, get_optional_current_user
from app.history_db import get_history_db
from app.models.auth import User
from app.schemas.menu_access import (
    MenuAccessSettingsRead,
    MenuAccessSettingsUpdate,
    MenuKey,
)
from app.services import menu_access_service


router = APIRouter(prefix="/menu-access", tags=["menu access"])
_READ_ONLY_POST_PREFIXES = (
    "/export/",
    "/insights/pbn/dashboard/",
    "/insights-beta/pbn/dashboard",
    "/performance/adjustments/check",
    "/performance/full-data/validate",
    "/candidate-preparation/talent-finder/",
)
_EDIT_ONLY_GET_PATHS = {
    "/plt-plh/employees",
    "/performance/corrections/batch-template",
    "/performance/corrections/edit-log",
}


def _request_action(request: Request) -> menu_access_service.MenuAction:
    if request.method in {"GET", "HEAD"}:
        if request.url.path in _EDIT_ONLY_GET_PATHS:
            return "edit"
        return "view"
    if request.method == "POST" and request.url.path.startswith(_READ_ONLY_POST_PREFIXES):
        return "view"
    if (
        request.method == "POST"
        and request.url.path.startswith("/candidate-preparation/workspaces/")
        and request.url.path.endswith("/export")
    ):
        return "view"
    if (
        request.method == "POST"
        and request.url.path.startswith("/stored-datasets/")
        and request.url.path.endswith("/restore")
    ):
        return "view"
    return "edit"


def require_menu_access(
    menu_key: MenuKey,
    action: menu_access_service.MenuAction | None = None,
) -> Callable[..., None]:
    def check_menu_access(
        request: Request,
        db: Session = Depends(get_history_db),
        user: User | None = Depends(get_optional_current_user),
    ) -> None:
        requested_action = action or _request_action(request)
        try:
            required_level = menu_access_service.get_required_menu_level(
                db,
                menu_key,
                requested_action,
            )
        except SQLAlchemyError as exc:
            raise HTTPException(
                status_code=503,
                detail="Could not load menu access permissions.",
            ) from exc

        current_level = user.auth_level if user is not None else 0
        if current_level < 4 and current_level < required_level:
            raise HTTPException(
                status_code=403,
                detail=f"You do not have permission to {requested_action} this menu.",
            )

    return check_menu_access


@router.get("", response_model=MenuAccessSettingsRead)
def read_menu_access_settings(
    db: Session = Depends(get_history_db),
):
    try:
        return {"policies": menu_access_service.get_menu_access_settings(db)}
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not load menu access settings.",
        ) from exc


@router.put("", response_model=MenuAccessSettingsRead)
def save_menu_access_settings(
    request: MenuAccessSettingsUpdate,
    _: User = Depends(get_god_user),
    db: Session = Depends(get_history_db),
):
    try:
        policies = [
            policy.model_dump()
            for policy in request.policies
        ]
        return {
            "policies": menu_access_service.update_menu_access_settings(db, policies),
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not save menu access settings.",
        ) from exc
