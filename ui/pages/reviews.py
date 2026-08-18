"""Case-filtered, paginated human review workspace."""

from typing import Any

import streamlit as st

from ui import api_client
from ui.theme import escape, inject_css, muted, severity_badge, status_chip

inject_css()
st.title("Review Findings")
st.caption(
    "Validate each finding individually so every decision remains attributable and auditable."
)

try:
    cases = api_client.list_cases()
except api_client.APIError as exc:
    api_client.show_error(exc)
    st.stop()

if not cases:
    st.markdown(
        '<div class="empty-state"><strong>No cases to review</strong><br>'
        '<span class="muted">Analyze a case first to create review findings.</span></div>',
        unsafe_allow_html=True,
    )
    st.stop()

case_ids = [case["case_id"] for case in cases]
active = st.session_state.get("active_case_id")
default_index = case_ids.index(active) if active in case_ids else 0
filter_columns = st.columns(3)
case_id = filter_columns[0].selectbox(
    "Case",
    case_ids,
    index=default_index,
    format_func=lambda value: next(case["name"] for case in cases if case["case_id"] == value),
)
status_filter = filter_columns[1].selectbox(
    "Status",
    [None, "OPEN", "APPROVED", "REJECTED", "RESOLVED"],
    format_func=lambda value: "All statuses" if value is None else value.title(),
)
severity_filter = filter_columns[2].selectbox(
    "Severity",
    [None, "high", "medium", "low"],
    format_func=lambda value: "All severities" if value is None else value.title(),
)

filter_key = (case_id, status_filter, severity_filter)
if st.session_state.get("review_filter_key") != filter_key:
    st.session_state["review_filter_key"] = filter_key
    st.session_state["review_page"] = 0

reviewer = st.text_input(
    "Reviewer name",
    key="reviewer_name",
    placeholder="Recorded with every approve or reject decision",
)
with st.expander("What do these actions mean?"):
    st.markdown(
        "- **Approve:** the finding is valid.\n"
        "- **Reject:** the finding is incorrect or a false positive.\n"
        "- **Resolve:** the follow-up action for an approved or rejected finding is complete."
    )

page_size = 10
page = int(st.session_state.get("review_page", 0))
try:
    payload = api_client.reviews_page(
        case_id=case_id,
        status=status_filter,
        severity=severity_filter,
        limit=page_size,
        offset=page * page_size,
    )
except api_client.APIError as exc:
    api_client.show_error(exc)
    st.stop()

reviews = payload.get("reviews", [])
total = int(payload.get("total", len(reviews)))
if not reviews:
    st.markdown(
        '<div class="empty-state"><strong>No findings match these filters</strong><br>'
        '<span class="muted">Try another status or analyze the selected case.</span></div>',
        unsafe_allow_html=True,
    )


def decide(review_id: str, action: str, note: str) -> None:
    try:
        if action == "approve":
            api_client.approve_review(review_id, reviewer=reviewer.strip(), note=note or None)
        elif action == "reject":
            api_client.reject_review(review_id, reviewer=reviewer.strip(), note=note or None)
        else:
            api_client.resolve_review(review_id)
    except api_client.APIError as exc:
        api_client.show_error(exc)
    else:
        st.toast(f"Finding {action}d")
        st.rerun()


def render_finding(task: dict[str, Any]) -> None:
    discrepancy = task.get("discrepancy") or {}
    review_id = task["review_id"]
    title = str(discrepancy.get("type", "finding")).replace("_", " ").title()
    with st.container(border=True):
        st.markdown(
            f"{severity_badge(task.get('severity'))}&nbsp; {status_chip(task.get('status'))}&nbsp; "
            f"<strong>{escape(title)}</strong>",
            unsafe_allow_html=True,
        )
        st.write(discrepancy.get("description") or "No description available.")
        values = [
            ("Expected", discrepancy.get("expected_value")),
            ("Observed", discrepancy.get("observed_value")),
            ("Difference", discrepancy.get("difference")),
        ]
        visible = [(label, value) for label, value in values if value is not None]
        if visible:
            for column, (label, value) in zip(st.columns(len(visible)), visible, strict=True):
                column.caption(label)
                column.code(str(value), language=None)
        evidence = discrepancy.get("evidence") or []
        if evidence:
            with st.expander(f"Evidence ({len(evidence)})"):
                for reference in evidence:
                    location = reference.get("filename") or "document"
                    if reference.get("page_number") is not None:
                        location += f" · page {reference['page_number']}"
                    st.markdown(f"**{escape(location)}**")
                    if reference.get("snippet"):
                        st.caption(reference["snippet"])
        if discrepancy.get("calculation"):
            with st.expander("Calculation"):
                st.code(str(discrepancy["calculation"]), language=None)
        st.markdown(
            muted(f"Created {str(task.get('created_at', ''))[:19]}"), unsafe_allow_html=True
        )

        if task.get("status") == "OPEN":
            note = st.text_input("Decision note (optional)", key=f"note_{review_id}")
            approve_col, reject_col = st.columns(2)
            if approve_col.button(
                "Approve", key=f"approve_{review_id}", type="primary", width="stretch"
            ):
                if reviewer.strip():
                    decide(review_id, "approve", note)
                else:
                    st.warning("Enter a reviewer name first.")
            if reject_col.button("Reject", key=f"reject_{review_id}", width="stretch"):
                if reviewer.strip():
                    decide(review_id, "reject", note)
                else:
                    st.warning("Enter a reviewer name first.")
        else:
            st.caption(
                f"Decision by {task.get('reviewer') or 'unknown'} · "
                f"{str(task.get('decided_at') or '')[:19]}"
            )
            if task.get("note"):
                st.info(task["note"])
            if task.get("status") in {"APPROVED", "REJECTED"} and st.button(
                "Resolve follow-up", key=f"resolve_{review_id}"
            ):
                decide(review_id, "resolve", "")


for severity in ("high", "medium", "low"):
    group = [review for review in reviews if review.get("severity") == severity]
    if group:
        st.markdown(f"### {severity.title()} severity")
        for review in group:
            render_finding(review)

page_count = max(1, (total + page_size - 1) // page_size)
previous_col, info_col, next_col = st.columns([1, 2, 1], vertical_alignment="center")
if previous_col.button("Previous", disabled=page == 0, width="stretch"):
    st.session_state["review_page"] = page - 1
    st.rerun()
info_col.markdown(
    f"<div style='text-align:center'>Page {page + 1} of {page_count} · {total} findings</div>",
    unsafe_allow_html=True,
)
if next_col.button("Next", disabled=page + 1 >= page_count, width="stretch"):
    st.session_state["review_page"] = page + 1
    st.rerun()
