import re
from datetime import date, datetime
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


Modality = Literal["daring", "luring"]
LookupStatus = Literal["matched", "not_found", "missing_nip", "duplicate"]


class PelantikanAgendaFields(BaseModel):
    tanggal_pelantikan: date
    nd_undangan_pelantikan: str = Field(min_length=1, max_length=255)
    tanggal_nd_undangan_pelantikan: date
    jam_pelantikan: str = Field(min_length=5, max_length=5)
    dresscode: str = Field(min_length=1, max_length=1000)
    level_jabatan: str = Field(min_length=1, max_length=255)

    @field_validator("nd_undangan_pelantikan", "dresscode", "level_jabatan")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("This field must not be blank.")
        return normalized

    @field_validator("jam_pelantikan")
    @classmethod
    def validate_time(cls, value: str) -> str:
        normalized = value.strip()
        if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", normalized):
            raise ValueError("Time must use the 24-hour HH:MM format.")
        return normalized


class PelantikanAgendaCreate(PelantikanAgendaFields):
    pass


class PelantikanAgendaUpdate(PelantikanAgendaFields):
    pass


class PelantikanAgendaRead(PelantikanAgendaFields):
    model_config = ConfigDict(from_attributes=True)

    id: str
    hari_pelantikan: str
    status: Literal["draft", "ready", "generated"]
    uploaded_filename: str | None
    uploaded_sheet: str | None
    last_generated_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PelantikanAgendaPersonRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    row_number: int
    source_no: str | None
    source_nama_nip: str | None
    source_jabatan_saat_ini: str | None
    source_usul_jabatan_baru: str | None
    nip: str | None
    nama: str
    jabatan: str
    unit_eselon_ii: str
    eselon: str | None
    lookup_status: LookupStatus
    selected: bool
    modality: Modality | None


class PelantikanAgendaDetail(PelantikanAgendaRead):
    people: list[PelantikanAgendaPersonRead] = Field(default_factory=list)


class PelantikanAgendaSummary(PelantikanAgendaRead):
    people_count: int
    selected_count: int


class PelantikanPersonChoice(BaseModel):
    id: int
    selected: bool
    modality: Modality | None = None

    @model_validator(mode="after")
    def require_modality_when_selected(self) -> Self:
        if self.selected and self.modality is None:
            raise ValueError("Select Daring or Luring for each included employee.")
        if not self.selected and self.modality is not None:
            raise ValueError("An excluded employee cannot have a modality.")
        return self


class PelantikanAgendaPeopleUpdate(BaseModel):
    people: list[PelantikanPersonChoice] = Field(min_length=1)


class PelantikanAgendaUploadRead(BaseModel):
    selected_sheet: str
    row_count: int
    people: list[PelantikanAgendaPersonRead]
