from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

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

    database_url: str = "postgresql+asyncpg://docintel:docintel@localhost:5432/docintel_product"

    ollama_base_url: str = "http://localhost:11434"
    ollama_llm_model: str = "llama3.2:1b"
    ollama_embedding_model: str = "all-minilm"
    ollama_num_ctx: int = 4096
    ollama_timeout_seconds: float = 120.0

    enable_reranker: bool = False
    # BM25 is the measured production default: on DocFlowBench it ties hybrid
    # at Recall@5 while producing better early-rank metrics at much lower latency.
    default_retrieval_mode: Literal["bm25", "dense", "hybrid"] = "bm25"
    # Measured on evals/routing: keyword rules 92.5% vs LLM-only 70.0%,
    # and adding the LLM for no-keyword queries lowers accuracy to 82.5%.
    router_llm_enabled: bool = False

    max_upload_size_mb: int = 25
    product_mode: bool = True


def database_name(url: str) -> str:
    """Return the database component without ever exposing credentials."""
    return urlsplit(url.replace("postgresql+asyncpg", "postgresql", 1)).path.lstrip("/")


def assert_safe_database_url(url: str, *, role: Literal["test", "eval"]) -> None:
    """Prevent automated workloads from writing to the product database."""
    name = database_name(url)
    expected = f"docintel_{role}"
    if name == "docintel_product":
        raise RuntimeError(f"Refusing to run {role} workload against docintel_product")
    if name != expected:
        raise RuntimeError(
            f"{role.upper()} database must be named {expected}; received {name or 'unknown'}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
