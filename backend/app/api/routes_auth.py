"""Authentication: signup, login, current-account, logout.

Accounts and sessions are persisted in the database. Passwords are stored only
as salted PBKDF2 hashes; session tokens only as SHA-256 hashes. Nothing here is
hardcoded — every account is created by a real signup request.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.passwords import (
    hash_password,
    hash_token,
    new_session_token,
    verify_password,
)
from app.db.base import get_db
from app.models.auth import AuthAccount, AuthSession
from app.schemas.requests import LoginIn, SignupIn

router = APIRouter(prefix="/api/auth", tags=["auth"])

SESSION_TTL = timedelta(days=30)


def _account_out(a: AuthAccount) -> dict:
    return {"id": a.id, "email": a.email, "display_name": a.display_name, "role": a.role}


def _issue_session(db: Session, account: AuthAccount) -> str:
    """Create a session row and return the raw (client-facing) token."""
    token = new_session_token()
    db.add(AuthSession(
        account_id=account.id,
        token_hash=hash_token(token),
        expires_at=datetime.now(UTC) + SESSION_TTL,
    ))
    return token


def current_account(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> AuthAccount:
    """Resolve the account from a `Authorization: Bearer <token>` header."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Not authenticated.")
    token = authorization.split(" ", 1)[1].strip()
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
    if session is None:
        raise HTTPException(401, "Invalid or expired session.")
    expires = session.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < datetime.now(UTC):
        db.delete(session)
        db.commit()
        raise HTTPException(401, "Session expired. Please sign in again.")
    return session.account


@router.post("/signup")
def signup(body: SignupIn, db: Session = Depends(get_db)) -> dict:
    existing = db.scalar(
        select(AuthAccount).where(
            AuthAccount.email == body.email, AuthAccount.role == body.role
        )
    )
    if existing is not None:
        raise HTTPException(409, f"An account already exists for this email as a {body.role}.")
    salt, digest = hash_password(body.password)
    account = AuthAccount(
        email=body.email, role=body.role, display_name=body.display_name.strip(),
        password_salt=salt, password_hash=digest,
    )
    db.add(account)
    db.flush()
    token = _issue_session(db, account)
    db.commit()
    return {"token": token, "account": _account_out(account)}


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)) -> dict:
    account = db.scalar(
        select(AuthAccount).where(
            AuthAccount.email == body.email, AuthAccount.role == body.role
        )
    )
    if account is None or not verify_password(body.password, account.password_salt, account.password_hash):
        raise HTTPException(401, "Incorrect email or password.")
    token = _issue_session(db, account)
    db.commit()
    return {"token": token, "account": _account_out(account)}


@router.get("/me")
def me(account: AuthAccount = Depends(current_account)) -> dict:
    return {"account": _account_out(account)}


@router.post("/logout")
def logout(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        session = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
        if session is not None:
            db.delete(session)
            db.commit()
    return {"ok": True}
