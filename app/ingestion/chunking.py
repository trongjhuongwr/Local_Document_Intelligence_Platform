"""Structure-aware chunking of parsed document elements.

The chunker accumulates elements into chunks of roughly ``target_tokens``
estimated tokens (never exceeding ``max_tokens`` except for indivisible
tables), starts a new chunk at every heading, propagates the heading text as
the ``section`` of following chunks, and seeds each continuation chunk with
the tail sentences of its predecessor as overlap. The algorithm is fully
deterministic.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass

from app.ingestion.types import ChunkDraft, ParsedElement

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


def estimate_tokens(text: str) -> int:
    """Cheap token estimate: roughly four characters per token."""
    return max(1, len(text) // 4)


def _split_sentences(text: str) -> list[str]:
    return [part for part in _SENTENCE_SPLIT.split(text) if part.strip()]


def _tail_sentences(text: str, budget_tokens: int) -> str:
    """Return the trailing sentences of ``text`` that fit within ``budget_tokens``."""
    tail: list[str] = []
    total = 0
    for sentence in reversed(_split_sentences(text)):
        cost = estimate_tokens(sentence)
        if total + cost > budget_tokens:
            break
        tail.insert(0, sentence)
        total += cost
    return " ".join(tail)


def _split_large_text(text: str, max_tokens: int) -> list[str]:
    """Split oversized text into sentence-aligned pieces of at most ``max_tokens``."""
    if estimate_tokens(text) <= max_tokens:
        return [text]
    max_chars = max_tokens * 4
    pieces: list[str] = []
    current: list[str] = []
    current_tokens = 0

    def flush_current() -> None:
        nonlocal current, current_tokens
        if current:
            pieces.append(" ".join(current))
            current = []
            current_tokens = 0

    for sentence in _split_sentences(text):
        cost = estimate_tokens(sentence)
        if cost > max_tokens:
            # A single pathological sentence: hard-split on character windows.
            flush_current()
            pieces.extend(
                sentence[offset : offset + max_chars]
                for offset in range(0, len(sentence), max_chars)
            )
            continue
        if current and current_tokens + cost > max_tokens:
            flush_current()
        current.append(sentence)
        current_tokens += cost
    flush_current()
    return pieces


@dataclass
class _Piece:
    text: str
    page_number: int | None
    element_type: str
    is_overlap: bool = False


def chunk_elements(
    elements: Sequence[ParsedElement],
    *,
    target_tokens: int = 450,
    max_tokens: int = 600,
    overlap_tokens: int = 50,
) -> list[ChunkDraft]:
    """Group parsed elements into ordered, structure-aware chunk drafts."""
    if target_tokens <= 0 or max_tokens < target_tokens or overlap_tokens < 0:
        raise ValueError(
            "chunking parameters must satisfy 0 < target_tokens <= max_tokens, overlap_tokens >= 0"
        )

    chunks: list[ChunkDraft] = []
    buffer: list[_Piece] = []
    section: str | None = None

    def buffer_tokens() -> int:
        return sum(estimate_tokens(piece.text) for piece in buffer)

    def flush(*, carry_overlap: bool) -> None:
        """Emit the buffer as a chunk; optionally seed the next buffer with overlap."""
        nonlocal buffer
        content = [piece for piece in buffer if not piece.is_overlap]
        if not content:
            buffer = []
            return
        text = "\n\n".join(piece.text for piece in buffer)
        first = content[0]
        last = content[-1]
        has_table = any(piece.element_type == "table" for piece in content)
        element_type = "table" if has_table else first.element_type
        chunks.append(
            ChunkDraft(
                text=text,
                page_number=first.page_number,
                section=section,
                element_type=element_type,
                order_index=len(chunks),
                token_estimate=estimate_tokens(text),
                metadata={
                    "element_types": sorted({piece.element_type for piece in content}),
                    "has_overlap": any(piece.is_overlap for piece in buffer),
                },
            )
        )
        buffer = []
        if carry_overlap and overlap_tokens > 0 and last.element_type != "table":
            tail = _tail_sentences(last.text, overlap_tokens)
            if tail:
                buffer = [_Piece(tail, last.page_number, "paragraph", is_overlap=True)]

    for element in elements:
        text = element.text.strip()
        if not text:
            continue
        element_type = element.element_type

        if element_type in ("heading", "title"):
            flush(carry_overlap=False)
            section = text
            buffer.append(_Piece(text, element.page_number, element_type))
            continue

        if element_type == "table":
            # A table is indivisible: flush first if it does not fit, then keep it whole
            # even when it alone exceeds max_tokens.
            if buffer and buffer_tokens() + estimate_tokens(text) > max_tokens:
                flush(carry_overlap=False)
            buffer.append(_Piece(text, element.page_number, element_type))
            if buffer_tokens() >= target_tokens:
                flush(carry_overlap=True)
            continue

        for piece_text in _split_large_text(text, max_tokens):
            cost = estimate_tokens(piece_text)
            if buffer and buffer_tokens() + cost > max_tokens:
                flush(carry_overlap=True)
            buffer.append(_Piece(piece_text, element.page_number, element_type))
            if buffer_tokens() >= target_tokens:
                flush(carry_overlap=True)

    flush(carry_overlap=False)
    return chunks
