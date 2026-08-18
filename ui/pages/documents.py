"""Documents page: upload, browse, inspect chunks, index, delete."""

from typing import Any

import pandas as pd
import streamlit as st

from ui import api_client
from ui.theme import inject_css, muted, status_chip

inject_css()
st.title("Documents")
st.caption("Upload contracts, invoices, purchase orders and policies, then inspect their chunks.")

DOCUMENT_TYPES = ["invoice", "contract", "purchase_order", "policy"]

flash = st.session_state.pop("documents_flash", None)
if flash:
    st.toast(flash)

left, right = st.columns([1, 2], gap="large")

# ------------------------------------------------------------------------- upload
with left:
    st.subheader("Upload")
    with st.form("upload_form", clear_on_submit=True):
        uploaded_file = st.file_uploader("Document file", type=["pdf", "docx", "txt", "md", "csv"])
        document_type = st.selectbox(
            "Document type",
            options=[None, *DOCUMENT_TYPES],
            format_func=lambda v: "Not specified" if v is None else v.replace("_", " "),
        )
        case_id = st.text_input("Case ID", placeholder="e.g. CASE-0001")
        submitted = st.form_submit_button("Upload", type="primary", width="stretch")

    if submitted:
        if uploaded_file is None:
            st.warning("Choose a file first.")
        else:
            try:
                with st.spinner("Uploading and parsing the document..."):
                    outcome = api_client.upload_document(
                        uploaded_file.name,
                        uploaded_file.getvalue(),
                        document_type=document_type,
                        case_id=case_id.strip() or None,
                    )
            except api_client.APIError as exc:
                api_client.show_error(exc)
            else:
                if outcome.get("duplicate"):
                    st.info("Already ingested in this case and document type.")
                else:
                    st.toast(f"Ingested {outcome['filename']} ({outcome['chunk_count']} chunks)")

# -------------------------------------------------------------------------- table
with right:
    st.subheader("Library")
    try:
        documents = api_client.list_documents(limit=200)
    except api_client.APIError as exc:
        api_client.show_error(exc)
        st.stop()

    if not documents:
        st.info("No documents yet — upload one on the left.")
        st.stop()

    table = pd.DataFrame(
        [
            {
                "Filename": d["filename"],
                "Type": (d.get("document_type") or "—").replace("_", " "),
                "Case": d.get("case_id") or "—",
                "Status": d["status"],
                "Size (KB)": round(d["size_bytes"] / 1024, 1),
                "Created": str(d["created_at"])[:19].replace("T", " "),
            }
            for d in documents
        ]
    )
    event: Any = st.dataframe(
        table,
        hide_index=True,
        width="stretch",
        on_select="rerun",
        selection_mode="single-row",
    )
    st.markdown(muted("Select a row to inspect the document."), unsafe_allow_html=True)

    selected_rows = event.selection.rows if event.selection else []
    if selected_rows:
        document_id = str(documents[selected_rows[0]]["document_id"])

        try:
            detail = api_client.get_document(document_id)
            chunks = api_client.get_document_chunks(document_id)
        except api_client.APIError as exc:
            api_client.show_error(exc)
            st.stop()

        st.divider()
        header_left, header_right = st.columns([3, 1])
        with header_left:
            st.markdown(f"#### {detail['filename']}")
        with header_right:
            st.markdown(status_chip(detail["status"]), unsafe_allow_html=True)

        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Chunks", detail["chunk_count"])
        m2.metric("Pages", detail.get("page_count") or "—")
        m3.metric("Elements", detail["element_count"])
        m4.metric("Size", f"{detail['size_bytes'] / 1024:.1f} KB")
        st.markdown(
            muted(
                f"type: {detail.get('document_type') or 'unspecified'} · "
                f"case: {detail.get('case_id') or 'none'} · "
                f"parser {detail['parser_version']} · sha256 {detail['sha256'][:12]}…"
            ),
            unsafe_allow_html=True,
        )
        if detail.get("error_message"):
            st.error(detail["error_message"])

        with st.expander(f"Chunks (showing {min(len(chunks), 20)} of {len(chunks)})"):
            for chunk in chunks[:20]:
                page = chunk.get("page_number")
                section = chunk.get("section")
                meta = f"#{chunk['order_index']}"
                if page is not None:
                    meta += f" · page {page}"
                if section:
                    meta += f" · {section}"
                st.markdown(muted(meta), unsafe_allow_html=True)
                snippet = chunk["text"][:500]
                if len(chunk["text"]) > 500:
                    snippet += " …"
                st.code(snippet, language=None)

        action_index, action_delete = st.columns(2)
        with action_index:
            if st.button("Index for search", width="stretch"):
                try:
                    with st.spinner("Embedding chunks and building the search index..."):
                        result = api_client.index_document(document_id)
                except api_client.APIStatusError as exc:
                    if exc.status_code == 404:
                        st.info("Search indexing endpoint not available yet.")
                    else:
                        api_client.show_error(exc)
                except api_client.APIError as exc:
                    api_client.show_error(exc)
                else:
                    st.toast(f"Indexed {result['chunks_indexed']} chunks")
        with action_delete:
            confirm = st.checkbox("Confirm deletion", key=f"confirm_delete_{document_id}")
            if st.button("Delete", width="stretch", disabled=not confirm):
                try:
                    api_client.delete_document(document_id)
                except api_client.APIError as exc:
                    api_client.show_error(exc)
                else:
                    st.session_state["documents_flash"] = f"Deleted {detail['filename']}"
                    st.rerun()
