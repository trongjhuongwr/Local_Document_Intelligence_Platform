"""Deterministic construction of DocFlowBench benchmark cases.

All randomness flows through one `random.Random` seeded per case, so the same
(seed, index) pair always produces the same case regardless of generation order.
"""

import random
from datetime import date, timedelta
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

from synthetic_data.generator.anomalies import inject_anomalies, select_anomaly_types
from synthetic_data.generator.models import (
    BenchmarkCase,
    ContractTruth,
    InvoiceTruth,
    LineItem,
    PolicyTruth,
    PurchaseOrderTruth,
)

GENERATOR_VERSION = "1.0.0"

VENDORS = [
    "Acme Analytics Ltd",
    "Borealis Software GmbH",
    "Cobalt Logistics LLC",
    "Delta Materials Co",
    "Everline Consulting Group",
    "Falcon Industrial Supply",
    "Greenfield Data Systems",
    "Harborview Technologies",
    "Ironwood Manufacturing",
    "Juniper Cloud Services",
    "Kestrel Marketing Agency",
    "Lumen Electrical Works",
    "Meridian Office Solutions",
    "Northgate Security Services",
    "Oakstone Facilities Management",
    "Pinnacle Training Institute",
]

CUSTOMERS = [
    "Vertex Retail Corporation",
    "Bluewater Foods JSC",
    "Summit Healthcare Group",
    "Atlas Construction Holdings",
    "Crescent Media Group",
    "Horizon Education Partners",
]

SERVICES = [
    "Software license subscription",
    "Implementation services",
    "Monthly maintenance retainer",
    "Consulting engagement",
    "Hardware components delivery",
    "On-site training workshop",
    "Premium support plan",
    "Data migration services",
    "Quality assurance audit",
    "Infrastructure monitoring",
]

OBLIGATIONS = [
    "Provider shall deliver monthly progress reports to the Client.",
    "Provider shall maintain confidentiality of all Client data.",
    "Client shall provide timely access to required systems and personnel.",
    "Provider shall assign a dedicated account manager for the term.",
    "All deliverables remain the property of the Client upon payment.",
    "Provider shall comply with the Client's information security policies.",
]

CURRENCIES = ["USD", "EUR", "GBP"]
PAYMENT_TERMS_DAYS = {"Net 15": 15, "Net 30": 30, "Net 45": 45, "Net 60": 60}
TAX_RATES = [Decimal("0"), Decimal("5"), Decimal("8"), Decimal("10")]

APPROVAL_THRESHOLDS = [Decimal(5000), Decimal(10000), Decimal(25000), Decimal(50000)]


def money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def round_up_to(value: Decimal, step: Decimal) -> Decimal:
    return money((value / step).to_integral_value(rounding=ROUND_CEILING) * step)


def _build_line_items(rng: random.Random) -> tuple[list[LineItem], Decimal]:
    items: list[LineItem] = []
    subtotal = Decimal("0")
    for _ in range(rng.randint(1, 4)):
        quantity = rng.randint(1, 8)
        unit_price = Decimal(rng.randrange(50, 5001, 25))
        amount = money(unit_price * quantity)
        items.append(
            LineItem(
                description=rng.choice(SERVICES),
                quantity=quantity,
                unit_price=float(unit_price),
                amount=float(amount),
            )
        )
        subtotal += amount
    return items, subtotal


def build_case(seed: int, index: int) -> BenchmarkCase:
    rng = random.Random(f"{seed}:{index}")
    case_id = f"case_{index:03d}"

    vendor = rng.choice(VENDORS)
    customer = rng.choice(CUSTOMERS)
    currency = rng.choice(CURRENCIES)
    payment_terms = rng.choice(list(PAYMENT_TERMS_DAYS))
    tax_rate = rng.choice(TAX_RATES)

    line_items, subtotal = _build_line_items(rng)
    tax = money(subtotal * tax_rate / 100)
    total = money(subtotal + tax)

    # PO approves a budget at least 8% above the invoice so that small injected
    # numeric perturbations cannot accidentally cross the PO threshold, and the
    # contract cap sits 30-70% above the PO for the same reason.
    po_amount = round_up_to(total * (1 + Decimal(rng.randint(8, 18)) / 100), Decimal(100))
    contract_limit = round_up_to(
        po_amount * (1 + Decimal(rng.randint(30, 70)) / 100), Decimal(1000)
    )

    effective_date = date(2025, rng.randint(1, 12), rng.randint(1, 28))
    expiration_date = effective_date + timedelta(days=365)
    po_issue_date = effective_date + timedelta(days=rng.randint(10, 90))
    invoice_issue_date = po_issue_date + timedelta(days=rng.randint(5, 60))
    due_date = invoice_issue_date + timedelta(days=PAYMENT_TERMS_DAYS[payment_terms])

    po_number = f"PO-{po_issue_date.year}-{rng.randint(1000, 9999)}"
    invoice_number = f"INV-{invoice_issue_date.year}-{rng.randint(10000, 99999)}"

    threshold_candidates = [t for t in APPROVAL_THRESHOLDS if t <= contract_limit / 2]
    approval_threshold = threshold_candidates[-1] if threshold_candidates else Decimal(5000)

    contract = ContractTruth(
        vendor_name=vendor,
        customer_name=customer,
        effective_date=effective_date,
        expiration_date=expiration_date,
        currency=currency,
        maximum_amount=float(contract_limit),
        payment_terms=payment_terms,
        obligations=rng.sample(OBLIGATIONS, k=3),
    )
    purchase_order = PurchaseOrderTruth(
        po_number=po_number,
        vendor_name=vendor,
        customer_name=customer,
        issue_date=po_issue_date,
        currency=currency,
        approved_amount=float(po_amount),
    )
    invoice = InvoiceTruth(
        invoice_number=invoice_number,
        vendor_name=vendor,
        customer_name=customer,
        issue_date=invoice_issue_date,
        due_date=due_date,
        currency=currency,
        subtotal=float(subtotal),
        tax_rate_percent=float(tax_rate),
        tax=float(tax),
        total=float(total),
        payment_terms=payment_terms,
        po_reference=po_number,
        line_items=line_items,
        filename="invoice_001.pdf",
    )
    policy = PolicyTruth(
        customer_name=customer,
        required_payment_terms=payment_terms,
        po_reference_required=True,
        manual_approval_threshold=float(approval_threshold),
        currency=currency,
    )

    case = BenchmarkCase(
        case_id=case_id,
        vendor=vendor,
        customer=customer,
        currency=currency,
        contract_limit=float(contract_limit),
        purchase_order_amount=float(po_amount),
        invoice_amount=float(total),
        payment_terms=payment_terms,
        contract=contract,
        purchase_order=purchase_order,
        invoices=[invoice],
        policy=policy,
        expected_anomalies=[],
    )

    chosen_types = select_anomaly_types(rng)
    case.expected_anomalies = inject_anomalies(case, chosen_types, rng)

    # Refresh the flat convenience fields after mutation.
    case.invoice_amount = case.invoices[0].total
    case.contract_limit = case.contract.maximum_amount
    case.purchase_order_amount = case.purchase_order.approved_amount
    return case
