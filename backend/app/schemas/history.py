from datetime import datetime
from typing import Any

from pydantic import BaseModel


class CleaningHistoryRead(BaseModel):
    id: int
    dataset_id: str
    sheet_name: str | None = None
    action: str
    status: str
    rows_before: int | None = None
    rows_after: int | None = None
    columns_before: int | None = None
    columns_after: int | None = None
    detail_json: dict[str, Any] | None = None
    error_message: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
