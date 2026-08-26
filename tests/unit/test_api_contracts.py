from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.api.routes.compare import CompareRequest
from app.api.routes.query import QueryRequest
from app.api.routes.reviews import BatchReviewRequest, ReviewDecisionRequest
from app.retrieval.base import RetrievalMode
from app.services.documents import DocumentService


def test_query_contract_uses_measured_default_and_validates_limits() -> None:
    request = QueryRequest(question="What is the invoice total?")
    assert request.mode == RetrievalMode.BM25

    with pytest.raises(ValidationError):
        QueryRequest(question="")
    with pytest.raises(ValidationError):
        QueryRequest(question="valid", top_k=51)


def test_review_decision_requires_reviewer_identity() -> None:
    assert ReviewDecisionRequest(reviewer="controller").reviewer == "controller"
    with pytest.raises(ValidationError):
        ReviewDecisionRequest.model_validate({})
    with pytest.raises(ValidationError):
        ReviewDecisionRequest(reviewer="")


def test_batch_review_contract_matches_what_the_spa_sends() -> None:
    review_ids = [str(uuid4()), str(uuid4())]
    request = BatchReviewRequest.model_validate(
        {
            "review_ids": review_ids,
            "action": "approve",
            "reviewer": "Controller Kim",
            "note": "Bulk approve applied by Controller Kim",
        }
    )
    assert [str(item) for item in request.review_ids] == review_ids
    assert request.action == "approve"


def test_batch_review_requires_at_least_one_id_and_a_known_action() -> None:
    with pytest.raises(ValidationError):
        BatchReviewRequest(review_ids=[], action="approve", reviewer="controller")
    with pytest.raises(ValidationError):
        BatchReviewRequest(review_ids=[uuid4()], action="archive", reviewer="controller")
    with pytest.raises(ValidationError):
        BatchReviewRequest.model_validate({"review_ids": ["not-a-uuid"], "action": "approve"})


def test_batch_review_requires_a_reviewer_for_decisions_only() -> None:
    with pytest.raises(ValidationError):
        BatchReviewRequest(review_ids=[uuid4()], action="approve")
    with pytest.raises(ValidationError):
        BatchReviewRequest(review_ids=[uuid4()], action="reject", reviewer="   ")
    # resolve is a state transition, not an attributed decision
    assert BatchReviewRequest(review_ids=[uuid4()], action="resolve").reviewer is None


def test_batch_review_deduplicates_repeated_ids() -> None:
    review_id = uuid4()
    request = BatchReviewRequest(review_ids=[review_id, review_id, uuid4()], action="resolve")
    assert len(request.review_ids) == 3
    assert len(request.unique_ids()) == 2


def test_compare_contract_requires_exactly_one_scope() -> None:
    assert CompareRequest(case_id="case_001").case_id == "case_001"
    with pytest.raises(ValidationError):
        CompareRequest()
    with pytest.raises(ValidationError):
        CompareRequest(case_id="case_001", document_ids=[uuid4()])


def test_document_deduplication_is_scoped_by_case_and_type() -> None:
    content_hash = "a" * 64
    first = DocumentService._deduplication_key(content_hash, "case_001", "invoice")
    duplicate = DocumentService._deduplication_key(content_hash, "case_001", "invoice")
    other_case = DocumentService._deduplication_key(content_hash, "case_002", "invoice")
    other_type = DocumentService._deduplication_key(content_hash, "case_001", "contract")

    assert first == duplicate
    assert len({first, other_case, other_type}) == 3
