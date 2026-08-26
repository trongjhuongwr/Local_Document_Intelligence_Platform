"""Plain-text and Markdown parsing."""

import re

from app.core.exceptions import DocumentParseError
from app.ingestion.types import ParsedElement, ParserOutput

_PARAGRAPH_SPLIT = re.compile(r"\n\s*\n")
_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
_LIST_RE = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+")


def _decode(data: bytes) -> str:
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise DocumentParseError("File is not valid UTF-8 text") from exc


def parse_text(data: bytes) -> ParserOutput:
    """Parse plain text: blocks separated by blank lines become paragraphs."""
    content = _decode(data)
    elements = [
        ParsedElement(page_number=None, element_type="paragraph", text=paragraph.strip())
        for paragraph in _PARAGRAPH_SPLIT.split(content)
        if paragraph.strip()
    ]
    return ParserOutput(elements=elements, page_count=None)


def parse_markdown(data: bytes) -> ParserOutput:
    """Parse Markdown: ``#`` lines become headings, fenced code blocks become 'other'."""
    content = _decode(data)
    elements: list[ParsedElement] = []
    paragraph_lines: list[str] = []
    list_lines: list[str] = []
    fence_lines: list[str] | None = None

    def flush_paragraph() -> None:
        nonlocal paragraph_lines
        text = "\n".join(paragraph_lines).strip()
        if text:
            elements.append(ParsedElement(page_number=None, element_type="paragraph", text=text))
        paragraph_lines = []

    def flush_list() -> None:
        nonlocal list_lines
        text = "\n".join(list_lines).strip()
        if text:
            elements.append(ParsedElement(page_number=None, element_type="list", text=text))
        list_lines = []

    def flush_fence() -> None:
        nonlocal fence_lines
        if fence_lines is not None:
            text = "\n".join(fence_lines).strip()
            if text:
                elements.append(
                    ParsedElement(
                        page_number=None,
                        element_type="other",
                        text=text,
                        metadata={"kind": "code_fence"},
                    )
                )
        fence_lines = None

    for line in content.splitlines():
        stripped = line.strip()
        if fence_lines is not None:
            if stripped.startswith("```"):
                flush_fence()
            else:
                fence_lines.append(line)
            continue
        if stripped.startswith("```"):
            flush_paragraph()
            flush_list()
            fence_lines = []
            continue
        heading_match = _HEADING_RE.match(stripped)
        if heading_match:
            flush_paragraph()
            flush_list()
            elements.append(
                ParsedElement(
                    page_number=None,
                    element_type="heading",
                    text=heading_match.group(2).strip(),
                    metadata={"level": len(heading_match.group(1))},
                )
            )
            continue
        if _LIST_RE.match(line):
            flush_paragraph()
            list_lines.append(stripped)
            continue
        if not stripped:
            flush_paragraph()
            flush_list()
            continue
        if list_lines:
            # Continuation line of a list item.
            list_lines.append(stripped)
            continue
        paragraph_lines.append(stripped)

    flush_fence()
    flush_paragraph()
    flush_list()
    return ParserOutput(elements=elements, page_count=None)
