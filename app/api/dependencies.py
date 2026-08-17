"""Lazily-constructed service singletons for API routes."""

from functools import lru_cache

from app.db.session import get_sessionmaker
from app.extraction.service import ExtractionService
from app.llm.ollama import OllamaLLMProvider
from app.services.compare import CompareService
from app.services.reviews import ReviewService


@lru_cache
def get_review_service() -> ReviewService:
    return ReviewService(get_sessionmaker())


@lru_cache
def get_compare_service() -> CompareService:
    return CompareService(
        get_sessionmaker(),
        ExtractionService(OllamaLLMProvider()),
        get_review_service(),
    )
