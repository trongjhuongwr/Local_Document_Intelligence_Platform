"""Exception report generation: structured JSON first, prose second.

The report separates deterministic facts (rule findings with calculations)
from anything model-derived, and always states its limitations.
"""

from typing import Any

from app.discrepancy.models import Discrepancy, DiscrepancyReport, DiscrepancySource


def build_exception_report(
    report: DiscrepancyReport,
    *,
    case_id: str | None,
    documents: list[dict[str, Any]],
    extraction_failures: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    issues = [_issue(d) for d in report.discrepancies]
    deterministic = sum(
        1 for d in report.discrepancies if d.source == DiscrepancySource.DETERMINISTIC_MISMATCH
    )
    summary = _summary(report, case_id)
    return {
        "case_id": case_id,
        "summary": summary,
        "documents_analyzed": documents,
        "issues": issues,
        "issue_count": len(issues),
        "deterministic_issue_count": deterministic,
        "model_suspected_issue_count": len(issues) - deterministic,
        "checks_run": report.checks_run,
        "requires_human_review": report.requires_human_review,
        "extraction_failures": extraction_failures or [],
        "limitations": [
            "Findings are based on values extracted by a local 1B-parameter model; "
            "extraction errors can cause missed or spurious findings.",
            "All numeric comparisons are deterministic Python calculations, not model output.",
            "This report does not constitute a legal or accounting decision; "
            "human review is required before any action.",
        ],
    }


def _issue(discrepancy: Discrepancy) -> dict[str, Any]:
    issue: dict[str, Any] = {
        "type": discrepancy.type.value,
        "source": discrepancy.source.value,
        "severity": discrepancy.severity.value,
        "description": discrepancy.description,
        "confidence": discrepancy.confidence,
    }
    if discrepancy.invoice_number is not None:
        issue["invoice_number"] = discrepancy.invoice_number
    if discrepancy.field is not None:
        issue["field"] = discrepancy.field
    if discrepancy.expected_value is not None:
        issue["expected_value"] = discrepancy.expected_value
    if discrepancy.observed_value is not None:
        issue["observed_value"] = discrepancy.observed_value
    if discrepancy.difference is not None:
        issue["difference"] = discrepancy.difference
    if discrepancy.calculation is not None:
        issue["calculation"] = discrepancy.calculation.model_dump()
    if discrepancy.evidence:
        issue["evidence"] = [
            reference.model_dump(mode="json") for reference in discrepancy.evidence
        ]
    return issue


def _summary(report: DiscrepancyReport, case_id: str | None) -> str:
    scope = f"case {case_id}" if case_id else f"{report.documents_analyzed} documents"
    if not report.discrepancies:
        return f"No discrepancies detected across {scope} ({report.checks_run} checks run)."
    high = sum(1 for d in report.discrepancies if d.severity.value == "high")
    parts = [f"{len(report.discrepancies)} potential issue(s) detected across {scope}"]
    if high:
        parts.append(f"{high} high severity")
    parts.append(f"{report.checks_run} checks run")
    return "; ".join(parts) + "."


def report_to_markdown(report: dict[str, Any]) -> str:
    lines = ["# Exception Report", ""]
    if report.get("case_id"):
        lines.append(f"**Case:** {report['case_id']}")
    lines += [f"**Summary:** {report['summary']}", ""]

    documents = report.get("documents_analyzed", [])
    if documents:
        lines += ["## Documents analyzed", ""]
        lines += [
            f"- {doc.get('filename', doc.get('document_id', '?'))} "
            f"({doc.get('document_type', 'unknown')})"
            for doc in documents
        ]
        lines.append("")

    issues = report.get("issues", [])
    if issues:
        lines += ["## Issues", ""]
        for index, issue in enumerate(issues, start=1):
            lines.append(
                f"### {index}. {issue['type']} — {issue['severity'].upper()} ({issue['source']})"
            )
            lines.append(issue["description"])
            if "difference" in issue:
                lines.append(f"- Difference: {issue['difference']:,}")
            if "calculation" in issue:
                calc = issue["calculation"]
                operands = ", ".join(f"{k}={v:,}" for k, v in calc["operands"].items())
                lines.append(f"- Calculation: `{calc['formula']}` with {operands}")
            if issue.get("evidence"):
                for reference in issue["evidence"]:
                    page = (
                        f" p.{reference['page_number']}"
                        if reference.get("page_number") is not None
                        else ""
                    )
                    field = f" · {reference['field']}" if reference.get("field") else ""
                    lines.append(f"- Evidence: {reference['filename']}{page}{field}")
            lines.append("")
    else:
        lines += ["## Issues", "", "None detected.", ""]

    failures = report.get("extraction_failures", [])
    if failures:
        lines += ["## Extraction failures", ""]
        lines += [f"- {f.get('filename', '?')}: {f.get('error', 'unknown')}" for f in failures]
        lines.append("")

    lines += [
        f"**Requires human review:** {'yes' if report['requires_human_review'] else 'no'}",
        "",
        "## Limitations",
        "",
    ]
    lines += [f"- {limitation}" for limitation in report.get("limitations", [])]
    return "\n".join(lines) + "\n"
