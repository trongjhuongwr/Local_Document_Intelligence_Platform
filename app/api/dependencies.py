"""Lazily-constructed service singletons for API routes."""

from functools import lru_cache

from app.db.session import get_sessionmaker
from app.extraction.service import ExtractionService
from app.llm.ollama import OllamaLLMProvider
from app.retrieval.service import RetrievalService
from app.services.compare import CompareService
from app.services.evals_runner import EvalsRunner
from app.services.qa import QAService
from app.services.reviews import ReviewService


@lru_cache
def get_review_service() -> ReviewService:
    return ReviewService(get_sessionmaker())


@lru_cache
def get_evals_runner() -> EvalsRunner:
    """Process-wide runner so single-flight is enforced across requests."""
    return EvalsRunner()


@lru_cache
def get_compare_service() -> CompareService:
    return CompareService(
        get_sessionmaker(),
        ExtractionService(OllamaLLMProvider()),
        get_review_service(),
    )


@lru_cache
def get_retrieval_service() -> RetrievalService:
    return RetrievalService()


@lru_cache
def get_qa_service() -> QAService:
    return QAService(
        OllamaLLMProvider(),
        get_retrieval_service(),
        get_sessionmaker(),
    )
