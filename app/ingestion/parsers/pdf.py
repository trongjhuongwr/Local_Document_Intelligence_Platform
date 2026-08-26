"""PDF parsing built on PyMuPDF.

Text blocks are extracted per page in reading order (top-to-bottom,
left-to-right). Short single-line blocks that are bold or noticeably larger
than the page's body font are classified as headings; everything else becomes
a paragraph. Page numbers are 1-based.
"""

import statistics
from typing import Any

import pymupdf

from app.core.exceptions import DocumentParseError
from app.ingestion.types import ParsedElement, ParserOutput

_BOLD_FLAG = 1 << 4
_HEADING_MAX_CHARS = 100
_HEADING_SIZE_RATIO = 1.15


def parse_pdf(data: bytes) -> ParserOutput:
    """Parse a PDF into ordered elements; raise DocumentParseError on corrupt files."""
    try:
        document = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise DocumentParseError(f"Cannot open PDF: {exc}") from exc
    try:
        if document.page_count == 0:
            raise DocumentParseError("PDF contains no pages")
        elements: list[ParsedElement] = []
        for page_index in range(document.page_count):
            try:
                page = document.load_page(page_index)
                raw = page.get_text("dict")
            except Exception as exc:
                raise DocumentParseError(f"Cannot read PDF page {page_index + 1}: {exc}") from exc
            elements.extend(_page_elements(raw, page_index + 1))
        return ParserOutput(elements=elements, page_count=document.page_count)
    finally:
        document.close()


def _page_elements(raw: dict[str, Any], page_number: int) -> list[ParsedElement]:
    blocks = [block for block in raw.get("blocks", []) if block.get("type") == 0]
    blocks.sort(key=lambda block: (round(block["bbox"][1], 1), round(block["bbox"][0], 1)))

    sizes = [
        float(span.get("size", 0.0))
        for block in blocks
        for line in block.get("lines", [])
        for span in line.get("spans", [])
        if span.get("text", "").strip()
    ]
    body_size = statistics.median(sizes) if sizes else 0.0

    elements: list[ParsedElement] = []
    for block in blocks:
        line_texts: list[str] = []
        max_size = 0.0
        bold = False
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            line_text = "".join(span.get("text", "") for span in spans).strip()
            if line_text:
                line_texts.append(line_text)
            for span in spans:
                if not span.get("text", "").strip():
                    continue
                max_size = max(max_size, float(span.get("size", 0.0)))
                if int(span.get("flags", 0)) & _BOLD_FLAG:
                    bold = True
        text = "\n".join(line_texts).strip()
        if not text:
            continue
        is_heading = (
            len(line_texts) == 1
            and len(text) <= _HEADING_MAX_CHARS
            and (bold or (body_size > 0 and max_size >= body_size * _HEADING_SIZE_RATIO))
        )
        elements.append(
            ParsedElement(
                page_number=page_number,
                element_type="heading" if is_heading else "paragraph",
                text=text,
                metadata={"font_size": round(max_size, 2), "bold": bold},
            )
        )
    return elements
