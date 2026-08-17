"""CSV parsing built on pandas.

The file is loaded into a DataFrame and rendered as one ``table`` element per
slice of up to 30 rows, each formatted as a Markdown table. Column names are
recorded in element metadata.
"""

import io
from typing import Any

import pandas as pd

from app.core.exceptions import DocumentParseError
from app.ingestion.types import ParsedElement, ParserOutput

_ROWS_PER_SLICE = 30


def parse_csv(data: bytes) -> ParserOutput:
    """Parse a CSV file; raise DocumentParseError on unreadable input."""
    try:
        frame = pd.read_csv(io.BytesIO(data))
    except Exception as exc:
        raise DocumentParseError(f"Cannot parse CSV: {exc}") from exc

    columns = [str(column) for column in frame.columns]
    elements: list[ParsedElement] = []
    if frame.empty:
        elements.append(_slice_element(columns, [], 0))
    else:
        for start in range(0, len(frame), _ROWS_PER_SLICE):
            window = frame.iloc[start : start + _ROWS_PER_SLICE]
            rows = [
                [_cell(value) for value in row] for row in window.itertuples(index=False, name=None)
            ]
            elements.append(_slice_element(columns, rows, start))
    return ParserOutput(elements=elements, page_count=None)


def _cell(value: Any) -> str:
    if value is None or pd.isna(value):
        return ""
    return " ".join(str(value).split()).replace("|", "\\|")


def _slice_element(columns: list[str], rows: list[list[str]], row_start: int) -> ParsedElement:
    header = [column.replace("|", "\\|") for column in columns]
    lines = [
        "| " + " | ".join(header) + " |",
        "|" + "|".join(" --- " for _ in header) + "|",
    ]
    lines.extend("| " + " | ".join(row) + " |" for row in rows)
    return ParsedElement(
        page_number=None,
        element_type="table",
        text="\n".join(lines),
        metadata={"columns": columns, "row_start": row_start, "row_count": len(rows)},
    )
