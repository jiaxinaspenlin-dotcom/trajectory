"""Password hashing and opaque session tokens — standard library only.

No secret is hardcoded and no third-party crypto dependency is required.
Passwords are salted and stretched with PBKDF2-HMAC-SHA256. Session tokens are
random, opaque strings; only their SHA-256 hash is stored, so the database never
holds a usable token.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

_PBKDF2_ROUNDS = 200_000


def hash_password(password: str) -> tuple[str, str]:
    """Return (salt_hex, hash_hex) for a new password."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ROUNDS)
    return salt.hex(), digest.hex()


def verify_password(password: str, salt_hex: str, hash_hex: str) -> bool:
    """Constant-time check of a password against a stored salt+hash."""
    try:
        salt = bytes.fromhex(salt_hex)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ROUNDS)
    return hmac.compare_digest(digest.hex(), hash_hex)


def new_session_token() -> str:
    """A fresh opaque token to hand to the client."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """SHA-256 of a token — this is what we persist and look up by."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
