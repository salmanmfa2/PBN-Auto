from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.history_db import Base


class PltPlhMonitoringRecord(Base):
    __tablename__ = "plt_plh_monitoring_records"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    jabatan_kosong: Mapped[str] = mapped_column(Text, nullable=False)
    pejabat_pengganti: Mapped[str] = mapped_column(Text, nullable=False)
    jabatan_definitif_pengganti: Mapped[str] = mapped_column(Text, nullable=False)
    nomor_surat: Mapped[str] = mapped_column(Text, nullable=False)
    tmt: Mapped[date] = mapped_column(Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )
