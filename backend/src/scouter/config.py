from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Every setting comes from the environment (or .env). Secrets default to None."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/postgres"
    elastic_url: str | None = None
    anthropic_api_key: str | None = None
    model_default: str = "claude-sonnet-5-5"
    model_cheap: str = "claude-haiku-5-5"
    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None
    public_app_url: str = "http://localhost:8000"
    scouter_token: str | None = None
    scan_hour: int = 7
    timezone: str = "Asia/Jerusalem"


@lru_cache
def get_settings() -> Settings:
    return Settings()
