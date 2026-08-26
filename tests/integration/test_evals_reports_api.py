"""`GET /api/evals` must serve the reports that really exist in evals/reports."""

import json
from pathlib import Path

import pytest

from app.services.evals_runner import REPORT_SECTIONS, default_reports_dir

pytestmark = pytest.mark.integration


async def test_evals_endpoint_mirrors_the_real_reports_directory(client) -> None:
    reports_dir: Path = default_reports_dir()
    on_disk = {
        section for section in REPORT_SECTIONS if (reports_dir / f"{section}_latest.json").is_file()
    }

    response = await client.get("/api/evals")
    assert response.status_code == 200
    body = response.json()

    assert Path(body["reports_dir"]) == reports_dir
    assert set(body["results"]) == on_disk
    assert set(body["missing"]) == set(REPORT_SECTIONS) - on_disk

    for section in on_disk:
        expected = json.loads((reports_dir / f"{section}_latest.json").read_text(encoding="utf-8"))
        assert body["results"][section] == expected
        assert body["source_generated_at"][section] == expected.get("generated_at")


@pytest.mark.skipif(
    not (default_reports_dir() / "retrieval_latest.json").is_file(),
    reason="retrieval report has not been generated in this checkout",
)
async def test_retrieval_report_carries_the_fields_the_spa_renders(client) -> None:
    retrieval = (await client.get("/api/evals")).json()["results"]["retrieval"]
    assert retrieval["generated_at"]
    for mode in ("bm25", "dense", "hybrid"):
        metrics = retrieval["modes"][mode]
        assert {"recall_at_1", "recall_at_3", "recall_at_5", "mrr", "mean_latency_ms"} <= set(
            metrics
        )
