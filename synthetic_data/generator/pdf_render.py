"""Render DocFlowBench cases into deterministic PDF documents with ReportLab."""

from datetime import date
from pathlib import Path

from reportlab import rl_config
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from synthetic_data.generator.models import BenchmarkCase, InvoiceTruth

_styles = getSampleStyleSheet()
_TITLE = ParagraphStyle("DocTitle", parent=_styles["Title"], fontSize=16, spaceAfter=6)
_HEADING = ParagraphStyle("DocHeading", parent=_styles["Heading2"], fontSize=12, spaceBefore=10)
_BODY = ParagraphStyle("DocBody", parent=_styles["BodyText"], fontSize=10, leading=14)

_TABLE_STYLE = TableStyle(
    [
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
    ]
)


def _fmt_money(currency: str, amount: float) -> str:
    return f"{currency} {amount:,.2f}"


def _fmt_date(value: date | None) -> str:
    return value.isoformat() if value is not None else ""


def _document(path: Path, title: str, author: str) -> SimpleDocTemplate:
    # invariant=1 removes timestamps/random IDs so the same case bytes are
    # reproducible across runs — required for the seeded benchmark guarantee.
    rl_config.invariant = 1
    return SimpleDocTemplate(
        str(path),
        pagesize=A4,
        title=title,
        author=author,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
    )


def render_contract(case: BenchmarkCase, path: Path) -> None:
    contract = case.contract
    doc = _document(path, "Service Agreement", contract.vendor_name)
    story = [
        Paragraph("SERVICE AGREEMENT", _TITLE),
        Paragraph(
            f"This Service Agreement is entered into as of {_fmt_date(contract.effective_date)} "
            f'by and between <b>{contract.vendor_name}</b> (the "Provider") and '
            f'<b>{contract.customer_name}</b> (the "Client").',
            _BODY,
        ),
        Paragraph("1. Term", _HEADING),
        Paragraph(
            f"Effective Date: {_fmt_date(contract.effective_date)}<br/>"
            f"Expiration Date: {_fmt_date(contract.expiration_date)}<br/>"
            "This Agreement remains in force between the dates above unless "
            "terminated earlier in accordance with its terms.",
            _BODY,
        ),
        Paragraph("2. Fees and Maximum Amount", _HEADING),
        Paragraph(
            f"The total aggregate fees payable under this Agreement shall not exceed "
            f"<b>{_fmt_money(contract.currency, contract.maximum_amount)}</b>. "
            f"All amounts are stated and payable in {contract.currency}. "
            f"Maximum aggregate fees: {_fmt_money(contract.currency, contract.maximum_amount)}.",
            _BODY,
        ),
        Paragraph("3. Payment Terms", _HEADING),
        Paragraph(
            f"Payment terms: <b>{contract.payment_terms}</b>. Invoices are payable within "
            f"the period indicated by the payment terms, measured from the invoice date. "
            f"Invoices must reference the corresponding purchase order number.",
            _BODY,
        ),
        Paragraph("4. Obligations", _HEADING),
    ]
    story.extend(
        Paragraph(f"4.{i}. {obligation}", _BODY)
        for i, obligation in enumerate(contract.obligations, start=1)
    )
    story.extend(
        [
            Paragraph("5. Signatures", _HEADING),
            Paragraph(
                f"Signed for and on behalf of {contract.vendor_name} and {contract.customer_name}.",
                _BODY,
            ),
        ]
    )
    doc.build(story)


def render_purchase_order(case: BenchmarkCase, path: Path) -> None:
    po = case.purchase_order
    doc = _document(path, "Purchase Order", po.customer_name)
    table = Table(
        [
            ["Description", "Amount"],
            [
                "Services as per the service agreement",
                _fmt_money(po.currency, po.approved_amount),
            ],
            ["Approved Amount", _fmt_money(po.currency, po.approved_amount)],
        ],
        colWidths=[110 * mm, 50 * mm],
    )
    table.setStyle(_TABLE_STYLE)
    story = [
        Paragraph("PURCHASE ORDER", _TITLE),
        Paragraph(
            f"PO Number: <b>{po.po_number}</b><br/>"
            f"Issue Date: {_fmt_date(po.issue_date)}<br/>"
            f"Currency: {po.currency}",
            _BODY,
        ),
        Paragraph("Vendor", _HEADING),
        Paragraph(po.vendor_name, _BODY),
        Paragraph("Bill To", _HEADING),
        Paragraph(po.customer_name, _BODY),
        Spacer(1, 6 * mm),
        table,
        Spacer(1, 4 * mm),
        Paragraph(
            f"Approved Amount: {_fmt_money(po.currency, po.approved_amount)}. "
            "This purchase order authorises billing up to the approved amount only.",
            _BODY,
        ),
    ]
    doc.build(story)


