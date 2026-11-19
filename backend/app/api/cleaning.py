from fastapi import APIRouter, HTTPException
from fastapi import Depends
from sqlalchemy.orm import Session

from app.services import dataset_service
from app.services import history_service
from app.services import stored_dataset_service
from app.history_db import get_history_db
from app.schemas.dataset import (
    DatasetPreview,
    RemoveColumnsRequest,
    RenameColumnsRequest,
    RemoveDuplicatesRequest,
    RemoveDuplicatesResponse,
    DeleteRowsRequest,
    UseFirstRowAsHeaderRequest,
    AutoCleanRequest,
)
from app.schemas.history import CleaningHistoryRead
from app.schemas.dataset import CleaningMethodRecommendation
from app.services import cleaning_recommendation_service
from app.api.menu_access import require_menu_access

router = APIRouter(
    prefix="/clean",
    tags=["cleaning"],
    dependencies=[Depends(require_menu_access("analytics"))],
)


@router.get(
    "/recommend-method/{dataset_id}",
    response_model=CleaningMethodRecommendation,
)
def recommend_cleaning_method(dataset_id: str, sheet_name: str | None = None):
    try:
        return cleaning_recommendation_service.recommend_dataset_cleaning_method(
            dataset_id,
            sheet_name,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\""))


def _handle_key_error(exc: KeyError):
    raise HTTPException(status_code=404, detail=str(exc).strip("'\""))


def _handle_value_error(exc: ValueError):
    raise HTTPException(status_code=422, detail=str(exc))


def _collect_counts(preview: DatasetPreview) -> tuple[int, int]:
    return preview.row_count, preview.column_count


def _log_success(
    db: Session,
    *,
    action: str,
    dataset_id: str,
    sheet_name: str | None,
    before_rows: int,
    before_cols: int,
    after_rows: int,
    after_cols: int,
    detail_json: dict,
) -> None:
    history_service.log_cleaning_action(
        db,
        dataset_id=dataset_id,
        sheet_name=sheet_name,
        action=action,
        status="success",
        rows_before=before_rows,
        rows_after=after_rows,
        columns_before=before_cols,
        columns_after=after_cols,
        detail_json=detail_json,
    )
    stored_dataset_service.save_cleaned_version(
        db,
        dataset_id=dataset_id,
        content=dataset_service.export_excel(dataset_id),
    )


def _log_failure(
    db: Session,
    *,
    action: str,
    dataset_id: str,
    sheet_name: str | None,
    detail_json: dict,
    message: str,
) -> None:
    history_service.log_cleaning_action(
        db,
        dataset_id=dataset_id,
        sheet_name=sheet_name,
        action=action,
        status="failed",
        detail_json=detail_json,
        error_message=message,
    )


@router.post("/remove-columns", response_model=DatasetPreview)
def remove_columns(req: RemoveColumnsRequest, history_db: Session = Depends(get_history_db)):
    try:
        before = dataset_service.get_dataset_preview(req.dataset_id, req.sheet_name)
        before_rows, before_cols = _collect_counts(DatasetPreview(**before))
        result = dataset_service.remove_columns(req.dataset_id, req.columns_to_keep, req.sheet_name)
        after_rows, after_cols = _collect_counts(DatasetPreview(**result))
        _log_success(
            history_db,
            action="remove_columns",
            dataset_id=req.dataset_id,
            sheet_name=req.sheet_name,
            before_rows=before_rows,
            before_cols=before_cols,
            after_rows=after_rows,
            after_cols=after_cols,
            detail_json={"columns_to_keep": req.columns_to_keep},
        )
        return result
    except KeyError as exc:
        _log_failure(
            history_db,
            action="remove_columns",
            dataset_id=req.dataset_id,
            sheet_name=req.sheet_name,
            detail_json={"columns_to_keep": req.columns_to_keep},
            message=str(exc),
        )
        _handle_key_error(exc)
    except ValueError as exc:
        _log_failure(
            history_db,
            action="remove_columns",
            dataset_id=req.dataset_id,
            sheet_name=req.sheet_name,
            detail_json={"columns_to_keep": req.columns_to_keep},
            message=str(exc),
        )
        _handle_value_error(exc)


