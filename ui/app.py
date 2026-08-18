"""Streamlit entrypoint: navigation shell + sidebar branding and API status.

Run from the repository root:  streamlit run ui/app.py
"""

import sys
from pathlib import Path

import streamlit as st

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from ui import api_client  # noqa: E402

st.set_page_config(
    page_title="Document Intelligence",
    page_icon=":material/plagiarism:",
    layout="wide",
)

pages = {
    "Workspace": [
        st.Page("pages/home.py", title="Home", icon=":material/home:", default=True),
        st.Page("pages/cases.py", title="Cases", icon=":material/folder_open:"),
        st.Page("pages/ask.py", title="Ask Documents", icon=":material/chat_bubble:"),
        st.Page("pages/reviews.py", title="Review Findings", icon=":material/fact_check:"),
    ],
    "Developer": [
        st.Page("pages/evaluation.py", title="Evaluation", icon=":material/monitoring:"),
    ],
}
navigation = st.navigation(pages)

with st.sidebar:
    st.markdown("### Document Intelligence")
    st.caption("Local-first audit workspace")
    try:
        readiness = api_client.ready()
    except api_client.APIError:
        readiness = None
    if readiness and readiness.get("status") == "ready":
        st.markdown(
            '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;'
            'background:#16A34A;margin-right:6px;"></span>'
            '<span style="color:#4B5563;font-size:0.8rem;">System ready</span>',
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;'
            'background:#DC2626;margin-right:6px;"></span>'
            '<span style="color:#4B5563;font-size:0.8rem;">System not ready</span>',
            unsafe_allow_html=True,
        )
        st.caption("Start PostgreSQL and Ollama, then reload.")
    with st.expander("System details"):
        st.caption(f"API: {api_client.API_BASE_URL}")
        if readiness:
            checks = readiness.get("checks", {})
            st.caption(f"Database: {checks.get('database', {}).get('status', 'unknown')}")
            model = checks.get("ollama", {}).get("llm_model", {}).get("model", "unknown")
            st.caption(f"Model: {model}")

navigation.run()
