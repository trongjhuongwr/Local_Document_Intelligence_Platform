"""Compare page: cross-document discrepancy analysis with a deterministic audit trail."""

import streamlit as st

from ui import api_client
from ui.theme import escape, inject_css, muted, neutral_chip, severity_badge

inject_css()
st.title("Compare")
st.caption(
    "Extract structured fields from a document pack and run deterministic cross-checks "
    "(totals, tax, PO amounts, dates, vendors)."
)

try:
    documents = api_client.list_documents(limit=200)
except api_client.APIError as exc:
    api_client.show_error(exc)
    st.stop()

if not documents:
    st.info("No documents yet — upload a document pack on the Documents page first.")
    st.stop()

case_ids = sorted({d["case_id"] for d in documents if d.get("case_id")})

scope = st.radio("Scope", ["By case", "By documents"], horizontal=True)
selected_case: str | None = None
selected_ids: list[str] = []

if scope == "By case":
    if case_ids:
        selected_case = st.selectbox("Case", case_ids)
    else:
        st.info("No documents carry a case ID yet — select individual documents instead.")
else:
    labels = {
        str(d["document_id"]): (
            f"{d['filename']} · {(d.get('document_type') or 'untyped').replace('_', ' ')}"
            + (f" · {d['case_id']}" if d.get("case_id") else "")
        )
        for d in documents
    }
    selected_ids = st.multiselect(
        "Documents",
        options=list(labels),
        format_func=lambda doc_id: labels[doc_id],
    )

run_disabled = (scope == "By case" and selected_case is None) or (
    scope == "By documents" and not selected_ids
)
if st.button("Run comparison", type="primary", disabled=run_disabled):
    try:
        with st.spinner(
            "Extracting fields and running deterministic checks — the local model takes a minute..."
        ):
            st.session_state["compare_result"] = api_client.compare(
                case_id=selected_case if scope == "By case" else None,
                document_ids=selected_ids if scope == "By documents" else None,
            )
    except api_client.APIError as exc:
        st.session_state.pop("compare_result", None)
        api_client.show_error(exc)

result = st.session_state.get("compare_result")
if result:
    report = result.get("report") or {}
    st.divider()
    if report.get("summary"):
        st.markdown(f"**{report['summary']}**")
    if result.get("requires_human_review"):
        st.warning("This report requires human review before any action is taken.")

    issues = report.get("issues") or []
    if not issues:
        st.success("No discrepancies detected.")
    for row_start in range(0, len(issues), 2):
        columns = st.columns(2, gap="medium")
        for column, issue in zip(columns, issues[row_start : row_start + 2], strict=False):
            with column, st.container(border=True):
                title = (issue.get("type") or "issue").replace("_", " ").title()
                st.markdown(
                    f"{severity_badge(issue.get('severity'))}&nbsp; **{escape(title)}**",
                    unsafe_allow_html=True,
                )
                st.write(issue.get("description", ""))
                if "expected_value" in issue or "observed_value" in issue:
                    expected_col, observed_col = st.columns(2)
                    expected_col.caption("Expected")
                    expected_col.markdown(f"`{issue.get('expected_value', '—')}`")
                    observed_col.caption("Observed")
                    observed_col.markdown(f"`{issue.get('observed_value', '—')}`")
                if issue.get("difference") is not None:
                    st.markdown(
                        f"Difference: <strong style='color:#B91C1C;'>"
                        f"{escape(issue['difference'])}</strong>",
                        unsafe_allow_html=True,
                    )
                calculation = issue.get("calculation")
                if calculation:
                    operands = ", ".join(
                        f"{name}={value}" for name, value in calculation.get("operands", {}).items()
                    )
                    st.code(f"{calculation.get('formula', '')}  [{operands}]", language=None)
                footer = [neutral_chip(issue.get("source", ""))]
                if issue.get("invoice_number"):
                    footer.append(neutral_chip(f"invoice {issue['invoice_number']}"))
                st.markdown(" ".join(footer), unsafe_allow_html=True)

    failures = report.get("extraction_failures") or []
    if failures:
        st.subheader("Extraction failures")
        for failure in failures:
            if isinstance(failure, dict):
                label = failure.get("filename") or failure.get("document_id") or "document"
                reason = failure.get("error") or failure.get("reason") or "extraction failed"
                st.markdown(f"- **{escape(label)}** — {escape(reason)}", unsafe_allow_html=True)
            else:
                st.markdown(f"- {escape(failure)}", unsafe_allow_html=True)

    limitations = report.get("limitations") or []
    if limitations:
        with st.expander("Limitations"):
            for limitation in limitations:
                st.markdown(f"- {limitation}")

    if result.get("report_markdown"):
        st.download_button(
            "Download report (Markdown)",
            data=result["report_markdown"],
            file_name="exception_report.md",
            mime="text/markdown",
        )

    task_ids = result.get("review_task_ids") or []
    if task_ids:
        st.caption(f"Findings were queued for human review ({len(task_ids)} tasks).")
    if result.get("duration_ms") is not None:
        st.markdown(
            muted(f"Workflow {result.get('workflow_id', '')} · {result['duration_ms']:.0f} ms"),
            unsafe_allow_html=True,
        )
