"""Ask page: grounded question answering with citations over the corpus."""

import re

import streamlit as st

from ui import api_client
from ui.theme import escape, evidence_card, inject_css, muted, neutral_chip

inject_css()
st.title("Ask")
st.caption("Ask a question over your documents — answers cite their evidence.")

try:
    case_ids = api_client.distinct_case_ids()
except api_client.APIError as exc:
    api_client.show_error(exc)
    st.stop()

question = st.text_area(
    "Question",
    placeholder="e.g. What is the total amount of invoice INV-2024-001?",
    height=90,
)
mode_col, case_col, button_col = st.columns([1, 1, 1], vertical_alignment="bottom")
with mode_col:
    mode = st.selectbox("Retrieval mode", ["hybrid", "bm25", "dense"])
with case_col:
    case_choice = st.selectbox("Case", ["All cases", *case_ids])
with button_col:
    ask_clicked = st.button("Ask", type="primary", use_container_width=True)

if ask_clicked:
    if not question.strip():
        st.warning("Type a question first.")
    else:
        try:
            with st.spinner(
                "Retrieving evidence and generating a grounded answer — "
                "the local 1B model may take a minute..."
            ):
                st.session_state["ask_result"] = api_client.query(
                    question.strip(),
                    mode=mode,
                    case_id=None if case_choice == "All cases" else case_choice,
                )
        except api_client.APIStatusError as exc:
            st.session_state.pop("ask_result", None)
            if exc.status_code == 404:
                st.info("Query endpoint not available yet.")
            else:
                api_client.show_error(exc)
        except api_client.APIError as exc:
            st.session_state.pop("ask_result", None)
            api_client.show_error(exc)

result = st.session_state.get("ask_result")
if result:
    st.divider()
    st.markdown(
        evidence_card(escape(result.get("answer", "")).replace("\n", "<br>")),
        unsafe_allow_html=True,
    )

    verification = result.get("verification") or {}
    valid = verification.get("valid")
    chips = []
    if result.get("route"):
        chips.append(neutral_chip(f"route: {result['route']}"))
    if result.get("routing_method"):
        chips.append(neutral_chip(f"router: {result['routing_method']}"))
    if result.get("retrieval_mode"):
        chips.append(neutral_chip(f"retrieval: {result['retrieval_mode']}"))
    if result.get("latency_ms") is not None:
        chips.append(neutral_chip(f"{result['latency_ms']:.0f} ms"))
    if valid is not None:
        chips.append(neutral_chip("citations valid ✓" if valid else "citations valid ✗"))
    if chips:
        st.markdown(" ".join(chips), unsafe_allow_html=True)
    if result.get("suggested_action"):
        st.markdown(
            muted(f"Suggested action: {result['suggested_action']}"), unsafe_allow_html=True
        )

    citations = result.get("citations") or {}
    if citations:
        st.subheader("Evidence")

        def _marker_order(marker: str) -> int:
            match = re.search(r"\d+", marker)
            return int(match.group()) if match else 0

        for marker in sorted(citations, key=_marker_order):
            citation = citations[marker] or {}
            filename = citation.get("filename") or "unknown file"
            page = citation.get("page_number")
            section = citation.get("section")
            header = f"<strong>{escape(marker)}</strong> · {escape(filename)}"
            if page is not None:
                header += f" · page {escape(page)}"
            if section:
                header += f" · {escape(section)}"
            evidence = citation.get("evidence") or ""
            body = header
            if evidence:
                body += f'<br><span class="muted">{escape(evidence)}</span>'
            st.markdown(evidence_card(body), unsafe_allow_html=True)

    extra = []
    if result.get("retrieved_count") is not None:
        extra.append(f"{result['retrieved_count']} chunks retrieved")
    if result.get("context_chars") is not None:
        extra.append(f"{result['context_chars']:,} context characters")
    if extra:
        st.caption(" · ".join(extra))
