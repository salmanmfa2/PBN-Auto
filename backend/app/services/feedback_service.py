from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.user_feedback import UserFeedback


def create_feedback(
    db: Session,
    submitted_by: str,
    menu: str,
    feedback: str,
) -> UserFeedback:
    record = UserFeedback(
        submitted_by=submitted_by,
        menu=menu,
        feedback=feedback,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_feedback(db: Session) -> list[UserFeedback]:
    statement = select(UserFeedback).order_by(
        UserFeedback.created_at.desc(),
        UserFeedback.id.desc(),
    )
    return list(db.scalars(statement).all())


def delete_feedback(db: Session, feedback_id: int) -> bool:
    record = db.get(UserFeedback, feedback_id)
    if record is None:
        return False
    db.delete(record)
    db.commit()
    return True


def clear_feedback(db: Session) -> int:
    result = db.execute(delete(UserFeedback))
    db.commit()
    return max(result.rowcount or 0, 0)
