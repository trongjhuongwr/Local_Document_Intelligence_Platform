"""Review Queue page: human decisions over discrepancy findings."""

from typing import Any

import streamlit as st

from ui import api_client
from ui.theme import escape, inject_css, muted, neutral_chip, severity_badge, status_chip

inject_css()
st.title("Review Queue")
st.caption("Every discrepancy finding becomes a task here — approve, reject, then resolve.")

flash = st.session_state.pop("reviews_flash", None)
if flash:
    st.toast(flash)

try:
    reviews = api_client.list_reviews(limit=500)
except api_client.APIError as exc:
    api_client.show_error(exc)
    st.stop()

reviewer = st.text_input(
    "Reviewer name",
    key="reviewer_name",
    placeholder="Your name — recorded with every decision",
)


def _decide(review_id: str, action: str, note: str) -> None:
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
        st.session_state["reviews_flash"] = f"Review {action}d"
        st.rerun()


def _render_card(task: dict[str, Any], key_prefix: str) -> None:
    discrepancy = task.get("discrepancy") or {}
    review_id = task["review_id"]
    widget_key = f"{key_prefix}_{review_id}"
    with st.container(border=True):
        title = (discrepancy.get("type") or "finding").replace("_", " ").title()
        header = (
            f"{severity_badge(task.get('severity'))}&nbsp; "
            f"{status_chip(task.get('status'))}&nbsp; <strong>{escape(title)}</strong>"
        )
        st.markdown(header, unsafe_allow_html=True)
        if discrepancy.get("description"):
            st.write(discrepancy["description"])

        if any(
            discrepancy.get(key) is not None
            for key in ("expected_value", "observed_value", "difference")
        ):
            expected_col, observed_col, diff_col = st.columns(3)
            expected_col.caption("Expected")
            expected_col.markdown(f"`{discrepancy.get('expected_value', '—')}`")
            observed_col.caption("Observed")
            observed_col.markdown(f"`{discrepancy.get('observed_value', '—')}`")
            diff_col.caption("Difference")
            diff_col.markdown(f"`{discrepancy.get('difference', '—')}`")

        chips = []
        if task.get("case_id"):
            chips.append(neutral_chip(f"case {task['case_id']}"))
        if discrepancy.get("source"):
            chips.append(neutral_chip(discrepancy["source"]))
        created = str(task.get("created_at") or "")[:19].replace("T", " ")
        chips.append(muted(f"created {created}"))
        st.markdown(" ".join(chips), unsafe_allow_html=True)

        status = task.get("status")
        if status == "OPEN":
            note = st.text_input("Note (optional)", key=f"note_{widget_key}")
            approve_col, reject_col = st.columns(2)
            if approve_col.button(
                "Approve", key=f"approve_{widget_key}", type="primary", use_container_width=True
            ):
                if reviewer.strip():
                    _decide(review_id, "approve", note)
                else:
                    st.warning("Enter a reviewer name above first.")
            if reject_col.button("Reject", key=f"reject_{widget_key}", use_container_width=True):
                if reviewer.strip():
                    _decide(review_id, "reject", note)
                else:
                    st.warning("Enter a reviewer name above first.")
        else:
            decided = str(task.get("decided_at") or "")[:19].replace("T", " ")
            details = f"decided by {task.get('reviewer') or 'unknown'}"
            if decided:
                details += f" at {decided}"
            if task.get("note"):
                details += f" — “{task['note']}”"
            st.markdown(muted(details), unsafe_allow_html=True)
            if status in {"APPROVED", "REJECTED"} and st.button(
                "Resolve", key=f"resolve_{widget_key}"
            ):
                _decide(review_id, "resolve", "")


statuses = ["OPEN", "APPROVED", "REJECTED", "RESOLVED"]
by_status = {status: [t for t in reviews if t.get("status") == status] for status in statuses}
tab_labels = [f"{status.title()} ({len(by_status[status])})" for status in statuses]
tab_labels.append(f"All ({len(reviews)})")
tabs = st.tabs(tab_labels)

for tab, status in zip(tabs[:4], statuses, strict=True):
    with tab:
        tasks = by_status[status]
        if not tasks:
            st.info(f"No {status.lower()} review tasks.")
        for task in tasks:
            _render_card(task, key_prefix=status.lower())

with tabs[4]:
    if not reviews:
        st.info("No review tasks yet — run a comparison on the Compare page to create some.")
    for task in reviews:
        _render_card(task, key_prefix="all")
