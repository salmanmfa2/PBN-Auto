from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


AuthLevel = Literal[1, 2, 3, 4]
AssignableAuthLevel = Literal[1, 2, 3, 4]
ThemeName = Literal["default", "dark", "light"]


class UserRead(BaseModel):
    user: str
    name: str
    auth_level: AuthLevel
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class RegisterRequest(BaseModel):
    user: str = Field(min_length=3, max_length=80)
    name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=4, max_length=255)

    @field_validator("user", "name")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("This field must not be blank.")
        return normalized


class LoginRequest(BaseModel):
    user: str = Field(min_length=1, max_length=80)
    password: str


class AdminUserCreate(RegisterRequest):
    auth_level: AssignableAuthLevel = 1


class AdminUserUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    auth_level: AuthLevel
    password: str | None = Field(default=None, min_length=4, max_length=255)
    is_active: bool

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Name must not be blank.")
        return normalized


class AuthResponse(BaseModel):
    token: str
    user: UserRead


class MessageResponse(BaseModel):
    message: str


class ThemePreferenceRead(BaseModel):
    theme: ThemeName


class ThemePreferenceUpdate(BaseModel):
    theme: ThemeName
