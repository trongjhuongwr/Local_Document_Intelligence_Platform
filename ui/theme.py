"""Shared CSS and tiny HTML helpers for the Streamlit UI.

One small stylesheet, injected once per page via ``inject_css()``:
severity badges, status chips, evidence cards, and muted metadata text.
"""

import html

import streamlit as st

_CSS = """
<style>
.badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    white-space: nowrap;
}
.sev-high { background: #FEE2E2; color: #B91C1C; }
.sev-medium { background: #FEF3C7; color: #92400E; }
.sev-low { background: #E5E7EB; color: #374151; }
.chip-open { background: #DBEAFE; color: #1D4ED8; }
.chip-approved { background: #DCFCE7; color: #15803D; }
.chip-rejected { background: #FEE2E2; color: #B91C1C; }
.chip-resolved { background: #E5E7EB; color: #4B5563; }
.chip-neutral { background: #F3F4F6; color: #374151; font-weight: 500; }
.evidence-card {
    background: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-radius: 8px;
    padding: 0.9rem 1.1rem;
    margin-bottom: 0.75rem;
    line-height: 1.55;
}
.muted { color: #6B7280; font-size: 0.8rem; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
.dot-ok { background: #16A34A; }
.dot-err { background: #DC2626; }
</style>
"""

_SEVERITY_CLASSES = {"high": "sev-high", "medium": "sev-medium", "low": "sev-low"}
_STATUS_CLASSES = {
    "OPEN": "chip-open",
    "APPROVED": "chip-approved",
    "REJECTED": "chip-rejected",
    "RESOLVED": "chip-resolved",
}


def inject_css() -> None:
    """Inject the shared stylesheet. Call once at the top of every page."""
    st.markdown(_CSS, unsafe_allow_html=True)


def severity_badge(severity: str | None) -> str:
    sev = (severity or "medium").lower()
    css = _SEVERITY_CLASSES.get(sev, "sev-low")
    return f'<span class="badge {css}">{html.escape(sev.upper())}</span>'


def status_chip(status: str | None) -> str:
    value = (status or "").upper()
    css = _STATUS_CLASSES.get(value, "chip-neutral")
    return f'<span class="badge {css}">{html.escape(value or "UNKNOWN")}</span>'


def neutral_chip(label: str) -> str:
    return f'<span class="badge chip-neutral">{html.escape(label)}</span>'


def muted(text: str) -> str:
    return f'<span class="muted">{html.escape(text)}</span>'


def evidence_card(body_html: str) -> str:
    """Wrap already-escaped HTML in an evidence card container."""
    return f'<div class="evidence-card">{body_html}</div>'


def escape(text: object) -> str:
    return html.escape(str(text))
