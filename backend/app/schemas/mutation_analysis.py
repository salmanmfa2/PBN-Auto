from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.dataset import DatasetPreview


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


class MutationWorkspaceDatasetState(BaseModel):
    raw_preview: DatasetPreview
    preview: DatasetPreview
    auto_clean_mode: str | None = None


class MutationWorkspaceDatasetAnalysisRequest(BaseModel):
    sheet_name: str = Field(min_length=1, max_length=255)


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
    eselon_id: int | None
    kategori: str | None
    masa_jabatan: str | None


class MutationLookupResponse(BaseModel):
    matched_count: int
    unmatched_count: int
    invalid_count: int
    matches: dict[str, MutationLookupEmployee]


class MutationWorkspaceDatasetAnalysis(BaseModel):
    preview: DatasetPreview
    matched_count: int
    unmatched_count: int
    invalid_count: int
    matches: dict[str, MutationLookupEmployee]


MutationCategory = Literal[
    "Mutasi",
    "Perpindahan dari Fungsional",
    "Promosi",
    "Demosi",
]


class MutationCategorySelection(BaseModel):
    row_index: int = Field(ge=0)
    category: MutationCategory | None


class MutationWorkspaceCategoriesUpdate(BaseModel):
    sheet_name: str = Field(min_length=1, max_length=255)
    categories: list[MutationCategorySelection] = Field(min_length=1, max_length=500)


class MutationTalentFinderOption(BaseModel):
    id: int
    label: str


class MutationTalentFinderFilterOptions(BaseModel):
    eselon: list[MutationTalentFinderOption]
    rumpun: list[MutationTalentFinderOption]


class MutationTalentFinderSearchRequest(BaseModel):
    eselon_ids: list[int] = Field(default_factory=list, max_length=20)
    name: str = Field(default="", max_length=100)
    rumpun_ids: list[int] = Field(default_factory=list, max_length=100)
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=100)
    sort_by: Literal[
        "nama",
        "eselon",
        "usia",
        "jabatan",
        "pendidikan",
        "jurusan",
        "universitas",
        "homebase",
        "lama_jabatan",
        "lama_eselon",
    ] = "nama"
    sort_order: Literal["asc", "desc"] = "asc"


class MutationTalentFinderCountResponse(BaseModel):
    total: int


class MutationTalentFinderEmployee(BaseModel):
    employee_id: int
    nama: str
    eselon: str
    usia: int | None
    jabatan: str
    pendidikan: str
    jurusan: str
    universitas: str
    lama_eselon: str | None
    lama_jabatan: str | None
    homebase: str


class MutationTalentFinderSearchResponse(BaseModel):
    total: int
    page: int
    page_size: int
    employees: list[MutationTalentFinderEmployee]
