"""Pure ingestion pipeline: bytes in, parsed elements and chunk drafts out.

No database or filesystem access happens here; the pipeline is deterministic
and safe to call from anywhere.
"""

import hashlib

from pydantic import BaseModel

from app.ingestion.chunking import chunk_elements
from app.ingestion.parsers.registry import get_parser, sniff_mime_type
from app.ingestion.types import ChunkDraft, ParsedElement

PARSER_VERSION = "1.0.0"


class PipelineResult(BaseModel):
    """Everything the ingestion pipeline derives from one uploaded file."""

    sha256: str
    mime_type: str
    size_bytes: int
    page_count: int | None
    elements: list[ParsedElement]
    chunks: list[ChunkDraft]
    parser_version: str = PARSER_VERSION


def run_pipeline(
    data: bytes,
    filename: str,
    *,
    target_tokens: int = 450,
    max_tokens: int = 600,
    overlap_tokens: int = 50,
) -> PipelineResult:
    """Sniff, parse, and chunk ``data``; raises AppError subclasses on bad input."""
    mime_type = sniff_mime_type(data, filename)
    parser = get_parser(mime_type)
    output = parser(data)
    chunks = chunk_elements(
        output.elements,
        target_tokens=target_tokens,
        max_tokens=max_tokens,
        overlap_tokens=overlap_tokens,
    )
    return PipelineResult(
        sha256=hashlib.sha256(data).hexdigest(),
        mime_type=mime_type,
        size_bytes=len(data),
        page_count=output.page_count,
        elements=output.elements,
        chunks=chunks,
    )
