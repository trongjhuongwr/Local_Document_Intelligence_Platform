"""Batch review decisions against real review_tasks rows."""

import uuid

import pytest

from app.db.session import get_sessionmaker
from app.services.cases import CaseService
from app.services.reviews import ReviewService

pytestmark = pytest.mark.integration


async def _seed_findings(case_id: str, count: int) -> list[str]:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        await CaseService(session).create("Batch review fixture", case_id=case_id)
    return await ReviewService(sessionmaker).create_many(
        None,
        case_id,
        [{"type": f"finding_{index}", "severity": "high"} for index in range(count)],
    )


async def _delete_case(case_id: str) -> None:
    async with get_sessionmaker()() as session:
        await CaseService(session).delete(case_id)


async def test_batch_approve_updates_every_open_finding(client) -> None:
    case_id = f"batch-{uuid.uuid4().hex[:8]}"
    review_ids = await _seed_findings(case_id, 3)
    try:
        response = await client.post(
            "/api/reviews/batch",
            json={
                "review_ids": review_ids,
                "action": "approve",
                "reviewer": "Controller Kim",
                "note": "Bulk approve applied by Controller Kim",
            },
        )
        assert response.status_code == 200
        body = response.json()

        assert body["action"] == "approve"
        assert body["updated_count"] == 3
        assert body["failed"] == []
        assert body["failed_count"] == 0
        assert {item["review_id"] for item in body["updated"]} == set(review_ids)
        for item in body["updated"]:
            assert item["status"] == "APPROVED"
            assert item["reviewer"] == "Controller Kim"
            assert item["note"] == "Bulk approve applied by Controller Kim"
            assert item["decided_at"] is not None

        listed = await client.get("/api/reviews", params={"case_id": case_id, "status": "APPROVED"})
        assert listed.json()["total"] == 3
    finally:
        await _delete_case(case_id)


async def test_batch_resolve_follows_the_service_transition_rules(client) -> None:
    case_id = f"batch-{uuid.uuid4().hex[:8]}"
    review_ids = await _seed_findings(case_id, 2)
    try:
        # OPEN findings cannot be resolved: the service rejects the transition
        premature = await client.post(
            "/api/reviews/batch", json={"review_ids": review_ids, "action": "resolve"}
        )
        assert premature.status_code == 200
        assert premature.json()["updated_count"] == 0
        assert premature.json()["failed_count"] == 2
        assert {item["error"] for item in premature.json()["failed"]} == {
            "invalid_review_transition"
        }

        rejected = await client.post(
            "/api/reviews/batch",
            json={"review_ids": review_ids, "action": "reject", "reviewer": "Controller Kim"},
        )
        assert rejected.json()["updated_count"] == 2

        resolved = await client.post(
            "/api/reviews/batch", json={"review_ids": review_ids, "action": "resolve"}
        )
        assert resolved.json()["updated_count"] == 2
        assert all(item["status"] == "RESOLVED" for item in resolved.json()["updated"])
    finally:
        await _delete_case(case_id)


async def test_batch_reports_partial_failures_per_id(client) -> None:
    case_id = f"batch-{uuid.uuid4().hex[:8]}"
    review_ids = await _seed_findings(case_id, 2)
    missing_id = str(uuid.uuid4())
    try:
        # decide one up front so it is no longer OPEN
        await client.post(
            f"/api/reviews/{review_ids[0]}/approve", json={"reviewer": "Controller Kim"}
        )

        response = await client.post(
            "/api/reviews/batch",
            json={
                "review_ids": [*review_ids, missing_id],
                "action": "approve",
                "reviewer": "Controller Kim",
            },
        )
        assert response.status_code == 200
        body = response.json()

        assert body["requested_count"] == 3
        assert body["updated_count"] == 1
        assert [item["review_id"] for item in body["updated"]] == [review_ids[1]]

        failures = {item["review_id"]: item["error"] for item in body["failed"]}
        assert failures == {
            review_ids[0]: "invalid_review_transition",
            missing_id: "review_not_found",
        }
        assert all(item["message"] for item in body["failed"])
    finally:
        await _delete_case(case_id)


async def test_batch_validation_rejects_bad_payloads(client) -> None:
    empty = await client.post(
        "/api/reviews/batch",
        json={"review_ids": [], "action": "approve", "reviewer": "Controller Kim"},
    )
    assert empty.status_code == 422

    no_reviewer = await client.post(
        "/api/reviews/batch", json={"review_ids": [str(uuid.uuid4())], "action": "approve"}
    )
    assert no_reviewer.status_code == 422

    bad_action = await client.post(
        "/api/reviews/batch",
        json={"review_ids": [str(uuid.uuid4())], "action": "archive", "reviewer": "Kim"},
    )
    assert bad_action.status_code == 422
