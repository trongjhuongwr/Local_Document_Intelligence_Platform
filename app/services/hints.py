"""Deterministic hint helpers shared by the API and clients."""

from pathlib import Path


def infer_document_type(filename: str) -> str | None:
    name = Path(filename).stem.lower().replace("-", "_").replace(" ", "_")
    if any(token in name for token in ("invoice", "inv_", "bill")):
        return "invoice"
    if any(token in name for token in ("contract", "agreement", "msa")):
        return "contract"
    if any(token in name for token in ("purchase_order", "po_", "order")):
        return "purchase_order"
    if any(token in name for token in ("policy", "payment_rule", "accounts_payable")):
        return "policy"
    return None


def suggested_questions(document_types: set[str]) -> list[str]:
    questions = ["Summarize the key commercial terms in this case."]
    if "invoice" in document_types:
        questions.append("What is the invoice total and due date?")
    if {"invoice", "contract"}.issubset(document_types):
        questions.append("Do the invoice payment terms match the contract?")
    if "purchase_order" in document_types:
        questions.append("Which purchase order does the invoice reference?")
    return questions[:4]
