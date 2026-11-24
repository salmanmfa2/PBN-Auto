from datetime import date as DateValue
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    BigInteger,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.history_db import Base


class CandidatePreparationWorkspace(Base):
    __tablename__ = "candidate_preparation_workspaces"
    __table_args__ = (
        CheckConstraint(
            "priority IN ('high', 'med', 'low')",
            name="chk_candidate_preparation_priority",
        ),
        CheckConstraint(
            "output_style IN ('Single', 'Batch')",
            name="chk_candidate_preparation_output_style",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    created_by: Mapped[str] = mapped_column(
        String(80),
        ForeignKey("users.user", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_name: Mapped[str] = mapped_column(String(255), nullable=False)
    target_jabatan: Mapped[str] = mapped_column(String(512), nullable=False)
    date: Mapped[DateValue] = mapped_column(Date, nullable=False)
    priority: Mapped[str] = mapped_column(String(8), nullable=False, default="med")
    output_style: Mapped[str] = mapped_column(
        String(8),
        nullable=False,
        default="Single",
    )
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
    candidates: Mapped[list["CandidatePreparationCandidate"]] = relationship(
        back_populates="workspace",
        cascade="all, delete-orphan",
        order_by="CandidatePreparationCandidate.sort_order",
    )


class CandidatePreparationCandidate(Base):
    __tablename__ = "candidate_preparation_candidates"
    __table_args__ = (
        CheckConstraint(
            "sort_order >= 0",
            name="chk_candidate_preparation_candidate_sort_order",
        ),
    )

    workspace_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("candidate_preparation_workspaces.id", ondelete="CASCADE"),
        primary_key=True,
    )
    employee_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    consideration: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="",
    )
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
    workspace: Mapped[CandidatePreparationWorkspace] = relationship(
        back_populates="candidates",
    )


class CandidatePreparationCandidateSnapshot(Base):
    __tablename__ = "candidate_preparation_candidate_snapshots"

    workspace_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("candidate_preparation_workspaces.id", ondelete="CASCADE"),
        primary_key=True,
    )
    employee_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    nip: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    nama: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    eselon_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    eselon: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    jabatan: Mapped[str] = mapped_column(Text, nullable=False, default="")
    unit_eselon_ii: Mapped[str] = mapped_column(Text, nullable=False, default="")
    unit_eselon_iii: Mapped[str] = mapped_column(Text, nullable=False, default="")
    gol: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    pangkat: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    pendidikan: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    jurusan: Mapped[str] = mapped_column(Text, nullable=False, default="")
    universitas: Mapped[str] = mapped_column(Text, nullable=False, default="")
    tmt_jabatan: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    tanggal_lahir: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    riwayat_jabatan: Mapped[str] = mapped_column(Text, nullable=False, default="")