@router.post("/rename-columns", response_model=DatasetPreview)
def rename_columns(req: RenameColumnsRequest, history_db: Session = Depends(get_history_db)):
    try:
        before = dataset_service.get_dataset_preview(req.dataset_id, req.sheet_name)
        before_rows, before_cols = _collect_counts(DatasetPreview(**before))
        result = dataset_service.rename_columns(req.dataset_id, req.rename_map, req.sheet_name)
        after_rows, after_cols = _collect_counts(DatasetPreview(**result))
        _log_success(
            history_db,
            action="rename_columns",
            dataset_id=req.dataset_id,
            sheet_name=req.sheet_name,
            before_rows=before_rows,
            before_cols=before_cols,
            after_rows=after_rows,
            after_cols=after_cols,
            detail_json={"rename_map": req.rename_map},
        )
        return result
    except KeyError as exc:
        _log_failure(
            history_db,
            action="rename_columns",
            dataset_id=req.dataset_id,
            sheet_name=req.sheet_name,
            detail_json={"rename_map": req.rename_map},
            message=str(exc),
        )
        _handle_key_error(exc)
    except ValueError as exc:
        _log_failure(
            history_db,
            action="rename_columns",
            dataset_id=req.dataset_id,
            sheet_name=req.sheet_name,
            detail_json={"rename_map": req.rename_map},
            message=str(exc),
        )
        _handle_value_error(exc)


@router.post("/remove-duplicates", response_model=RemoveDuplicatesResponse)
def remove_duplicates(req: RemoveDuplicatesRequest, history_db: Session = Depends(get_history_db)):
    try:
        before = dataset_service.get_dataset_preview(req.dataset_id, req.sheet_name)
        before_rows, before_cols = _collect_counts(DatasetPreview(**before))
        result = dataset_service.remove_duplicates(req.dataset_id, req.columns, req.sheet_name)
        preview = DatasetPreview(**result["preview"])
        after_rows, after_cols = _collect_counts(preview)
        _log_success(
            history_db,
            action="remove_duplicates",
            dataset_id=req.dataset_id,
            sheet_name=req.sheet_name,
            before_rows=before_rows,
            before_cols=before_cols,
            after_rows=after_rows,
            after_cols=after_cols,
            detail_json={"columns": req.columns, "removed_rows": result["removed_rows"]},
        )
        return result
    except KeyError as exc:
        _log_failure(
            history_db,
            action="remove_duplicates",
            dataset_id=req.dataset_id,
            sheet_name=req.sheet_name,
            detail_json={"columns": req.columns},
            message=str(exc),
        )
        _handle_key_error(exc)
    except ValueError as exc:
        _log_failure(
            history_db,
            action="remove_duplicates",
            dataset_id=req.dataset_id,
            sheet_name=req.sheet_name,
            detail_json={"columns": req.columns},
            message=str(exc),
        )
        _handle_value_error(exc)


