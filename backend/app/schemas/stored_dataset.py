from datetime import datetime

from pydantic import BaseModel, Field


class DatasetRunRenameRequest(BaseModel):
    run_name: str = Field(min_length=1, max_length=255)


class StoredDatasetRunRead(BaseModel):
    dataset_id: str
    run_name: str
    original_filename: str
    latest_version: int
    updated_at: datetime