"""Product-workspace API tests against the isolated PostgreSQL test database."""

import uuid

import pytest

from app.api.routes import cases as cases_route
from app.db.session import get_sessionmaker
from app.services.cases import CaseService
from app.services.reviews import ReviewService

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def disable_background_embeddings(monkeypatch: pytest.MonkeyPatch) -> None:
    async def no_index(document_ids: list[uuid.UUID]) -> None:
        return None

    monkeypatch.setattr(cases_route, "_index_documents", no_index)


async def test_case_crud_batch_upload_and_cascade(client) -> None:
    created = await client.post("/api/cases", json={"name": "Acme invoice review"})
    assert created.status_code == 201
    case = created.json()
    case_id = case["case_id"]
    assert case["readiness"] == "blocked"

    upload = await client.post(
        f"/api/cases/{case_id}/documents",
        files=[
            ("files", ("service_contract.txt", b"Contract maximum amount USD 5000")),
            ("files", ("invoice.txt", b"Invoice total USD 4200")),
            ("files", ("malware.exe", b"MZ-invalid")),
            ("document_types", (None, "contract")),
            ("document_types", (None, "invoice")),
            ("document_types", (None, "policy")),
        ],
    )
    assert upload.status_code == 200
    body = upload.json()
    assert body["success_count"] == 2
    assert body["failure_count"] == 1

    detail = (await client.get(f"/api/cases/{case_id}")).json()
    assert detail["readiness"] == "limited"
    assert detail["missing_document_types"] == ["purchase_order", "policy"]
    assert detail["document_count"] == 2

    duplicate = await client.post(
        f"/api/cases/{case_id}/documents",
        files=[
            ("files", ("invoice.txt", b"Invoice total USD 4200")),
            ("document_types", (None, "invoice")),
        ],
    )
    assert duplicate.json()["results"][0]["duplicate"] is True

    deleted = await client.delete(f"/api/cases/{case_id}")
    assert deleted.status_code == 204
    assert (await client.get(f"/api/cases/{case_id}")).status_code == 404


async def test_demo_case_is_idempotent(client) -> None:
    first = await client.post("/api/demo/cases")
    second = await client.post("/api/demo/cases")
    assert first.status_code == second.status_code == 200
    assert first.json()["case_id"] == second.json()["case_id"] == "demo-po-vendor-mismatch"
    assert first.json()["readiness"] == "complete"
    assert second.json()["document_count"] == 4


async def test_review_filters_return_total(client) -> None:
    sessionmaker = get_sessionmaker()
    case_id = f"review-filter-{uuid.uuid4().hex[:8]}"
    async with sessionmaker() as session:
        await CaseService(session).create("Review filter", case_id=case_id)
    reviews = ReviewService(sessionmaker)
    await reviews.create_many(
        None,
        case_id,
        [
            {"type": "vendor_name_mismatch", "severity": "high"},
            {"type": "policy_violation", "severity": "medium"},
        ],
    )
    response = await client.get(
        "/api/reviews", params={"case_id": case_id, "severity": "high", "limit": 1}
    )
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["reviews"][0]["severity"] == "high"
