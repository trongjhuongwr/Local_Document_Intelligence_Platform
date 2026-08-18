"""Case list and focused workspace for document upload, analysis, and reporting."""

import time
from typing import Any

import pandas as pd
import streamlit as st

from ui import api_client
from ui.theme import escape, inject_css, muted, neutral_chip, severity_badge
from ui.utils import infer_document_type

inject_css()
DOCUMENT_TYPES = ["contract", "invoice", "purchase_order", "policy", "other"]
DOCUMENT_LABELS = {
    "contract": "Contract",
    "invoice": "Invoice",
    "purchase_order": "Purchase Order",
    "policy": "Payment Policy",
}


def _load_cases() -> list[dict[str, Any]]:
    try:
        return api_client.list_cases()
    except api_client.APIError as exc:
        api_client.show_error(exc)
        return []


active_case_id = st.session_state.get("active_case_id")
if not active_case_id:
    st.title("Cases")
    st.caption("Each case keeps its document pack, analysis history, and human decisions together.")
    with st.expander("Create a new case", expanded=st.session_state.pop("show_create_case", False)):
        with st.form("create_case_form", clear_on_submit=True):
            case_name = st.text_input(
                "Case name", placeholder="e.g. Acme March 2026 invoice review"
            )
            create_clicked = st.form_submit_button("Create case", type="primary")
        if create_clicked:
            if not case_name.strip():
                st.warning("Enter a case name.")
            else:
                try:
                    case = api_client.create_case(case_name.strip())
                except api_client.APIError as exc:
                    api_client.show_error(exc)
                else:
                    st.session_state["active_case_id"] = case["case_id"]
                    st.rerun()

    cases = _load_cases()
    if not cases:
        st.markdown(
            '<div class="empty-state"><strong>Your workspace is empty</strong><br>'
            '<span class="muted">Create a case above, or use Try a sample case on '
            "Home.</span></div>",
            unsafe_allow_html=True,
        )
        st.stop()
    for case in cases:
        with st.container(border=True):
            name_col, status_col, action_col = st.columns([4, 3, 1], vertical_alignment="center")
            name_col.markdown(f"#### {escape(case['name'])}")
            name_col.caption(
                f"{case['document_count']} documents · updated {case['updated_at'][:10]}"
            )
            status_col.markdown(
                f"{neutral_chip(case['readiness'])} &nbsp; "
                f"{case['open_review_count']} open finding(s)",
                unsafe_allow_html=True,
            )
            if action_col.button("Open", key=f"open_{case['case_id']}", type="primary"):
                st.session_state["active_case_id"] = case["case_id"]
                st.rerun()
    st.stop()

try:
    case = api_client.get_case(active_case_id)
except api_client.APIError as exc:
    st.session_state.pop("active_case_id", None)
    api_client.show_error(exc)
    st.stop()

back_col, title_col = st.columns([1, 8], vertical_alignment="center")
if back_col.button("← Cases"):
    st.session_state.pop("active_case_id", None)
    st.session_state.pop("active_workflow_id", None)
    st.rerun()
title_col.title(case["name"])
title_col.caption(f"Case ID: {case['case_id']}")

types_present = set(case.get("document_types", []))
check_columns = st.columns(4)
for column, document_type in zip(check_columns, DOCUMENT_LABELS, strict=True):
    complete = document_type in types_present
    css = "check-done" if complete else "check-missing"
    mark = "✓" if complete else "○"
    column.markdown(
        f'<div class="workspace-card {css}">{mark} {DOCUMENT_LABELS[document_type]}</div>',
        unsafe_allow_html=True,
    )

readiness = case["readiness"]
if readiness == "blocked":
    st.warning("Add both a Contract and an Invoice before analysis can start.")
elif readiness == "limited":
    missing = ", ".join(DOCUMENT_LABELS[item] for item in case["missing_document_types"])
    st.warning(f"Limited analysis: {missing} is missing, so related checks will be skipped.")
else:
    st.success("Document pack is complete and ready for analysis.")

st.subheader("1. Add document pack")
uploads = st.file_uploader(
    "Choose one or more documents",
    type=["pdf", "docx", "txt", "md", "csv"],
    accept_multiple_files=True,
)
if uploads:
    preview = pd.DataFrame(
        [
            {
                "File": uploaded.name,
                "Document type": infer_document_type(uploaded.name) or "",
            }
            for uploaded in uploads
        ]
    )
    edited = st.data_editor(
        preview,
        hide_index=True,
        disabled=["File"],
        column_config={
            "Document type": st.column_config.SelectboxColumn(
                "Document type", options=DOCUMENT_TYPES, required=True
            )
        },
        width="stretch",
        key=f"upload_preview_{case['case_id']}",
    )
    selected_types = [str(value) if value else "" for value in edited["Document type"]]
    valid_types = all(value in DOCUMENT_TYPES for value in selected_types)
    if st.button("Upload document pack", type="primary", disabled=not valid_types, width="stretch"):
        try:
            with st.spinner("Parsing documents and preparing them for search..."):
                outcome = api_client.upload_case_documents(
                    case["case_id"],
                    [(uploaded.name, uploaded.getvalue()) for uploaded in uploads],
                    selected_types,
                )
        except api_client.APIError as exc:
            api_client.show_error(exc)
        else:
            st.session_state["upload_results"] = outcome["results"]
            st.rerun()

