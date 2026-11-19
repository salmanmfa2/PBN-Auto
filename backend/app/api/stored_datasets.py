from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.history_db import get_history_db
from app.schemas.dataset import DatasetPreview
from app.schemas.stored_dataset import DatasetRunRenameRequest, StoredDatasetRunRead
from app.services import dataset_service, stored_dataset_service
from app.api.menu_access import require_menu_access


router = APIRouter(
    prefix="/stored-datasets",
    tags=["stored datasets"],
    dependencies=[Depends(require_menu_access("analytics"))],
)


@router.get("", response_model=list[StoredDatasetRunRead])
def get_stored_datasets(limit: int = 20, history_db: Session = Depends(get_history_db)):
    return stored_dataset_service.list_runs(history_db, limit=limit)


@router.put("/{dataset_id}/name", status_code=204)
def update_run_name(
    dataset_id: str,
    request: DatasetRunRenameRequest,
    history_db: Session = Depends(get_history_db),
):
    try:
        stored_dataset_service.rename_run(
            history_db,
            dataset_id=dataset_id,
            run_name=request.run_name,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\""))


@router.delete("/{dataset_id}", status_code=204)
def delete_stored_dataset(dataset_id: str, history_db: Session = Depends(get_history_db)):
    try:
        stored_dataset_service.delete_run(history_db, dataset_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\""))


@router.post("/{dataset_id}/restore", response_model=DatasetPreview)
def restore_stored_dataset(dataset_id: str, history_db: Session = Depends(get_history_db)):
    try:
        content, filename = stored_dataset_service.load_run_content(history_db, dataset_id)
        return dataset_service.parse_upload(content, filename, dataset_id=dataset_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\""))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))