"""MIME detection from magic bytes (with extension fallback) and parser dispatch.

The extension alone is never trusted for binary formats: PDF requires the
``%PDF`` magic and DOCX requires the ZIP magic. Text formats must be valid
UTF-8 and are disambiguated by extension.
"""

from collections.abc import Callable

from app.core.exceptions import UnsupportedDocumentError
from app.ingestion.parsers.csv import parse_csv
from app.ingestion.parsers.docx import parse_docx
from app.ingestion.parsers.pdf import parse_pdf
from app.ingestion.parsers.text import parse_markdown, parse_text
from app.ingestion.types import ParserOutput

PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
TEXT_MIME = "text/plain"
MARKDOWN_MIME = "text/markdown"
CSV_MIME = "text/csv"

_PDF_MAGIC = b"%PDF"
_ZIP_MAGIC = b"PK\x03\x04"
_OOXML_MARKER = b"[Content_Types].xml"

_TEXT_MIME_BY_EXTENSION = {
    ".txt": TEXT_MIME,
    ".md": MARKDOWN_MIME,
    ".markdown": MARKDOWN_MIME,
    ".csv": CSV_MIME,
}

EXTENSION_BY_MIME = {
    PDF_MIME: ".pdf",
    DOCX_MIME: ".docx",
    TEXT_MIME: ".txt",
    MARKDOWN_MIME: ".md",
    CSV_MIME: ".csv",
}

Parser = Callable[[bytes], ParserOutput]

_PARSER_BY_MIME: dict[str, Parser] = {
    PDF_MIME: parse_pdf,
    DOCX_MIME: parse_docx,
    TEXT_MIME: parse_text,
    MARKDOWN_MIME: parse_markdown,
    CSV_MIME: parse_csv,
}


def _extension(filename: str) -> str:
    name = filename.replace("\\", "/").rsplit("/", 1)[-1]
    dot = name.rfind(".")
    return name[dot:].lower() if dot > 0 else ""


def sniff_mime_type(data: bytes, filename: str) -> str:
    """Detect the MIME type of ``data``, using ``filename`` only as a fallback hint."""
    extension = _extension(filename)
    if data.startswith(_PDF_MAGIC):
        return PDF_MIME
    if data.startswith(_ZIP_MAGIC):
        if _OOXML_MARKER in data or extension == ".docx":
            return DOCX_MIME
        raise UnsupportedDocumentError(
            "ZIP archive is not a DOCX document", details={"filename": filename}
        )
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        raise UnsupportedDocumentError(
            "File type could not be determined from content",
            details={"filename": filename},
        ) from None
    mime_type = _TEXT_MIME_BY_EXTENSION.get(extension)
    if mime_type is None:
        raise UnsupportedDocumentError(
            f"Unsupported document type for extension {extension or '(none)'}",
            details={"filename": filename},
        )
    return mime_type


def get_parser(mime_type: str) -> Parser:
    """Return the parser registered for ``mime_type`` or raise UnsupportedDocumentError."""
    parser = _PARSER_BY_MIME.get(mime_type)
    if parser is None:
        raise UnsupportedDocumentError(f"No parser registered for MIME type {mime_type}")
    return parser
