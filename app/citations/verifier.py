"""Citation verification: every citation in an answer must resolve to known evidence."""

import re

from app.citations.models import Citation, VerificationResult

_CITATION_PATTERN = re.compile(r"\[(C\d+)\]")


def verify_citations(answer: str, citations: dict[str, Citation]) -> VerificationResult:
    used = list(dict.fromkeys(_CITATION_PATTERN.findall(answer)))
    unknown = [citation_id for citation_id in used if citation_id not in citations]
    unused = [citation_id for citation_id in citations if citation_id not in used]

    warnings: list[str] = []
    if unknown:
        warnings.append(f"Answer references citations that do not exist: {', '.join(unknown)}")
    if not used:
        warnings.append("Answer contains no citations")

    return VerificationResult(
        valid=not unknown,
        used_citation_ids=used,
        unknown_citation_ids=unknown,
        unused_citation_ids=unused,
        warnings=warnings,
    )


def remove_unknown_citations(answer: str, citations: dict[str, Citation]) -> str:
    """Strip citation markers that do not resolve to real evidence."""

    def _replace(match: re.Match[str]) -> str:
        return match.group(0) if match.group(1) in citations else ""

    return _CITATION_PATTERN.sub(_replace, answer).replace("  ", " ").strip()
