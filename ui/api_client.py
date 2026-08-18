"""Thin typed httpx client for the Document Intelligence FastAPI backend.

Reads the base URL from the ``API_BASE_URL`` environment variable
(default ``http://127.0.0.1:8000``). Long-running endpoints (/compare,
/query) use a 300s timeout because the local 1B model is slow.
"""

import os
from typing import Any

import httpx
import streamlit as st

API_BASE_URL = os.environ.get("API_BASE_URL", "http://127.0.0.1:8000")

DEFAULT_TIMEOUT = 30.0
SLOW_TIMEOUT = 300.0  # /compare and /query drive a local 1B model
CONNECT_TIMEOUT = 5.0

START_HINT = "Backend API is not running — start it with: uvicorn app.api.main:app"


class APIError(RuntimeError):
    """Base class for every error surfaced by this client."""


class APIConnectionError(APIError):
    """The backend could not be reached at all."""


class APIStatusError(APIError):
    """The backend answered with an HTTP error status."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def show_error(exc: Exception) -> None:
    """Render an API failure as a friendly Streamlit error box."""
    if isinstance(exc, APIConnectionError):
        st.error(START_HINT)
    elif isinstance(exc, APIStatusError):
        st.error(f"API error (HTTP {exc.status_code}): {exc.message}")
    else:  # pragma: no cover - defensive
        st.error(f"Unexpected error: {exc}")


def _error_message(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text[:500] or f"HTTP {response.status_code}"
    if isinstance(body, dict):
        if isinstance(body.get("message"), str):
            return body["message"]
        detail = body.get("detail")
        if isinstance(detail, str):
            return detail
        if detail is not None:
            return str(detail)[:500]
    return str(body)[:500]


def _request(
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    files: dict[str, Any] | None = None,
    form_data: dict[str, Any] | None = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> Any:
    try:
        with httpx.Client(
            base_url=API_BASE_URL,
            timeout=httpx.Timeout(timeout, connect=CONNECT_TIMEOUT),
        ) as client:
            response = client.request(
                method, path, params=params, json=json_body, files=files, data=form_data
            )
    except httpx.TimeoutException as exc:
        raise APIConnectionError(
            f"The API did not respond within {timeout:.0f}s — is it overloaded?"
        ) from exc
    except httpx.TransportError as exc:
        raise APIConnectionError(START_HINT) from exc
    if response.status_code >= 400:
        raise APIStatusError(response.status_code, _error_message(response))
    if response.status_code == 204 or not response.content:
        return None
    return response.json()


def _clean(params: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in params.items() if value is not None}


# --------------------------------------------------------------------------- health


def health(timeout: float = 2.0) -> dict[str, Any]:
    return _request("GET", "/health", timeout=timeout)


def ready() -> dict[str, Any]:
    return _request("GET", "/ready", timeout=15.0)


def is_online() -> bool:
    try:
        return health().get("status") == "ok"
    except APIError:
        return False


# ----------------------------------------------------------------------- documents


def upload_document(
    filename: str,
    data: bytes,
    *,
    document_type: str | None = None,
    case_id: str | None = None,
) -> dict[str, Any]:
    return _request(
        "POST",
        "/documents",
        files={"file": (filename, data)},
        form_data=_clean({"document_type": document_type, "case_id": case_id}),
        timeout=120.0,
    )


def list_documents(
    *,
    document_type: str | None = None,
    case_id: str | None = None,
    status: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[dict[str, Any]]:
    return _request(
        "GET",
        "/documents",
        params=_clean(
            {
                "document_type": document_type,
                "case_id": case_id,
                "status": status,
                "limit": limit,
                "offset": offset,
            }
        ),
    )


def get_document(document_id: str) -> dict[str, Any]:
    return _request("GET", f"/documents/{document_id}")


def get_document_chunks(document_id: str) -> list[dict[str, Any]]:
    return _request("GET", f"/documents/{document_id}/chunks")


def delete_document(document_id: str) -> None:
    _request("DELETE", f"/documents/{document_id}")


def index_document(document_id: str) -> dict[str, Any]:
    return _request("POST", f"/documents/{document_id}/index", timeout=SLOW_TIMEOUT)


def distinct_case_ids() -> list[str]:
    """Distinct, sorted case ids across the (first 200) stored documents."""
    documents = list_documents(limit=200)
    return sorted({d["case_id"] for d in documents if d.get("case_id")})


# ------------------------------------------------------------------ search & query


def _filters(case_id: str | None, document_type: str | None) -> dict[str, Any] | None:
    filters = _clean({"case_id": case_id, "document_type": document_type})
    return filters or None


def search(
    query_text: str,
    *,
    mode: str = "bm25",
    top_k: int = 10,
    case_id: str | None = None,
    document_type: str | None = None,
) -> dict[str, Any]:
    return _request(
        "POST",
        "/search",
        json_body=_clean(
            {
                "query": query_text,
                "mode": mode,
                "top_k": top_k,
                "filters": _filters(case_id, document_type),
            }
        ),
        timeout=SLOW_TIMEOUT,
    )


def query(
    question: str,
    *,
    mode: str | None = None,
    top_k: int | None = None,
    case_id: str | None = None,
    document_type: str | None = None,
) -> dict[str, Any]:
    return _request(
        "POST",
        "/query",
        json_body=_clean(
            {
                "question": question,
                "mode": mode,
                "top_k": top_k,
                "filters": _filters(case_id, document_type),
            }
        ),
        timeout=SLOW_TIMEOUT,
    )


# -------------------------------------------------------------------------- compare


def compare(
    *,
    case_id: str | None = None,
    document_ids: list[str] | None = None,
) -> dict[str, Any]:
    return _request(
        "POST",
        "/compare",
        json_body=_clean({"case_id": case_id, "document_ids": document_ids}),
        timeout=SLOW_TIMEOUT,
    )


def get_workflow(workflow_id: str) -> dict[str, Any]:
    return _request("GET", f"/workflows/{workflow_id}")


# -------------------------------------------------------------------------- reviews


def list_reviews(
    *,
    status: str | None = None,
    case_id: str | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    payload = _request(
        "GET",
        "/reviews",
        params=_clean({"status": status, "case_id": case_id, "limit": limit}),
    )
    return payload.get("reviews", [])


def approve_review(review_id: str, *, reviewer: str, note: str | None = None) -> dict[str, Any]:
    return _request(
        "POST",
        f"/reviews/{review_id}/approve",
        json_body={"reviewer": reviewer, "note": note},
    )


def reject_review(review_id: str, *, reviewer: str, note: str | None = None) -> dict[str, Any]:
    return _request(
        "POST",
        f"/reviews/{review_id}/reject",
        json_body={"reviewer": reviewer, "note": note},
    )


def resolve_review(review_id: str) -> dict[str, Any]:
    return _request("POST", f"/reviews/{review_id}/resolve")
