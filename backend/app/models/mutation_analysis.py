from datetime import date, datetime, timezone

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.history_db import Base


class MutationAnalysisWorkspace(Base):
    __tablename__ = "mutation_analysis_workspaces"
    __table_args__ = (
        CheckConstraint(
            "eselon_choice IN ('Administrator', 'Pengawas')",
            name="chk_mutation_analysis_eselon_choice",
        ),
        CheckConstraint(
            "status IN ('Aktif', 'Inaktif')",
            name="chk_mutation_analysis_status",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    created_by: Mapped[str] = mapped_column(
        String(80),
        ForeignKey("users.user", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    eselon_choice: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    tmt: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="Aktif")
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


class MutationAnalysisWorkspaceDataset(Base):
    __tablename__ = "mutation_analysis_workspace_datasets"

    workspace_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("mutation_analysis_workspaces.id", ondelete="CASCADE"),
        primary_key=True,
    )
    dataset_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("dataset_runs.dataset_id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
