"""Application configuration loaded from environment variables.

No secret is ever hardcoded. Every value comes from the environment (or a
local `.env` file). When optional integrations are unconfigured the app
degrades rather than failing or returning fabricated data.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve repo-relative paths so the app runs from any working directory.
BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # AI provider (OpenAI)
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4o", alias="OPENAI_MODEL")
    ai_timeout_seconds: float = Field(default=60.0, alias="AI_TIMEOUT_SECONDS")

    # GitHub
    github_token: str = Field(default="", alias="GITHUB_TOKEN")
    http_timeout_seconds: float = Field(default=30.0, alias="HTTP_TIMEOUT_SECONDS")

    # Database
    database_url: str = Field(default="", alias="DATABASE_URL")

    # CORS
    backend_cors_origins: str = Field(
        default="http://localhost:3000", alias="BACKEND_CORS_ORIGINS"
    )

    # Uploads
    max_upload_size_mb: int = Field(default=15, alias="MAX_UPLOAD_SIZE_MB")
    upload_dir: str = Field(default="./uploads", alias="UPLOAD_DIR")

    # Rate limiting
    ai_rate_limit_per_minute: int = Field(default=20, alias="AI_RATE_LIMIT_PER_MINUTE")

    # Security / runtime
    secret_key: str = Field(default="change-me-in-production", alias="SECRET_KEY")
    environment: str = Field(default="development", alias="ENVIRONMENT")

    @property
    def resolved_database_url(self) -> str:
        """Return the DB URL, defaulting to a local SQLite file when unset.

        SQLite is a documented zero-config fallback so the whole app (and its
        test suite) runs without a Postgres container. docker-compose provides
        Postgres for a production-shaped setup.
        """
        if self.database_url:
            return self.database_url
        return f"sqlite+pysqlite:///{BACKEND_DIR / 'trajectory.db'}"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.backend_cors_origins.split(",") if o.strip()]

    @property
    def upload_path(self) -> Path:
        p = Path(self.upload_dir)
        if not p.is_absolute():
            p = BACKEND_DIR / p
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def ai_enabled(self) -> bool:
        return bool(self.openai_api_key.strip())

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
