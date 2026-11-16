from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.history_db import Base


class PerformanceKinerjaDataset(Base):
    __tablename__ = "performance_kinerja_datasets"
    __table_args__ = (
        UniqueConstraint("period", name="uq_performance_kinerja_dataset_period"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    uploaded_by_user: Mapped[str] = mapped_column(String(80), nullable=False)
    uploaded_by_name: Mapped[str] = mapped_column(String(200), nullable=False)


class PerformanceKinerjaRecord(Base):
    __tablename__ = "performance_kinerja_records"

    dataset_id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )
    nip: Mapped[str] = mapped_column(String(18), primary_key=True)
    nama: Mapped[str] = mapped_column(Text, nullable=False)
    unit_eselon_ii: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="Unidentified",
        server_default="Unidentified",
    )
    eselon: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="Unidentified",
        server_default="Unidentified",
    )
    unit_eselon_iii: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="Unidentified",
        server_default="Unidentified",
    )
    unit_eselon_iv: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="Unidentified",
        server_default="Unidentified",
    )
    unit_kerja_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    nhk: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    npk: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    nhk_kalibrasi: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    npk_kalibrasi: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    nkp_awal: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    rating_hasil_kerja_awal: Mapped[str | None] = mapped_column(Text, nullable=True)
    rating_perilaku_kerja_awal: Mapped[str | None] = mapped_column(Text, nullable=True)
    predikat_kinerja_awal: Mapped[str | None] = mapped_column(Text, nullable=True)
    nilai_hukuman_disiplin: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    nilai_dampak_pelanggaran_disiplin: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 8),
        nullable=True,
    )
    nilai_dampak_perilaku: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    nilai_koreksi: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    nko: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    nkp_akhir: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    rating_hasil_kerja: Mapped[str | None] = mapped_column(Text, nullable=True)
    rating_perilaku_kerja: Mapped[str | None] = mapped_column(Text, nullable=True)
    predikat_kinerja: Mapped[str | None] = mapped_column(Text, nullable=True)


class PerformanceKinerjaInsight(Base):
    __tablename__ = "performance_kinerja_insights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_by_user: Mapped[str] = mapped_column(String(80), nullable=False)
    updated_by_name: Mapped[str] = mapped_column(String(200), nullable=False)
