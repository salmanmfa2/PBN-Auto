from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.auth import get_admin_user, get_current_user
from app.history_db import get_history_db
from app.models.auth import User
from app.schemas.auth import MessageResponse
from app.schemas.feedback import FeedbackClearResponse, FeedbackCreate, FeedbackRead
from app.services import feedback_service


router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackRead, status_code=201)
def submit_feedback(
    request: FeedbackCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    try:
        return feedback_service.create_feedback(
            db,
            user.user,
            request.menu,
            request.feedback,
        )
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not submit feedback.") from exc


@router.get("", response_model=list[FeedbackRead])
def list_admin_feedback(
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_history_db),
):
    try:
        return feedback_service.list_feedback(db)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Could not load feedback.") from exc


@router.delete("", response_model=FeedbackClearResponse)
def clear_admin_feedback(
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_history_db),
):
    try:
        return {"deleted_count": feedback_service.clear_feedback(db)}
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not clear feedback.") from exc


@router.delete("/{feedback_id}", response_model=MessageResponse)
def delete_admin_feedback(
    feedback_id: int,
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_history_db),
):
    try:
        if not feedback_service.delete_feedback(db, feedback_id):
            raise HTTPException(status_code=404, detail="Feedback not found.")
        return {"message": "Feedback deleted."}
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not delete feedback.") from exc
