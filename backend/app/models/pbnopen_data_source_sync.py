from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.history_db import Base


class PbnOpenDataSourceSync(Base):
    __tablename__ = "pbnopen_data_source_sync"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    synced_by_user: Mapped[str] = mapped_column(String(80), nullable=False)
    synced_by_name: Mapped[str] = mapped_column(String(200), nullable=False)
