"""First-run product home and onboarding entry points."""

import streamlit as st

from ui import api_client
from ui.theme import escape, inject_css, muted, neutral_chip

inject_css()

st.markdown('<div class="eyebrow">Document intelligence workspace</div>', unsafe_allow_html=True)
st.title("Review document packs with evidence, not guesswork")
st.caption(
    "Create a case, add the business documents, and run a traceable discrepancy review "
    "entirely on your machine."
)

create_col, sample_col, _ = st.columns([1, 1, 2])
if create_col.button("Create a case", type="primary", width="stretch"):
    st.session_state["show_create_case"] = True
    st.switch_page("pages/cases.py")
if sample_col.button("Try a sample case", width="stretch"):
    try:
        with st.spinner("Preparing a four-document sample pack..."):
            case = api_client.create_demo_case()
    except api_client.APIError as exc:
        api_client.show_error(exc)
    else:
        st.session_state["active_case_id"] = case["case_id"]
        st.switch_page("pages/cases.py")

st.divider()
st.subheader("How it works")
steps = [
    ("1", "Create case", "Give the document review a clear business name."),
    ("2", "Add document pack", "Upload contract, invoice, purchase order, and policy."),
    ("3", "Analyze discrepancies", "Structured extraction plus deterministic checks."),
    ("4", "Review findings", "Approve or reject each finding with an audit trail."),
]
for column, (number, title, description) in zip(st.columns(4), steps, strict=True):
    with column:
        st.markdown(
            f'<div class="workspace-card"><div class="eyebrow">Step {number}</div>'
            f'<strong>{escape(title)}</strong><br><span class="muted">'
            f"{escape(description)}</span></div>",
            unsafe_allow_html=True,
        )

st.subheader("Recent cases")
try:
    cases = api_client.list_cases()
except api_client.APIError as exc:
    api_client.show_error(exc)
    cases = []

if not cases:
    st.markdown(
        '<div class="empty-state"><strong>No cases yet</strong><br>'
        '<span class="muted">Create your first case or open the sample workflow '
        "above.</span></div>",
        unsafe_allow_html=True,
    )
else:
    for case in cases[:5]:
        left, middle, action = st.columns([4, 3, 1], vertical_alignment="center")
        left.markdown(f"**{escape(case['name'])}**")
        left.markdown(muted(f"Updated {str(case['updated_at'])[:10]}"), unsafe_allow_html=True)
        middle.markdown(
            f"{neutral_chip(case['readiness'])} &nbsp; {case['open_review_count']} open finding(s)",
            unsafe_allow_html=True,
        )
        if action.button("Open", key=f"home_open_{case['case_id']}"):
            st.session_state["active_case_id"] = case["case_id"]
            st.switch_page("pages/cases.py")
