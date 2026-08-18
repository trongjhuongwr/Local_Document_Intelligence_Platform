"""Case-first grounded question answering with progressive technical disclosure."""

import re

import streamlit as st

from ui import api_client
from ui.theme import escape, evidence_card, inject_css, muted, neutral_chip
from ui.utils import suggested_questions

inject_css()
st.title("Ask Documents")
st.caption("Ask a business question and inspect the exact document evidence behind the answer.")

try:
    cases = api_client.list_cases()
except api_client.APIError as exc:
    api_client.show_error(exc)
    st.stop()

if not cases:
    st.markdown(
        '<div class="empty-state"><strong>No cases available</strong><br>'
        '<span class="muted">Create a case and upload documents before asking '
        "questions.</span></div>",
        unsafe_allow_html=True,
    )
    st.stop()

case_ids = [case["case_id"] for case in cases]
active = st.session_state.get("active_case_id")
default_index = case_ids.index(active) if active in case_ids else 0
selected_case_id = st.selectbox(
    "Case",
    case_ids,
    index=default_index,
    format_func=lambda value: next(case["name"] for case in cases if case["case_id"] == value),
)

with st.expander("Advanced settings"):
    all_cases = st.checkbox("Search across all cases", value=False)
    mode = st.selectbox(
        "Retrieval mode",
        ["bm25", "hybrid", "dense"],
        help="BM25 is the measured default. Hybrid and dense require the embedding model.",
    )

scope = None if all_cases else selected_case_id
scope_key = (scope, mode)
if st.session_state.get("ask_scope_key") != scope_key:
    st.session_state["ask_scope_key"] = scope_key
    st.session_state.pop("ask_result", None)
    st.session_state.pop("ask_result_question", None)

document_types = set(
    next(case.get("document_types", []) for case in cases if case["case_id"] == selected_case_id)
)
st.markdown("**Suggested questions**")
for index, suggestion in enumerate(suggested_questions(document_types)):
    if st.button(suggestion, key=f"suggestion_{index}"):
        st.session_state["ask_question"] = suggestion
        st.session_state.pop("ask_result", None)
        st.rerun()

question = st.text_area(
    "Question",
    key="ask_question",
    placeholder="e.g. Do the invoice payment terms match the contract?",
    height=100,
)
if st.session_state.get("ask_result_question") != question:
    st.session_state.pop("ask_result", None)

if st.button("Ask documents", type="primary", width="stretch"):
    if not question.strip():
        st.warning("Type or choose a question first.")
    else:
        try:
            with st.spinner("Finding evidence and preparing a grounded answer..."):
                st.session_state["ask_result"] = api_client.query(
                    question.strip(), mode=mode, case_id=scope
                )
                st.session_state["ask_result_question"] = question
        except api_client.APIError as exc:
            st.session_state.pop("ask_result", None)
            api_client.show_error(exc)

result = st.session_state.get("ask_result")
if not result:
    st.info("Your answer will appear here with citation checks and source evidence.")
    st.stop()

st.subheader("Answer")
st.markdown(
    evidence_card(escape(result.get("answer", "")).replace("\n", "<br>")),
    unsafe_allow_html=True,
)

verification = result.get("verification") or {}
valid = verification.get("valid")
if valid is True:
    st.success("Citation check passed — every cited source was found in the retrieved evidence.")
elif valid is False:
    st.warning(
        "Some citations could not be verified. Review the evidence before relying on this answer."
    )
else:
    st.info("No citation verification status was returned.")

citations = result.get("citations") or {}
st.subheader("Evidence")
if not citations:
    st.warning("No evidence citations were returned for this answer.")
else:

    def marker_order(marker: str) -> int:
        match = re.search(r"\d+", marker)
        return int(match.group()) if match else 0

    for marker in sorted(citations, key=marker_order):
        citation = citations[marker] or {}
        filename = citation.get("filename") or "unknown file"
        location = filename
        if citation.get("page_number") is not None:
            location += f" · page {citation['page_number']}"
        if citation.get("section"):
            location += f" · {citation['section']}"
        with st.expander(f"{marker} · {location}"):
            st.write(citation.get("evidence") or "No excerpt available.")

with st.expander("Technical details"):
    chips = [
        neutral_chip(f"retrieval: {result.get('retrieval_mode', 'unknown')}"),
        neutral_chip(f"route: {result.get('route', 'unknown')}"),
        neutral_chip(f"router: {result.get('routing_method', 'unknown')}"),
    ]
    st.markdown(" ".join(chips), unsafe_allow_html=True)
    st.markdown(
        muted(
            f"{result.get('retrieved_count', 0)} chunks · "
            f"{result.get('context_chars', 0):,} context characters · "
            f"{result.get('latency_ms', 0):.0f} ms"
        ),
        unsafe_allow_html=True,
    )
