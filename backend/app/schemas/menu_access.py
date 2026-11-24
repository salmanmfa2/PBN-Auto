from typing import Literal

from pydantic import BaseModel, Field


MenuKey = Literal[
    "analytics",
    "insights-beta",
    "analisis-kinerja",
    "analisis-mutasi",
    "penyusunan-kandidat",
    "fragment-petikan",
    "plt-plh",
    "nd-undangan",
    "progress-bahan",
    "simulasi-mutasi",
    "admin",
]


class MenuAccessPolicyRead(BaseModel):
    menu_key: MenuKey
    view_level: int = Field(ge=0, le=3)
    edit_level: int = Field(ge=0, le=3)


class MenuAccessSettingsRead(BaseModel):
    policies: list[MenuAccessPolicyRead]


class MenuAccessSettingsUpdate(BaseModel):
    policies: list[MenuAccessPolicyRead]