upload_results = st.session_state.pop("upload_results", None)
if upload_results:
    for result in upload_results:
        if result["success"]:
            suffix = " (already present)" if result.get("duplicate") else ""
            st.success(f"{result['filename']}: ready{suffix}")
        else:
            st.error(f"{result['filename']}: {result.get('message', 'Upload failed')}")

if case.get("documents"):
    with st.expander(f"Documents in this case ({len(case['documents'])})"):
        for document in case["documents"]:
            st.markdown(
                f"**{escape(document['filename'])}** · "
                f"{escape(DOCUMENT_LABELS.get(document.get('document_type'), 'Other'))} · "
                f"{escape(document['status'])}"
            )
            with st.expander(f"Technical details · {document['filename']}"):
                st.caption(
                    f"Parser {document['parser_version']} · SHA-256 {document['sha256']} · "
                    f"{document['size_bytes']:,} bytes"
                )

st.subheader("2. Analyze case")
latest = case.get("latest_workflow") or {}
workflow_id = st.session_state.get("active_workflow_id")
if not workflow_id and latest.get("status") in {"queued", "running"}:
    workflow_id = latest["workflow_id"]
    st.session_state["active_workflow_id"] = workflow_id

workflow = None
if workflow_id:
    try:
        workflow = api_client.get_workflow(workflow_id)
    except api_client.APIError as exc:
        api_client.show_error(exc)

analysis_running = bool(workflow and workflow.get("status") in {"queued", "running"})
if st.button(
    "Analyze case",
    type="primary",
    disabled=readiness == "blocked" or analysis_running,
    width="stretch",
):
    try:
        response = api_client.analyze_case(case["case_id"])
    except api_client.APIError as exc:
        api_client.show_error(exc)
    else:
        st.session_state["active_workflow_id"] = response["workflow_id"]
        st.rerun()
st.caption("Typical runtime: 1-3 minutes with the local model. You can safely reload this page.")

if workflow:
    if workflow["status"] in {"queued", "running"}:
        st.progress(
            workflow.get("progress_percent", 0), text=workflow.get("current_step") or "Queued"
        )
        for step in workflow.get("steps", []):
            icon = {"completed": "✓", "running": "●", "pending": "○"}.get(step["status"], "○")
            st.markdown(f"{icon} {step.get('label', step['step'])}")
        time.sleep(1)
        st.rerun()
    elif workflow["status"] == "failed":
        st.error(
            "Analysis did not complete. Review the error below, then select Analyze case to retry."
        )
        with st.expander("Error details"):
            st.write(workflow.get("errors") or ["Unknown workflow error"])
        st.session_state.pop("active_workflow_id", None)
    elif workflow["status"] == "completed":
        report = workflow.get("result") or {}
        issues = report.get("issues", [])
        severity_counts = {
            severity: sum(item.get("severity") == severity for item in issues)
            for severity in ("high", "medium", "low")
        }
        metrics = st.columns(4)
        metrics[0].metric("Documents analyzed", len(report.get("documents_analyzed", [])))
        metrics[1].metric("High severity", severity_counts["high"])
        metrics[2].metric("Extraction failures", len(report.get("extraction_failures", [])))
        metrics[3].metric(
            "Human review", "Required" if workflow.get("requires_review") else "Not required"
        )
        st.write(report.get("summary", "Analysis completed."))
        for severity in ("high", "medium", "low"):
            group = [issue for issue in issues if issue.get("severity") == severity]
            if not group:
                continue
            st.markdown(
                f"#### {severity_badge(severity)} {severity.title()} severity",
                unsafe_allow_html=True,
            )
            for issue in group:
                title = str(issue.get("type", "finding")).replace("_", " ").title()
                with st.expander(title, expanded=False):
                    st.write(issue.get("description"))
                    if issue.get("evidence"):
                        st.markdown("**Evidence**")
                        for evidence in issue["evidence"]:
                            st.caption(
                                f"{evidence.get('filename', 'document')} · "
                                f"page {evidence.get('page_number', '—')}"
                            )
                    if issue.get("calculation"):
                        st.code(str(issue["calculation"]), language=None)
        action_left, action_right = st.columns(2)
        if action_left.button("Review findings", type="primary", width="stretch"):
            st.switch_page("pages/reviews.py")
        markdown = workflow.get("report_markdown") or report.get("report_markdown", "")
        action_right.download_button(
            "Download Markdown report",
            data=markdown,
            file_name=f"{case['case_id']}-exception-report.md",
            mime="text/markdown",
            width="stretch",
        )
        st.markdown(
            muted(
                f"Case {case['name']} · completed {workflow.get('completed_at', '')[:19]} · "
                f"model {report.get('model_version', 'unknown')} · "
                f"workflow {workflow['workflow_id']}"
            ),
            unsafe_allow_html=True,
        )

with st.expander("Case settings"):
    confirm = st.checkbox("I understand this permanently deletes the case and its audit data.")
    if st.button("Delete case", disabled=not confirm):
        try:
            api_client.delete_case(case["case_id"])
        except api_client.APIError as exc:
            api_client.show_error(exc)
        else:
            st.session_state.pop("active_case_id", None)
            st.session_state.pop("active_workflow_id", None)
            st.rerun()
