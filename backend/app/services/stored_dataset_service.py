import os
import shutil
from pathlib import Path

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.dataset_file import DatasetFile
from app.models.dataset_run import DatasetRun
from app.models.cleaning_history import CleaningHistory
from app.models.mutation_analysis import MutationAnalysisWorkspaceDataset


def create_run(
    db: Session,
    *,
    dataset_id: str,
    filename: str,
    content: bytes,
    content_type: str | None,
    workspace_id: str | None = None,
) -> None:
    stored_path = _write_file(dataset_id, 1, "original", filename, content)
    try:
        db.add(
            DatasetRun(
                dataset_id=dataset_id,
                run_name=Path(filename).stem or "Untitled run",
                original_filename=filename,
            )
        )
        db.add(
            DatasetFile(
                dataset_id=dataset_id,
                version_number=1,
                file_role="original",
                original_filename=filename,
                stored_filename=Path(stored_path).name,
                content_type=content_type,
                file_size_bytes=len(content),
                storage_path=stored_path,
            )
        )
        if workspace_id is not None:
            assignment = db.get(MutationAnalysisWorkspaceDataset, workspace_id)
            if assignment is None:
                assignment = MutationAnalysisWorkspaceDataset(
                    workspace_id=workspace_id,
                    dataset_id=dataset_id,
                )
                db.add(assignment)
            else:
                assignment.dataset_id = dataset_id
        db.commit()
    except Exception:
        db.rollback()
        _delete_file(stored_path)
        raise


def save_cleaned_version(db: Session, *, dataset_id: str, content: bytes) -> None:
    run = _get_run(db, dataset_id)
    next_version = (
        db.query(func.coalesce(func.max(DatasetFile.version_number), 0))
        .filter(DatasetFile.dataset_id == dataset_id)
        .scalar()
        + 1
    )
    filename = f"{Path(run.original_filename).stem}-cleaned-v{next_version}.xlsx"
    stored_path = _write_file(dataset_id, next_version, "cleaned", filename, content)
    try:
        db.add(
            DatasetFile(
                dataset_id=dataset_id,
                version_number=next_version,
                file_role="cleaned",
                original_filename=run.original_filename,
                stored_filename=Path(stored_path).name,
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                file_size_bytes=len(content),
                storage_path=stored_path,
            )
        )
        db.commit()
    except Exception:
        db.rollback()
        _delete_file(stored_path)
        raise


def list_runs(db: Session, limit: int = 20) -> list[dict]:
    safe_limit = max(1, min(limit, 100))
    runs = (
        db.query(DatasetRun)
        .filter(DatasetRun.is_deleted.is_(False))
        .order_by(DatasetRun.created_at.desc())
        .limit(safe_limit)
        .all()
    )
    result: list[dict] = []
    for run in runs:
        latest_file = (
            db.query(DatasetFile)
            .filter(
                DatasetFile.dataset_id == run.dataset_id,
                DatasetFile.is_deleted.is_(False),
            )
            .order_by(DatasetFile.version_number.desc())
            .first()
        )
        result.append(
            {
                "dataset_id": run.dataset_id,
                "run_name": run.run_name,
                "original_filename": run.original_filename,
                "latest_version": latest_file.version_number if latest_file else 1,
                "updated_at": latest_file.created_at if latest_file else run.created_at,
            }
        )
    return result


def rename_run(db: Session, *, dataset_id: str, run_name: str) -> None:
    run = _get_run(db, dataset_id)
    run.run_name = run_name.strip()
    db.commit()


def load_run_content(db: Session, dataset_id: str) -> tuple[bytes, str]:
    _get_run(db, dataset_id)
    stored_file = (
        db.query(DatasetFile)
        .filter(
            DatasetFile.dataset_id == dataset_id,
            DatasetFile.is_deleted.is_(False),
        )
        .order_by(DatasetFile.version_number.desc())
        .first()
    )
    if stored_file is None:
        raise KeyError(f"Stored file for dataset '{dataset_id}' was not found.")
    file_path = _resolve_storage_path(stored_file.storage_path)
    if not file_path.exists():
        raise KeyError(f"Stored file '{stored_file.stored_filename}' is missing.")
    return file_path.read_bytes(), stored_file.stored_filename


def delete_run(db: Session, dataset_id: str) -> None:
    _get_run(db, dataset_id)
    storage_directory = _resolve_storage_path(dataset_id)
    try:
        shutil.rmtree(storage_directory, ignore_errors=True)
        db.query(CleaningHistory).filter(CleaningHistory.dataset_id == dataset_id).delete(
            synchronize_session=False
        )
        db.query(DatasetFile).filter(DatasetFile.dataset_id == dataset_id).delete(
            synchronize_session=False
        )
        db.query(DatasetRun).filter(DatasetRun.dataset_id == dataset_id).delete(
            synchronize_session=False
        )
        db.commit()
    except Exception:
        db.rollback()
        raise


def _get_run(db: Session, dataset_id: str) -> DatasetRun:
    run = (
        db.query(DatasetRun)
        .filter(DatasetRun.dataset_id == dataset_id, DatasetRun.is_deleted.is_(False))
        .first()
    )
    if run is None:
        raise KeyError(f"Stored dataset '{dataset_id}' was not found.")
    return run


def _write_file(dataset_id: str, version: int, role: str, filename: str, content: bytes) -> str:
    suffix = Path(filename).suffix.lower() or ".xlsx"
    relative_path = Path(dataset_id) / f"v{version}-{role}{suffix}"
    target = _resolve_storage_path(relative_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    return relative_path.as_posix()


def _delete_file(relative_path: str) -> None:
    try:
        _resolve_storage_path(relative_path).unlink(missing_ok=True)
    except OSError:
        return None


def _resolve_storage_path(relative_path: str | Path) -> Path:
    raw_root = os.getenv("DATASET_STORAGE_ROOT", "").strip()
    if not raw_root:
        raise RuntimeError("DATASET_STORAGE_ROOT is not configured.")
    root = Path(raw_root).resolve()
    candidate = (root / relative_path).resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError("Storage path is outside DATASET_STORAGE_ROOT.")
    return candidate