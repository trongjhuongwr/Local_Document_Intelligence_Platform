from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, loaded from environment variables and an optional .env file."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Local Document Intelligence Platform"
    app_version: str = "0.1.0"
    environment: str = "development"
    log_level: str = "INFO"

    api_host: str = "127.0.0.1"
    api_port: int = 8000

    database_url: str = "postgresql+asyncpg://docintel:docintel@localhost:5432/docintel"

    ollama_base_url: str = "http://localhost:11434"
    ollama_llm_model: str = "llama3.2:1b"
    ollama_embedding_model: str = "all-minilm"
    ollama_num_ctx: int = 4096
    ollama_timeout_seconds: float = 120.0

    enable_reranker: bool = False
    # Measured on evals/routing: keyword rules 92.5% vs best LLM prompt 67.5%,
    # and adding the LLM for no-keyword queries lowers accuracy to 82.5%.
    router_llm_enabled: bool = False

    max_upload_size_mb: int = 25


@lru_cache
def get_settings() -> Settings:
    return Settings()
