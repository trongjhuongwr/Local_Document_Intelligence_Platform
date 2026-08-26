"""Shared Pydantic types used across parsers, chunking, and the pipeline."""

from typing import Any, Literal

from pydantic import BaseModel, Field

ElementType = Literal["title", "heading", "paragraph", "table", "list", "footer", "other"]


class ParsedElement(BaseModel):
    """A single structural element extracted from a source document."""

    page_number: int | None = None
    element_type: ElementType
    text: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class ParserOutput(BaseModel):
    """The full result of parsing one document."""

    elements: list[ParsedElement]
    page_count: int | None = None


class ChunkDraft(BaseModel):
    """A chunk produced by the chunker, not yet persisted."""

    text: str
    page_number: int | None
    section: str | None
    element_type: str
    order_index: int
    token_estimate: int
    metadata: dict[str, Any] = Field(default_factory=dict)
