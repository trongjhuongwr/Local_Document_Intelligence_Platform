"""Unit tests for structure-aware chunking."""

import pytest

from app.ingestion.chunking import chunk_elements, estimate_tokens
from app.ingestion.types import ParsedElement


def paragraph(text: str, page: int | None = None) -> ParsedElement:
    return ParsedElement(page_number=page, element_type="paragraph", text=text)


def make_paragraphs(count: int, sentences_per: int = 4) -> list[ParsedElement]:
    elements = []
    for i in range(count):
        text = " ".join(
            f"Paragraph {i} sentence {j} has some words in it." for j in range(sentences_per)
        )
        elements.append(paragraph(text))
    return elements


def test_estimate_tokens():
    assert estimate_tokens("") == 1
    assert estimate_tokens("abcd" * 100) == 100


def test_empty_input():
    assert chunk_elements([]) == []


def test_deterministic():
    elements = make_paragraphs(30)
    first = chunk_elements(elements)
    second = chunk_elements(elements)
    assert first == second


def test_chunk_sizes_within_bounds():
    elements = make_paragraphs(40)
    chunks = chunk_elements(elements, target_tokens=450, max_tokens=600, overlap_tokens=50)
    assert len(chunks) > 1
    for chunk in chunks:
        assert chunk.token_estimate <= 610  # small slack for joining separators
    for chunk in chunks[:-1]:
        assert chunk.token_estimate >= 300
    assert [chunk.order_index for chunk in chunks] == list(range(len(chunks)))


def test_table_never_split():
    table_text = "| col |\n" + "\n".join(f"| value row {i} with content |" for i in range(200))
    assert estimate_tokens(table_text) > 600
    table = ParsedElement(page_number=None, element_type="table", text=table_text)
    elements = [*make_paragraphs(3), table, *make_paragraphs(3)]
    chunks = chunk_elements(elements)
    containing = [chunk for chunk in chunks if table_text in chunk.text]
    assert len(containing) == 1
    assert containing[0].element_type == "table"
    others = [chunk for chunk in chunks if table_text not in chunk.text]
    assert all("value row 150" not in chunk.text for chunk in others)


def test_heading_starts_chunk_and_sets_section():
    elements = [
        ParsedElement(page_number=None, element_type="heading", text="Alpha"),
        *make_paragraphs(15),
        ParsedElement(page_number=None, element_type="heading", text="Beta"),
        *make_paragraphs(2),
    ]
    chunks = chunk_elements(elements)
    assert len(chunks) >= 3
    beta_start = next(i for i, chunk in enumerate(chunks) if chunk.section == "Beta")
    assert beta_start > 0
    assert all(chunk.section == "Alpha" for chunk in chunks[:beta_start])
    assert all(chunk.section == "Beta" for chunk in chunks[beta_start:])
    assert chunks[beta_start].text.startswith("Beta")
    assert chunks[0].text.startswith("Alpha")


def test_overlap_present():
    elements = make_paragraphs(25)
    chunks = chunk_elements(elements, overlap_tokens=50)
    assert len(chunks) >= 2
    assert chunks[0].metadata["has_overlap"] is False
    assert chunks[1].metadata["has_overlap"] is True
    overlap_prefix = chunks[1].text.split("\n\n")[0]
    assert overlap_prefix
    assert overlap_prefix in chunks[0].text


def test_no_overlap_when_disabled():
    elements = make_paragraphs(25)
    chunks = chunk_elements(elements, overlap_tokens=0)
    assert len(chunks) >= 2
    assert all(chunk.metadata["has_overlap"] is False for chunk in chunks)


def test_invalid_parameters_rejected():
    with pytest.raises(ValueError):
        chunk_elements([], target_tokens=600, max_tokens=450)
    with pytest.raises(ValueError):
        chunk_elements([], overlap_tokens=-1)


def test_page_number_and_metadata_propagation():
    elements = [
        ParsedElement(page_number=1, element_type="heading", text="Section One"),
        paragraph("A short paragraph on page one.", page=1),
        paragraph("Another short paragraph on page two.", page=2),
    ]
    chunks = chunk_elements(elements)
    assert len(chunks) == 1
    assert chunks[0].page_number == 1
    assert chunks[0].section == "Section One"
    assert "heading" in chunks[0].metadata["element_types"]
    assert "paragraph" in chunks[0].metadata["element_types"]
