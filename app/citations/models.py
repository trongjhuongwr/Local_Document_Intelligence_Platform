from uuid import UUID

from pydantic import BaseModel


class Citation(BaseModel):
    """A verifiable pointer from an answer back to stored evidence."""

    citation_id: str
    chunk_id: UUID
    document_id: UUID
    filename: str
    document_type: str | None = None
    page_number: int | None = None
    section: str | None = None
    evidence: str


class VerificationResult(BaseModel):
    valid: bool
    used_citation_ids: list[str]
    unknown_citation_ids: list[str]
    unused_citation_ids: list[str]
    warnings: list[str]


class CitedAnswer(BaseModel):
    answer: str
    citations: dict[str, Citation]
    verification: VerificationResult