def render_invoice(case: BenchmarkCase, invoice: InvoiceTruth, path: Path) -> None:
    doc = _document(path, "Invoice", invoice.vendor_name)
    rows: list[list[str]] = [["Description", "Qty", "Unit Price", "Amount"]]
    rows.extend(
        [
            item.description,
            str(item.quantity),
            f"{item.unit_price:,.2f}",
            f"{item.amount:,.2f}",
        ]
        for item in invoice.line_items
    )
    items_table = Table(rows, colWidths=[80 * mm, 15 * mm, 30 * mm, 35 * mm])
    items_table.setStyle(_TABLE_STYLE)

    header_lines = [
        f"Invoice Number: <b>{invoice.invoice_number}</b>",
        f"Issue Date: {_fmt_date(invoice.issue_date)}" if invoice.issue_date else None,
        f"Due Date: {_fmt_date(invoice.due_date)}" if invoice.due_date else None,
        f"Currency: {invoice.currency}",
        f"PO Reference: {invoice.po_reference}" if invoice.po_reference else None,
    ]
    totals_lines = [
        f"Subtotal: {_fmt_money(invoice.currency, invoice.subtotal)}",
        f"Tax ({invoice.tax_rate_percent:g}%): {_fmt_money(invoice.currency, invoice.tax)}",
        f"<b>Total Due: {_fmt_money(invoice.currency, invoice.total)}</b>",
    ]
    story = [
        Paragraph("INVOICE", _TITLE),
        Paragraph("<br/>".join(line for line in header_lines if line), _BODY),
        Paragraph("From", _HEADING),
        Paragraph(invoice.vendor_name, _BODY),
        Paragraph("Bill To", _HEADING),
        Paragraph(invoice.customer_name, _BODY),
        Spacer(1, 6 * mm),
        items_table,
        Spacer(1, 4 * mm),
        Paragraph("<br/>".join(totals_lines), _BODY),
    ]
    if invoice.payment_terms:
        story.append(Paragraph(f"Payment Terms: {invoice.payment_terms}", _BODY))
    doc.build(story)


def render_policy(case: BenchmarkCase, path: Path) -> None:
    policy = case.policy
    doc = _document(path, "Accounts Payable Policy", policy.customer_name)
    threshold = _fmt_money(policy.currency, policy.manual_approval_threshold)
    story = [
        Paragraph("ACCOUNTS PAYABLE POLICY", _TITLE),
        Paragraph(f"Issuer: {policy.customer_name}", _BODY),
        Paragraph("1. Payment Terms", _HEADING),
        Paragraph(
            f"Standard payment terms for all vendor invoices are "
            f"<b>{policy.required_payment_terms}</b>. Deviations require written approval "
            "from the finance department.",
            _BODY,
        ),
        Paragraph("2. Purchase Order Requirement", _HEADING),
        Paragraph(
            "All vendor invoices must reference a valid purchase order number. "
            "Invoices without a purchase order reference are rejected.",
            _BODY,
        ),
        Paragraph("3. Approval Thresholds", _HEADING),
        Paragraph(
            f"Invoices above {threshold} require manual approval by a finance manager "
            "before payment is released.",
            _BODY,
        ),
        Paragraph("4. Currency", _HEADING),
        Paragraph(
            f"All invoices must be issued in {policy.currency} unless the underlying "
            "contract explicitly states otherwise.",
            _BODY,
        ),
    ]
    doc.build(story)


def render_case_documents(case: BenchmarkCase, case_dir: Path) -> list[str]:
    """Render every document of a case; returns the list of filenames written."""
    case_dir.mkdir(parents=True, exist_ok=True)
    render_contract(case, case_dir / "service_contract.pdf")
    render_purchase_order(case, case_dir / "purchase_order.pdf")
    for invoice in case.invoices:
        render_invoice(case, invoice, case_dir / invoice.filename)
    render_policy(case, case_dir / "payment_policy.pdf")
    return [
        "service_contract.pdf",
        "purchase_order.pdf",
        *[invoice.filename for invoice in case.invoices],
        "payment_policy.pdf",
    ]
