from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


UserRole = Literal["user", "superuser"]
UserStatus = Literal["pending", "approved", "rejected"]


class UserRead(BaseModel):
    id: str
    username: str
    role: UserRole
    status: UserStatus
    is_active: bool
    created_at: datetime
    approved_at: datetime | None = None
    approved_by: str | None = None

    model_config = {"from_attributes": True}


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=4, max_length=200)


class LoginRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user: UserRead


class MessageResponse(BaseModel):
    message: str