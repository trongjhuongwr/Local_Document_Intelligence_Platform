"""Evaluation page: renders evals/reports/*_latest.json produced by the eval suite."""

import json
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

from ui.theme import inject_css

inject_css()
st.title("Evaluation")
st.caption("Measured quality of every component, straight from the evaluation reports on disk.")

REPORTS_DIR = Path(__file__).resolve().parents[2] / "evals" / "reports"


def _load(name: str) -> dict[str, Any] | None:
    path = REPORTS_DIR / name
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _pct(value: Any) -> str:
    return f"{value:.1%}" if isinstance(value, int | float) else "—"


def _num(value: Any, suffix: str = "") -> str:
    return f"{value:,.1f}{suffix}" if isinstance(value, int | float) else "—"


combined = _load("latest.json")
extraction = _load("extraction_latest.json") or (combined or {}).get("results", {}).get(
    "extraction"
)
retrieval = _load("retrieval_latest.json")
routing = _load("routing_latest.json")
rules = _load("discrepancy_rules_latest.json")
end_to_end = _load("discrepancy_end_to_end_latest.json")

if not any([combined, extraction, retrieval, routing, rules, end_to_end]):
    st.info(
        "No evaluation reports found yet — run `python -m evals.run_all` "
        "to generate them, then reload this page."
    )
    st.stop()

# ----------------------------------------------------------------------- extraction
st.subheader("Extraction")
if extraction:
    tile_1, tile_2, tile_3, tile_4 = st.columns(4)
    tile_1.metric("Field accuracy", _pct(extraction.get("overall_field_accuracy")))
    tile_2.metric("Schema validity", _pct(extraction.get("overall_schema_valid_rate")))
    tile_3.metric("Median LLM latency", _num(extraction.get("median_llm_latency_ms"), " ms"))
    tile_4.metric("p95 LLM latency", _num(extraction.get("p95_llm_latency_ms"), " ms"))

    by_type = extraction.get("by_document_type") or {}
    if by_type:
        rows = [
            {
                "Document type": document_type.replace("_", " "),
                "Documents": stats.get("documents"),
                "Schema validity": _pct(stats.get("schema_valid_rate")),
                "Field accuracy": _pct(stats.get("overall_field_accuracy")),
                "Numeric accuracy": _pct(stats.get("numeric_accuracy")),
                "Date accuracy": _pct(stats.get("date_accuracy")),
            }
            for document_type, stats in by_type.items()
        ]
        st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)
else:
    st.info("Extraction evaluation has not been run yet (requires a live Ollama).")

# ------------------------------------------------------------------------ retrieval
st.subheader("Retrieval")
if retrieval and retrieval.get("modes"):
    rows = [
        {
            "Mode": mode,
            "Recall@1": _pct(stats.get("recall_at_1")),
            "Recall@3": _pct(stats.get("recall_at_3")),
            "Recall@5": _pct(stats.get("recall_at_5")),
            "MRR": f"{stats['mrr']:.3f}" if isinstance(stats.get("mrr"), int | float) else "—",
            "Mean latency": _num(stats.get("mean_latency_ms"), " ms"),
        }
        for mode, stats in retrieval["modes"].items()
    ]
    st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)
    if retrieval.get("headline"):
        st.caption(retrieval["headline"])
else:
    st.info("Retrieval evaluation has not been run yet — no report on disk.")

# -------------------------------------------------------------------------- routing
st.subheader("Routing")
if routing:
    llm_router = routing.get("llm_router") or {}
    fallback = routing.get("keyword_fallback") or {}
    tile_1, tile_2, tile_3 = st.columns(3)
    tile_1.metric("LLM router accuracy", _pct(llm_router.get("accuracy")))
    tile_2.metric("LLM router macro F1", _pct(llm_router.get("macro_f1")))
    tile_3.metric("Keyword fallback accuracy", _pct(fallback.get("accuracy")))
    if routing.get("headline"):
        st.caption(routing["headline"])
else:
    st.info("Routing evaluation has not been run yet — no report on disk.")

# ---------------------------------------------------------------------- discrepancy
st.subheader("Discrepancy detection")
if rules or end_to_end:
    tiles = st.columns(4)
    if rules:
        overall = rules.get("overall") or {}
        tiles[0].metric("Rules F1 (perfect extraction)", _pct(overall.get("f1")))
    if end_to_end:
        overall = end_to_end.get("overall") or {}
        tiles[1].metric("End-to-end precision", _pct(overall.get("precision")))
        tiles[2].metric("End-to-end recall", _pct(overall.get("recall")))
        tiles[3].metric("End-to-end F1", _pct(overall.get("f1")))
    else:
        st.caption("End-to-end discrepancy evaluation (LLM extraction) has not been run yet.")
else:
    st.info("Discrepancy evaluation has not been run yet — no report on disk.")

if combined and combined.get("skipped"):
    with st.expander("Skipped in the last run"):
        for item in combined["skipped"]:
            st.markdown(f"- {item}")

st.divider()
st.caption(
    "Generated by `python -m evals.run_all` — no metrics are shown that were not "
    "produced by the evaluation suite."
)
