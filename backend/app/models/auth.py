"""Authentication accounts and sessions.

Separate from the existing `User`/`Fund` domain models: these tables store real
login credentials (salted PBKDF2 hashes — never plaintext) and opaque session
tokens (stored only as SHA-256 hashes). A single email may hold at most one
account per role, so the same person can be both an investor and a founder.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class AuthAccount(Base):
    __tablename__ = "auth_accounts"
    __table_args__ = (UniqueConstraint("email", "role", name="uq_auth_email_role"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    role: Mapped[str] = mapped_column(String(32), index=True)  # "investor" | "founder"
    display_name: Mapped[str] = mapped_column(String(255))
    password_salt: Mapped[str] = mapped_column(String(64))
    password_hash: Mapped[str] = mapped_column(String(128))

    sessions: Mapped[list[AuthSession]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("auth_accounts.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    account: Mapped[AuthAccount] = relationship(back_populates="sessions")
