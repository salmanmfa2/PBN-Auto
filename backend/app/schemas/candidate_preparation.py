from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


CandidatePreparationPriority = Literal["high", "med", "low"]
CandidatePreparationOutputStyle = Literal["Single", "Batch"]


class CandidatePreparationWorkspaceFields(BaseModel):
    workspace_name: str = Field(min_length=1, max_length=255)
    target_jabatan: str = Field(min_length=1, max_length=512)
    date: date
    priority: CandidatePreparationPriority = "med"
    output_style: CandidatePreparationOutputStyle = "Single"

    @field_validator("workspace_name", "target_jabatan")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("This field must not be blank.")
        return normalized


class CandidatePreparationWorkspaceCreate(CandidatePreparationWorkspaceFields):
    pass


class CandidatePreparationWorkspaceUpdate(CandidatePreparationWorkspaceFields):
    pass


class CandidatePreparationWorkspaceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_name: str
    target_jabatan: str
    date: date
    priority: CandidatePreparationPriority
    output_style: CandidatePreparationOutputStyle
    created_at: datetime
    updated_at: datetime


class CandidatePreparationCandidateCreate(BaseModel):
    employee_id: int = Field(ge=1)
    consideration: str = Field(default="", max_length=5000)

    @field_validator("consideration")
    @classmethod
    def normalize_consideration(cls, value: str) -> str:
        return value.strip()


class CandidatePreparationCandidateUpdate(BaseModel):
    consideration: str = Field(max_length=5000)
    nip: str | None = Field(default=None, max_length=32)
    nama: str | None = Field(default=None, max_length=255)
    eselon_id: int | None = None
    eselon: str | None = Field(default=None, max_length=100)
    jabatan: str | None = Field(default=None, max_length=2000)
    unit_eselon_ii: str | None = Field(default=None, max_length=2000)
    unit_eselon_iii: str | None = Field(default=None, max_length=2000)
    gol: str | None = Field(default=None, max_length=50)
    pangkat: str | None = Field(default=None, max_length=255)
    pendidikan: str | None = Field(default=None, max_length=255)
    jurusan: str | None = Field(default=None, max_length=2000)
    universitas: str | None = Field(default=None, max_length=2000)
    tmt_jabatan: str | None = Field(default=None, max_length=32)
    tanggal_lahir: str | None = Field(default=None, max_length=32)
    riwayat_jabatan: str | None = Field(default=None, max_length=20000)

    @field_validator(
        "consideration",
        "nip",
        "nama",
        "eselon",
        "jabatan",
        "unit_eselon_ii",
        "unit_eselon_iii",
        "gol",
        "pangkat",
        "pendidikan",
        "jurusan",
        "universitas",
        "tmt_jabatan",
        "tanggal_lahir",
        "riwayat_jabatan",
    )
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class CandidatePreparationCandidateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    employee_id: int
    sort_order: int
    consideration: str
    nip: str
    nama: str
    eselon_id: int | None
    eselon: str
    jabatan: str
    unit_eselon_ii: str
    unit_eselon_iii: str
    gol: str
    pangkat: str
    pendidikan: str
    jurusan: str
    universitas: str
    tmt_jabatan: str
    tanggal_lahir: str
    riwayat_jabatan: str
