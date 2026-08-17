"""Unit tests for retrieval building blocks: tokenizer, BM25 ranking, RRF, filters."""

import itertools
import uuid

import pytest
from sqlalchemy import select

from app.models import Chunk, Document
from app.retrieval.base import RetrievalMode, RetrievedChunk, SearchFilters
from app.retrieval.bm25 import CorpusEntry, rank_corpus, tokenize
from app.retrieval.fusion import reciprocal_rank_fusion
from app.retrieval.vector import apply_search_filters


def make_chunk(number: int, *, mode: RetrievalMode = RetrievalMode.BM25) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=uuid.UUID(int=number),
        document_id=uuid.UUID(int=1000 + number),
        filename=f"doc_{number}.pdf",
        document_type="invoice",
        page_number=1,
        section=None,
        text=f"chunk text {number}",
        score=1.0,
        rank=1,
        mode=mode,
    )


class TestTokenize:
    def test_lowercases_and_splits_on_non_alphanumerics(self):
        assert tokenize("Hello, World! 42") == ["hello", "world", "42"]

    def test_indexes_dashed_identifiers_whole_and_split(self):
        assert tokenize("INV-2025-83614") == ["inv-2025-83614", "inv", "2025", "83614"]

    def test_keeps_numbers_and_mixed_tokens(self):
        assert tokenize("net-30 terms") == ["net-30", "net", "30", "terms"]

    def test_empty_and_punctuation_only(self):
        assert tokenize("") == []
        assert tokenize("!!! --- ???") == []


CORPUS = [
    CorpusEntry(
        chunk_id=uuid.UUID(int=1),
        document_id=uuid.UUID(int=101),
        filename="invoice_001.pdf",
        document_type="invoice",
        page_number=1,
        section=None,
        text="Invoice INV-2025-83614 issued by Acme Corp, total due 4200 USD.",
    ),
    CorpusEntry(
        chunk_id=uuid.UUID(int=2),
        document_id=uuid.UUID(int=102),
        filename="service_contract.pdf",
        document_type="contract",
        page_number=1,
        section=None,
        text="Service contract between Acme Corp and Beta LLC, maximum amount 100000.",
    ),
    CorpusEntry(
        chunk_id=uuid.UUID(int=3),
        document_id=uuid.UUID(int=103),
        filename="payment_policy.pdf",
        document_type="policy",
        page_number=1,
        section=None,
        text="Payment policy requires net-30 payment terms for all approved vendors.",
    ),
]


class TestRankCorpus:
    def test_exact_invoice_number_ranks_invoice_first(self):
        results = rank_corpus("What is the total due on invoice INV-2025-83614?", CORPUS)
        assert results
        assert results[0].filename == "invoice_001.pdf"
        assert results[0].mode is RetrievalMode.BM25
        assert results[0].rank == 1

    def test_split_identifier_part_still_matches(self):
        results = rank_corpus("invoice 83614", CORPUS)
        assert results
        assert results[0].filename == "invoice_001.pdf"

    def test_policy_query_ranks_policy_first(self):
        results = rank_corpus("What payment terms does the policy require?", CORPUS)
        assert results[0].filename == "payment_policy.pdf"

    def test_scores_descending_and_ranks_sequential(self):
        results = rank_corpus("Acme Corp payment", CORPUS, top_k=3)
        assert [chunk.rank for chunk in results] == list(range(1, len(results) + 1))
        assert all(a.score >= b.score for a, b in itertools.pairwise(results))

    def test_no_overlap_returns_empty(self):
        assert rank_corpus("zzz qqq xyzzy", CORPUS) == []

    def test_empty_corpus_and_empty_query(self):
        assert rank_corpus("anything", []) == []
        assert rank_corpus("", CORPUS) == []

    def test_top_k_truncates(self):
        results = rank_corpus("Acme Corp payment contract invoice policy", CORPUS, top_k=2)
        assert len(results) == 2

    def test_deterministic_across_runs(self):
        first = rank_corpus("Acme Corp payment terms", CORPUS)
        second = rank_corpus("Acme Corp payment terms", CORPUS)
        assert [c.chunk_id for c in first] == [c.chunk_id for c in second]
        assert [c.score for c in first] == [c.score for c in second]


class TestReciprocalRankFusion:
    def test_known_rankings_produce_expected_scores_and_order(self):
        chunk_a, chunk_b, chunk_c = make_chunk(1), make_chunk(2), make_chunk(3)
        fused = reciprocal_rank_fusion(
            [[chunk_a, chunk_b, chunk_c], [chunk_a, chunk_c]], k=60, top_k=10
        )
        assert [c.chunk_id for c in fused] == [chunk_a.chunk_id, chunk_c.chunk_id, chunk_b.chunk_id]
        assert fused[0].score == pytest.approx(1 / 61 + 1 / 61)
        assert fused[1].score == pytest.approx(1 / 63 + 1 / 62)
        assert fused[2].score == pytest.approx(1 / 62)

    def test_output_is_relabelled_hybrid_with_fresh_ranks(self):
        fused = reciprocal_rank_fusion([[make_chunk(1)], [make_chunk(2)]], k=60, top_k=10)
        assert all(c.mode is RetrievalMode.HYBRID for c in fused)
        assert [c.rank for c in fused] == [1, 2]

    def test_ties_break_by_chunk_id_hex(self):
        low_id, high_id = make_chunk(1), make_chunk(2)
        # Same rank in disjoint rankings -> identical RRF score.
        fused = reciprocal_rank_fusion([[high_id], [low_id]], k=60, top_k=10)
        assert fused[0].score == pytest.approx(fused[1].score)
        assert [c.chunk_id for c in fused] == [low_id.chunk_id, high_id.chunk_id]

    def test_top_k_truncates(self):
        fused = reciprocal_rank_fusion([[make_chunk(1), make_chunk(2), make_chunk(3)]], top_k=2)
        assert len(fused) == 2

    def test_empty_rankings(self):
        assert reciprocal_rank_fusion([[], []], top_k=5) == []


class TestApplySearchFilters:
    BASE = select(Chunk).join(Document, Document.id == Chunk.document_id)

    def test_none_filters_leave_statement_unchanged(self):
        assert str(apply_search_filters(self.BASE, None)) == str(self.BASE)
        assert str(apply_search_filters(self.BASE, SearchFilters())) == str(self.BASE)

    def test_all_filters_become_where_clauses(self):
        filters = SearchFilters(
            document_ids=[uuid.UUID(int=7)],
            document_type="invoice",
            case_id="case_001",
            filename="invoice_001.pdf",
        )
        sql = str(apply_search_filters(self.BASE, filters))
        assert "chunks.document_id IN" in sql
        assert "documents.document_type =" in sql
        assert "documents.case_id =" in sql
        assert "documents.filename =" in sql

    def test_single_filter_only_adds_its_clause(self):
        sql = str(apply_search_filters(self.BASE, SearchFilters(case_id="case_001")))
        assert "documents.case_id =" in sql
        assert "documents.document_type" not in sql
        assert "documents.filename" not in sql
