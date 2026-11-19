from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.services import dataset_service
from app.services import stored_dataset_service
from app.history_db import get_history_db
from app.schemas.dataset import DatasetPreview
from app.api.menu_access import require_menu_access
from app.storage.dataset_store import DatasetStore

router = APIRouter(dependencies=[Depends(require_menu_access("analytics"))])

ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


async def persist_uploaded_file(
    file: UploadFile,
    history_db: Session,
    *,
    workspace_id: str | None = None,
) -> dict:
    # Validate extension
    filename = file.filename or ""
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    content = await file.read()

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 50 MB limit.")

    try:
        result = dataset_service.parse_upload(content, filename)
        stored_dataset_service.create_run(
            history_db,
            dataset_id=result["dataset_id"],
            filename=filename,
            content=content,
            content_type=file.content_type,
            workspace_id=workspace_id,
        )
    except ValueError as exc:
        if "result" in locals():
            DatasetStore.delete(result["dataset_id"])
        raise HTTPException(status_code=422, detail=str(exc))
    except RuntimeError as exc:
        if "result" in locals():
            DatasetStore.delete(result["dataset_id"])
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception:
        if "result" in locals():
            DatasetStore.delete(result["dataset_id"])
        raise

    return result


@router.post("/upload", response_model=DatasetPreview, summary="Upload a CSV or Excel file")
async def upload_file(file: UploadFile = File(...), history_db: Session = Depends(get_history_db)):
    return await persist_uploaded_file(file, history_db)
