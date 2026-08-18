"""Evaluation database activation with a hard product-data safety guard."""

import os

from app.core.config import assert_safe_database_url


def activate_eval_database() -> str:
    url = os.environ.get("EVAL_DATABASE_URL")
    if not url:
        raise RuntimeError("EVAL_DATABASE_URL is required for database-backed evaluations")
    assert_safe_database_url(url, role="eval")
    os.environ["DATABASE_URL"] = url
    return url
