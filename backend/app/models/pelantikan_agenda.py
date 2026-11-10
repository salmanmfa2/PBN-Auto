from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.history_db import Base


class PelantikanAgenda(Base):
    __tablename__ = "pelantikan_agendas"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'ready', 'generated')",
            name="chk_pelantikan_agendas_status",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    created_by: Mapped[str] = mapped_column(
        String(80),
        ForeignKey("users.user", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tanggal_pelantikan: Mapped[date] = mapped_column(Date, nullable=False)
    nd_undangan_pelantikan: Mapped[str] = mapped_column(String(255), nullable=False)
    tanggal_nd_undangan_pelantikan: Mapped[date] = mapped_column(Date, nullable=False)
    jam_pelantikan: Mapped[str] = mapped_column(String(40), nullable=False)
    dresscode: Mapped[str] = mapped_column(String(1000), nullable=False)
    level_jabatan: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    uploaded_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    uploaded_sheet: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    people: Mapped[list["PelantikanAgendaPerson"]] = relationship(
        back_populates="agenda",
        cascade="all, delete-orphan",
        order_by="PelantikanAgendaPerson.row_number",
    )


class PelantikanAgendaPerson(Base):
    __tablename__ = "pelantikan_agenda_people"
    __table_args__ = (
        UniqueConstraint("agenda_id", "row_number", name="uq_pelantikan_agenda_people_row"),
        CheckConstraint(
            "lookup_status IN ('matched', 'not_found', 'missing_nip', 'duplicate')",
            name="chk_pelantikan_agenda_people_lookup",
        ),
        CheckConstraint(
            "modality IS NULL OR modality IN ('daring', 'luring')",
            name="chk_pelantikan_agenda_people_modality",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agenda_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("pelantikan_agendas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    source_no: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_nama_nip: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_jabatan_saat_ini: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_usul_jabatan_baru: Mapped[str | None] = mapped_column(Text, nullable=True)
    nip: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    nama: Mapped[str] = mapped_column(Text, nullable=False, default="")
    jabatan: Mapped[str] = mapped_column(Text, nullable=False, default="")
    unit_eselon_ii: Mapped[str] = mapped_column(Text, nullable=False, default="")
    eselon: Mapped[str | None] = mapped_column(String(32), nullable=True)
    lookup_status: Mapped[str] = mapped_column(String(24), nullable=False)
    selected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    modality: Mapped[str | None] = mapped_column(String(8), nullable=True)
    agenda: Mapped[PelantikanAgenda] = relationship(back_populates="people")
