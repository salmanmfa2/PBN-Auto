from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.history_db import Base


class MenuAccessPolicy(Base):
    __tablename__ = "menu_access_policies"
    __table_args__ = (
        CheckConstraint(
            "view_level BETWEEN 0 AND 3",
            name="chk_menu_access_view_level",
        ),
        CheckConstraint(
            "edit_level BETWEEN 0 AND 3",
            name="chk_menu_access_edit_level",
        ),
        CheckConstraint(
            "edit_level >= view_level",
            name="chk_menu_access_edit_gte_view",
        ),
    )

    menu_key: Mapped[str] = mapped_column(String(40), primary_key=True)
    view_level: Mapped[int] = mapped_column(Integer, nullable=False)
    edit_level: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
