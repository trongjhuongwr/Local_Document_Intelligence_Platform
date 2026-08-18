from typing import Any


class AppError(Exception):
    """Base class for all application errors, mapped to consistent API responses."""

    status_code: int = 500
    error_code: str = "internal_error"

    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class DocumentParseError(AppError):
    status_code = 422
    error_code = "document_parse_error"


class UnsupportedDocumentError(AppError):
    status_code = 415
    error_code = "unsupported_document"


class OllamaUnavailableError(AppError):
    status_code = 503
    error_code = "ollama_unavailable"


class EmbeddingError(AppError):
    status_code = 502
    error_code = "embedding_error"


class StructuredOutputValidationError(AppError):
    status_code = 502
    error_code = "structured_output_invalid"


class RetrievalError(AppError):
    status_code = 500
    error_code = "retrieval_error"


class CitationValidationError(AppError):
    status_code = 500
    error_code = "citation_validation_error"


class WorkflowError(AppError):
    status_code = 500
    error_code = "workflow_error"


class WorkflowNotFoundError(AppError):
    status_code = 404
    error_code = "workflow_not_found"


class DocumentNotFoundError(AppError):
    status_code = 404
    error_code = "document_not_found"


class FileTooLargeError(AppError):
    status_code = 413
    error_code = "file_too_large"
