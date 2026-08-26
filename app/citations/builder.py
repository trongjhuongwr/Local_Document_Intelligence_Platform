"""Deterministic citation construction — the LLM never creates citations.

Citations are assigned to retrieved chunks *before* generation; the model may
only reference the identifiers it was given ([C1], [C2], ...). Verification
afterwards checks it did not invent any.
"""

from app.citations.models import Citation
from app.retrieval.base import RetrievedChunk

MAX_EVIDENCE_CHARS = 400


def build_citations(chunks: list[RetrievedChunk]) -> dict[str, Citation]:
    citations: dict[str, Citation] = {}
    for index, chunk in enumerate(chunks, start=1):
        citation_id = f"C{index}"
        evidence = " ".join(chunk.text.split())
        if len(evidence) > MAX_EVIDENCE_CHARS:
            evidence = evidence[:MAX_EVIDENCE_CHARS].rstrip() + "…"
        citations[citation_id] = Citation(
            citation_id=citation_id,
            chunk_id=chunk.chunk_id,
            document_id=chunk.document_id,
            filename=chunk.filename,
            document_type=chunk.document_type,
            page_number=chunk.page_number,
            section=chunk.section,
            evidence=evidence,
        )
    return citations


def format_context(chunks: list[RetrievedChunk]) -> str:
    """Render retrieved chunks as an evidence block the model can cite from."""
    blocks = []
    for index, chunk in enumerate(chunks, start=1):
        page = f", page {chunk.page_number}" if chunk.page_number is not None else ""
        section = f", section: {chunk.section}" if chunk.section else ""
        blocks.append(f"[C{index}] ({chunk.filename}{page}{section})\n{chunk.text.strip()}")
    return "\n\n".join(blocks)
