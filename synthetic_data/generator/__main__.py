"""CLI: python -m synthetic_data.generator --seed 42 --cases 50"""

import argparse
from collections import Counter
from pathlib import Path

from synthetic_data.generator import generate_benchmark


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m synthetic_data.generator",
        description="Generate the DocFlowBench synthetic document benchmark.",
    )
    parser.add_argument("--seed", type=int, default=42, help="deterministic seed (default: 42)")
    parser.add_argument("--cases", type=int, default=20, help="number of cases (default: 20)")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("synthetic_data"),
        help="output root (default: synthetic_data/)",
    )
    args = parser.parse_args(argv)

    cases = generate_benchmark(seed=args.seed, cases=args.cases, output_dir=args.output_dir)

    anomaly_counts = Counter(
        anomaly.type.value for case in cases for anomaly in case.expected_anomalies
    )
    clean = sum(1 for case in cases if not case.expected_anomalies)
    print(f"Generated {len(cases)} cases (seed={args.seed}) under {args.output_dir}")
    print(f"  clean cases: {clean}")
    for anomaly_type, count in sorted(anomaly_counts.items()):
        print(f"  {anomaly_type}: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
