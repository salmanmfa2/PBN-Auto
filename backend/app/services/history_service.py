from typing import Any

from sqlalchemy.orm import Session

from app.models.cleaning_history import CleaningHistory


def log_cleaning_action(
    db: Session,
    *,
    dataset_id: str,
    sheet_name: str | None,
    action: str,
    status: str,
    rows_before: int | None = None,
    rows_after: int | None = None,
    columns_before: int | None = None,
    columns_after: int | None = None,
    detail_json: dict[str, Any] | None = None,
    error_message: str | None = None,
) -> CleaningHistory:
    item = CleaningHistory(
        dataset_id=dataset_id,
        sheet_name=sheet_name,
        action=action,
        status=status,
        rows_before=rows_before,
        rows_after=rows_after,
        columns_before=columns_before,
        columns_after=columns_after,
        detail_json=detail_json,
        error_message=error_message,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def get_cleaning_history(
    db: Session,
    dataset_id: str,
    limit: int = 100,
) -> list[CleaningHistory]:
    safe_limit = max(1, min(limit, 500))
    return (
        db.query(CleaningHistory)
        .filter(CleaningHistory.dataset_id == dataset_id)
        .order_by(CleaningHistory.created_at.desc(), CleaningHistory.id.desc())
        .limit(safe_limit)
        .all()
    )
