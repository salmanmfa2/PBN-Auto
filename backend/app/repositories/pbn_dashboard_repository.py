import logging

import pandas as pd
from sqlalchemy.exc import SQLAlchemyError

from app.history_db import engine
from app.storage.dataset_store import DatasetStore


logger = logging.getLogger(__name__)


def load_dataset_sheet(
    dataset_id: str,
    sheet_name: str | None,
) -> tuple[pd.DataFrame, str]:
    sheets = DatasetStore.get(dataset_id)
    if sheets is None:
        raise KeyError(f"Dataset '{dataset_id}' not found. Please upload a file first.")
    if sheet_name is None:
        sheet_name = next(iter(sheets))
    if sheet_name not in sheets:
        raise KeyError(f"Sheet '{sheet_name}' not found.")
    return sheets[sheet_name], sheet_name


def load_pbnopen_source() -> pd.DataFrame:
    try:
        return pd.read_sql_table("fetch_pbnopen", engine, schema="pbncleaner")
    except (SQLAlchemyError, ValueError) as exc:
        logger.error(
            "Unable to read pbncleaner.fetch_pbnopen (error_type=%s).",
            type(exc).__name__,
        )
        raise RuntimeError(
            "Could not read database table 'pbncleaner.fetch_pbnopen'. "
            "Check database connectivity and table availability."
        ) from exc
