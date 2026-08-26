"""DOCX parsing built on python-docx.

Paragraphs and tables are walked in body order. Paragraphs styled with the
built-in Heading/Title styles map to heading/title elements; each table
becomes a single ``table`` element rendered as a Markdown grid.
"""

import io
from collections.abc import Iterator
from typing import Any

from docx import Document as load_docx
from docx.document import Document as DocxDocument
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

from app.core.exceptions import DocumentParseError
from app.ingestion.types import ElementType, ParsedElement, ParserOutput


def parse_docx(data: bytes) -> ParserOutput:
    """Parse a DOCX file; raise DocumentParseError on corrupt input."""
    try:
        document = load_docx(io.BytesIO(data))
    except Exception as exc:
        raise DocumentParseError(f"Cannot open DOCX: {exc}") from exc

    elements: list[ParsedElement] = []
    for block in _iter_blocks(document):
        element = (
            _paragraph_element(block) if isinstance(block, Paragraph) else _table_element(block)
        )
        if element is not None:
            elements.append(element)
    return ParserOutput(elements=elements, page_count=None)


def _iter_blocks(document: DocxDocument) -> Iterator[Paragraph | Table]:
    """Yield paragraphs and tables in true body order."""
    for child in document.element.body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, document)
        elif child.tag == qn("w:tbl"):
            yield Table(child, document)


def _paragraph_element(paragraph: Paragraph) -> ParsedElement | None:
    text = paragraph.text.strip()
    if not text:
        return None
    style_name = ""
    if paragraph.style is not None and paragraph.style.name:
        style_name = paragraph.style.name
    element_type: ElementType = "paragraph"
    metadata: dict[str, Any] = {"style": style_name} if style_name else {}
    if style_name == "Title":
        element_type = "title"
    elif style_name.startswith("Heading"):
        element_type = "heading"
        parts = style_name.split()
        if len(parts) == 2 and parts[1].isdigit():
            metadata["level"] = int(parts[1])
    elif "List" in style_name:
        element_type = "list"
    return ParsedElement(page_number=None, element_type=element_type, text=text, metadata=metadata)


def _table_element(table: Table) -> ParsedElement | None:
    rows = [
        [" ".join(cell.text.split()).replace("|", "\\|") for cell in row.cells]
        for row in table.rows
    ]
    rows = [row for row in rows if any(cell for cell in row)]
    if not rows:
        return None
    width = max(len(row) for row in rows)
    normalized = [row + [""] * (width - len(row)) for row in rows]
    header, *body = normalized
    lines = [
        "| " + " | ".join(header) + " |",
        "|" + "|".join(" --- " for _ in range(width)) + "|",
    ]
    lines.extend("| " + " | ".join(row) + " |" for row in body)
    return ParsedElement(
        page_number=None,
        element_type="table",
        text="\n".join(lines),
        metadata={"rows": len(normalized), "columns": width},
    )
