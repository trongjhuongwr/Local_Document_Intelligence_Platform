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

pages = [
    st.Page("pages/documents.py", title="Documents", icon=":material/folder_open:", default=True),
    st.Page("pages/ask.py", title="Ask", icon=":material/chat_bubble:"),
    st.Page("pages/compare.py", title="Compare", icon=":material/compare_arrows:"),
    st.Page("pages/reviews.py", title="Review Queue", icon=":material/fact_check:"),
    st.Page("pages/evaluation.py", title="Evaluation", icon=":material/monitoring:"),
]
navigation = st.navigation(pages)

with st.sidebar:
    st.markdown("### Document Intelligence")
    st.caption("local-first · llama3.2:1b · pgvector")
    if api_client.is_online():
        st.markdown(
            '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;'
            'background:#16A34A;margin-right:6px;"></span>'
            '<span style="color:#6B7280;font-size:0.8rem;">API connected</span>',
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;'
            'background:#DC2626;margin-right:6px;"></span>'
            '<span style="color:#6B7280;font-size:0.8rem;">API offline</span>',
            unsafe_allow_html=True,
        )
        st.caption(f"Expected at {api_client.API_BASE_URL}")

navigation.run()
