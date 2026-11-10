from datetime import date, datetime
import re
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class PltPlhRecordFields(BaseModel):
    jabatan_kosong: str = Field(min_length=1, max_length=2000)
    pejabat_pengganti: str = Field(min_length=1, max_length=2000)
    pejabat_pengganti_nip: str | None = Field(default=None, max_length=32)
    jabatan_definitif_pengganti: str = Field(min_length=1, max_length=2000)
    nomor_surat: str = Field(min_length=1, max_length=2000)
    tmt: date

    @field_validator(
        "jabatan_kosong",
        "pejabat_pengganti",
        "jabatan_definitif_pengganti",
        "nomor_surat",
    )
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("This field must not be blank.")
        return normalized

    @field_validator("pejabat_pengganti_nip")
    @classmethod
    def normalize_pejabat_nip(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = re.sub(r"\D", "", value)
        if not normalized:
            return None
        if len(normalized) != 18:
            raise ValueError("Pejabat Pengganti NIP must contain exactly 18 digits.")
        return normalized

    @model_validator(mode="after")
    def ensure_tmt_is_not_future(self) -> Self:
        if self.tmt > date.today():
            raise ValueError("TMT cannot be in the future.")
        return self


class PltPlhRecordCreate(PltPlhRecordFields):
    pass


class PltPlhRecordUpdate(PltPlhRecordFields):
    pass


class PltPlhRecordActiveUpdate(BaseModel):
    is_active: bool


class PltPlhRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    jabatan_kosong: str
    pejabat_pengganti: str
    pejabat_pengganti_nip: str | None
    jabatan_definitif_pengganti: str
    nomor_surat: str
    tmt: date
    masa_kerja_tahun: int
    masa_kerja_bulan: int
    masa_kerja: str
    status: Literal["Inaktif", "Aktif", "Mendekati 6 Bulan", "Lebih dari 6 Bulan"]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PltPlhEmployeeOption(BaseModel):
    nip: str
    nama: str
    jabatan_definitif_pengganti: str
