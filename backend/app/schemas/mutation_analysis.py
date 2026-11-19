from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class MutationWorkspaceFields(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=2000)
    tmt: date
    status: Literal["Aktif", "Inaktif"] = "Aktif"

    @field_validator("title", "description")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return value.strip()


class MutationWorkspaceCreate(MutationWorkspaceFields):
    eselon_choice: str = Field(min_length=1, max_length=20)

    @field_validator("eselon_choice")
    @classmethod
    def validate_eselon_choice(cls, value: str) -> str:
        normalized = value.strip()
        if normalized not in {"Administrator", "Pengawas"}:
            raise ValueError("Eselon choice must be Administrator or Pengawas.")
        return normalized


class MutationWorkspaceUpdate(MutationWorkspaceFields):
    pass


class MutationWorkspaceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    eselon_choice: str
    title: str
    description: str
    tmt: date | None = None
    status: Literal["Aktif", "Inaktif"]
    dataset_id: str | None = None
    created_at: datetime
    updated_at: datetime


class MutationWorkspaceDatasetUpdate(BaseModel):
    dataset_id: str = Field(min_length=1, max_length=64)


class MutationLookupRequest(BaseModel):
    nips: list[str] = Field(default_factory=list, max_length=5000)


class MutationLookupEmployee(BaseModel):
    nip: str
    nama: str
    jabatan: str
    unit_eselon_ii: str
    unit_eselon_iii: str
    unit_eselon_iv: str
    eselon: str


class MutationLookupResponse(BaseModel):
    matched_count: int
    unmatched_count: int
    invalid_count: int
    matches: dict[str, MutationLookupEmployee]
