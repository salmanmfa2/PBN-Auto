from datetime import datetime

from pydantic import BaseModel


class PbnOpenDataSourceSyncStatus(BaseModel):
    last_synced_at: datetime | None = None
    synced_by_user: str | None = None
    synced_by_name: str | None = None
