from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr


class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone_number: Optional[str] = None


class DemoAccessRequest(BaseModel):
    name: str
    email: EmailStr


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    name: str
    email: str
    is_demo: bool = False


class TokenData(BaseModel):
    user_id: Optional[int] = None
    email: Optional[str] = None
    is_demo: bool = False


class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    phone_number: Optional[str] = None
    account_type: Optional[str] = "Registered"
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone_number: Optional[str] = None
    password: Optional[str] = None
