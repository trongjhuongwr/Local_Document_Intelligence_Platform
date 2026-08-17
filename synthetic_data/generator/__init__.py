"""DocFlowBench: deterministic synthetic business-document benchmark generator."""

import json
from collections import Counter
from pathlib import Path

from synthetic_data.generator.builder import GENERATOR_VERSION, build_case
from synthetic_data.generator.models import BenchmarkCase
from synthetic_data.generator.pdf_render import render_case_documents

__all__ = ["GENERATOR_VERSION", "build_case", "generate_benchmark"]


def generate_benchmark(seed: int, cases: int, output_dir: Path) -> list[BenchmarkCase]:
    """Generate `cases` document packs plus ground truth under `output_dir`.

    The same (seed, cases) input always produces byte-identical output.
    """
    documents_dir = output_dir / "documents"
    ground_truth_dir = output_dir / "ground_truth"
    documents_dir.mkdir(parents=True, exist_ok=True)
    ground_truth_dir.mkdir(parents=True, exist_ok=True)

    generated: list[BenchmarkCase] = []
    for index in range(1, cases + 1):
        case = build_case(seed, index)
        render_case_documents(case, documents_dir / case.case_id)
        gt_path = ground_truth_dir / f"{case.case_id}.json"
        gt_path.write_text(case.model_dump_json(indent=2) + "\n", encoding="utf-8")
        generated.append(case)

    manifest = {
        "benchmark": "DocFlowBench",
        "generator_version": GENERATOR_VERSION,
        "seed": seed,
        "case_count": cases,
        "anomaly_counts": dict(
            sorted(
                Counter(
                    anomaly.type.value for case in generated for anomaly in case.expected_anomalies
                ).items()
            )
        ),
        "clean_cases": sum(1 for case in generated if not case.expected_anomalies),
        "case_ids": [case.case_id for case in generated],
    }
    manifest_path = ground_truth_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return generated
