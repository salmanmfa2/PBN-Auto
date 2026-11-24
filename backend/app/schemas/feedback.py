from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


FeedbackMenu = Literal[
    "Overall",
    "PBN Analytics",
    "Insight Hub Beta",
    "Analisis Kinerja DJPb",
    "Analisis Mutasi/Promosi",
    "Manajemen Plt./Plh.",
    "Generate ND Undangan Pelantikan",
    "Bahan Pendukung MPK",
    "Simulasi Mutasi",
    "Admin",
]


class FeedbackCreate(BaseModel):
    menu: FeedbackMenu
    feedback: str = Field(min_length=1, max_length=5000)

    @field_validator("feedback")
    @classmethod
    def strip_feedback(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Feedback must not be blank.")
        return normalized


class FeedbackRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    submitted_by: str | None
    menu: FeedbackMenu
    feedback: str
    created_at: datetime


class FeedbackClearResponse(BaseModel):
    deleted_count: int
