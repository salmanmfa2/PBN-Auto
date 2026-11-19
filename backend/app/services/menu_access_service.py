from typing import Literal

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.menu_access import MenuAccessPolicy


MenuAction = Literal["view", "edit"]

DEFAULT_MENU_ACCESS_POLICIES: tuple[tuple[str, int, int], ...] = (
    ("analytics", 0, 0),
    ("insights", 0, 0),
    ("insights-beta", 0, 0),
    ("analisis-kinerja", 0, 2),
    ("analisis-mutasi", 0, 0),
    ("plt-plh", 0, 2),
    ("nd-undangan", 1, 1),
    ("progress-bahan", 0, 3),
    ("simulasi-mutasi", 0, 3),
    ("admin", 3, 3),
)
MENU_KEYS = tuple(item[0] for item in DEFAULT_MENU_ACCESS_POLICIES)
MINIMUM_EDIT_LEVELS = {
    "analisis-kinerja": 1,
    "plt-plh": 1,
    "nd-undangan": 1,
}
_DEFAULTS_BY_KEY = {
    menu_key: (view_level, edit_level)
    for menu_key, view_level, edit_level in DEFAULT_MENU_ACCESS_POLICIES
}


def get_menu_access_settings(db: Session) -> list[dict[str, int | str]]:
    stored = {
        policy.menu_key: policy
        for policy in db.query(MenuAccessPolicy).all()
    }
    return [
        {
            "menu_key": menu_key,
            "view_level": stored[menu_key].view_level
            if menu_key in stored
            else default_view_level,
            "edit_level": stored[menu_key].edit_level
            if menu_key in stored
            else default_edit_level,
        }
        for menu_key, default_view_level, default_edit_level in DEFAULT_MENU_ACCESS_POLICIES
    ]


def get_required_menu_level(
    db: Session,
    menu_key: str,
    action: MenuAction,
) -> int:
    if menu_key not in _DEFAULTS_BY_KEY:
        raise ValueError(f"Unknown menu key: {menu_key}.")
    policy = db.get(MenuAccessPolicy, menu_key)
    if policy is not None:
        return policy.view_level if action == "view" else policy.edit_level
    defaults = _DEFAULTS_BY_KEY[menu_key]
    return defaults[0] if action == "view" else defaults[1]


def update_menu_access_settings(
    db: Session,
    requested_policies: list[dict[str, int | str]],
) -> list[dict[str, int | str]]:
    requested_by_key: dict[str, dict[str, int | str]] = {}
    for policy in requested_policies:
        menu_key = str(policy["menu_key"])
        if menu_key in requested_by_key:
            raise ValueError(f"Menu '{menu_key}' was included more than once.")
        requested_by_key[menu_key] = policy

    if set(requested_by_key) != set(MENU_KEYS):
        raise ValueError("The permission update must include every menu exactly once.")

    for menu_key, policy in requested_by_key.items():
        view_level = int(policy["view_level"])
        edit_level = int(policy["edit_level"])
        if not 0 <= view_level <= 3 or not 0 <= edit_level <= 3:
            raise ValueError("Menu access levels must be between 0 and 3.")
        if edit_level < view_level:
            raise ValueError(
                f"Menu '{menu_key}' cannot require a lower level to edit than to view."
            )
        if edit_level < MINIMUM_EDIT_LEVELS.get(menu_key, 0):
            raise ValueError(
                f"Menu '{menu_key}' requires at least level "
                f"{MINIMUM_EDIT_LEVELS[menu_key]} to edit."
            )

    try:
        for menu_key, policy in requested_by_key.items():
            saved_policy = db.get(MenuAccessPolicy, menu_key)
            if saved_policy is None:
                saved_policy = MenuAccessPolicy(
                    menu_key=menu_key,
                    view_level=int(policy["view_level"]),
                    edit_level=int(policy["edit_level"]),
                )
                db.add(saved_policy)
            else:
                saved_policy.view_level = int(policy["view_level"])
                saved_policy.edit_level = int(policy["edit_level"])
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise

    return get_menu_access_settings(db)