@router.post("/delete-rows", response_model=DatasetPreview)
def delete_rows(req: DeleteRowsRequest, history_db: Session = Depends(get_history_db)):
    try:
        before = dataset_service.get_dataset_preview(req.dataset_id, req.sheet_name)
        before_rows, before_cols = _collect_counts(DatasetPreview(**before))
        result = dataset_service.delete_rows(req.dataset_id, req.mode, req.count, req.row, req.sheet_name)
        after_rows, after_cols = _collect_counts(DatasetPreview(**result))
        _log_success(
            history_db,
            action="delete_rows",
            dataset_id=req.dataset_id,
            sheet_name=req.sheet_name,
            before_rows=before_rows,
            before_cols=before_cols,
            after_rows=after_rows,
            after_cols=after_cols,
            detail_json={"mode": req.mode, "count": req.count, "row": req.row},
        )
        return result
    except KeyError as exc:
        _log_failure(
            history_db,
            action="delete_rows",
            dataset_id=req.dataset_id,
            sheet_name=req.sheet_name,
            detail_json={"mode": req.mode, "count": req.count, "row": req.row},
            message=str(exc),
        )
        _handle_key_error(exc)
    except ValueError as exc:
        _log_failure(
            history_db,
            action="delete_rows",
            dataset_id=req.dataset_id,
            sheet_name=req.sheet_name,
            detail_json={"mode": req.mode, "count": req.count, "row": req.row},
            message=str(exc),
        )
        _handle_value_error(exc)


@router.post("/use-first-row-as-header", response_model=DatasetPreview)
def use_first_row_as_header(req: UseFirstRowAsHeaderRequest, history_db: Session = Depends(get_history_db)):
    try:
        before = dataset_service.get_dataset_preview(req.dataset_id, req.sheet_name)
        before_rows, before_cols = _collect_counts(DatasetPreview(**before))
        result = dataset_service.use_first_row_as_header(req.dataset_id, req.sheet_name)
        after_rows, after_cols = _collect_counts(DatasetPreview(**result))
        _log_success(
            history_db,
            action="use_first_row_as_header",
            dataset_id=req.dataset_id,
            sheet_name=req.sheet_name,
            before_rows=before_rows,
            before_cols=before_cols,
            after_rows=after_rows,
            after_cols=after_cols,
            detail_json={},
        )
        return result
    except KeyError as exc:
        _log_failure(
            history_db,
            action="use_first_row_as_header",
            dataset_id=req.dataset_id,
            sheet_name=req.sheet_name,
            detail_json={},
            message=str(exc),
        )
        _handle_key_error(exc)
    except ValueError as exc:
        _log_failure(
            history_db,
            action="use_first_row_as_header",
            dataset_id=req.dataset_id,
            sheet_name=req.sheet_name,
            detail_json={},
            message=str(exc),
        )
        _handle_value_error(exc)


@router.post("/apply-auto-clean", response_model=DatasetPreview)
def apply_auto_clean(req: AutoCleanRequest, history_db: Session = Depends(get_history_db)):
    try:
        before = dataset_service.get_dataset_preview(req.dataset_id, req.sheet_name)
        before_rows, before_cols = _collect_counts(DatasetPreview(**before))
        result = dataset_service.apply_auto_clean(req.dataset_id, req.mode, req.sheet_name)
        after_rows, after_cols = _collect_counts(DatasetPreview(**result))
        _log_success(
            history_db,
            action="apply_auto_clean",
            dataset_id=req.dataset_id,
            sheet_name=req.sheet_name,
            before_rows=before_rows,
            before_cols=before_cols,
            after_rows=after_rows,
            after_cols=after_cols,
            detail_json={"mode": req.mode},
        )
        return result
    except KeyError as exc:
        _log_failure(
            history_db,
            action="apply_auto_clean",
            dataset_id=req.dataset_id,
            sheet_name=req.sheet_name,
            detail_json={"mode": req.mode},
            message=str(exc),
        )
        _handle_key_error(exc)
    except ValueError as exc:
        _log_failure(
            history_db,
            action="apply_auto_clean",
            dataset_id=req.dataset_id,
            sheet_name=req.sheet_name,
            detail_json={"mode": req.mode},
            message=str(exc),
        )
        _handle_value_error(exc)


@router.get("/history/{dataset_id}", response_model=list[CleaningHistoryRead])
def get_cleaning_history(dataset_id: str, limit: int = 100, history_db: Session = Depends(get_history_db)):
    return history_service.get_cleaning_history(history_db, dataset_id=dataset_id, limit=limit)
