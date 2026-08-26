"""Unit tests for the append-only ledger's hashing and verification.

No database: the hashing, canonical serialisation and chain verification are all
pure functions, and the ORM instances they read are built in memory.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from app.models.audit import AuditEvent
from app.services.audit_ledger import (
    GENESIS_HASH,
    canonical_json,
    compute_entry_hash,
    event_payload,
    row_payload,
    verify_ledger,
)

BASE = datetime(2026, 3, 1, 12, 0, tzinfo=UTC)


def _spec(minute: int, event_type: str, entity_id: str, **overrides: Any) -> dict[str, Any]:
    spec: dict[str, Any] = {
        "occurred_at": BASE + timedelta(minutes=minute),
        "event_type": event_type,
        "actor": "system:test",
        "summary": f"{event_type} on {entity_id}",
        "case_id": "case-1",
        "entity_type": "document",
        "entity_id": entity_id,
        "details": {"n": minute},
    }
    spec.update(overrides)
    return spec


def _chain(specs: list[dict[str, Any]]) -> list[AuditEvent]:
    """Build stored rows exactly the way ``append_event`` would, in memory."""
    rows: list[AuditEvent] = []
    prev_hash = GENESIS_HASH
    for sequence, spec in enumerate(specs, start=1):
        entry_hash = compute_entry_hash(prev_hash, event_payload(**spec))
        rows.append(
            AuditEvent(
                id=uuid.uuid4(),
                sequence=sequence,
                prev_hash=prev_hash,
                entry_hash=entry_hash,
                **spec,
            )
        )
        prev_hash = entry_hash
    return rows


# --------------------------------------------------------------------------
# Canonical serialisation
# --------------------------------------------------------------------------


def test_canonical_json_is_stable_across_key_ordering() -> None:
    first = {"b": 1, "a": {"z": [1, 2], "y": "x"}, "c": None}
    second = {"c": None, "a": {"y": "x", "z": [1, 2]}, "b": 1}
    assert canonical_json(first) == canonical_json(second)
    assert canonical_json(first) == '{"a":{"y":"x","z":[1,2]},"b":1,"c":null}'


def test_canonical_json_does_not_depend_on_details_key_order() -> None:
    left = _spec(0, "CASE_CREATED", "case-1", details={"a": 1, "b": {"d": 4, "c": 3}})
    right = _spec(0, "CASE_CREATED", "case-1", details={"b": {"c": 3, "d": 4}, "a": 1})
    assert compute_entry_hash(GENESIS_HASH, event_payload(**left)) == compute_entry_hash(
        GENESIS_HASH, event_payload(**right)
    )


def test_payload_normalises_timestamps_to_utc() -> None:
    naive = event_payload(**_spec(0, "A", "one", occurred_at=datetime(2026, 3, 1, 12, 0)))
    aware = event_payload(**_spec(0, "A", "one"))
    assert naive["occurred_at"] == aware["occurred_at"] == "2026-03-01T12:00:00+00:00"


def test_payload_covers_only_the_documented_fields() -> None:
    payload = event_payload(**_spec(0, "A", "one"))
    assert set(payload) == {
        "occurred_at",
        "event_type",
        "actor",
        "case_id",
        "entity_type",
        "entity_id",
        "summary",
        "details",
    }


# --------------------------------------------------------------------------
# Chaining
# --------------------------------------------------------------------------


def test_hashing_is_deterministic_for_the_same_input() -> None:
    payload = event_payload(**_spec(0, "CASE_CREATED", "case-1"))
    assert compute_entry_hash(GENESIS_HASH, payload) == compute_entry_hash(GENESIS_HASH, payload)
    assert len(compute_entry_hash(GENESIS_HASH, payload)) == 64


def test_hashing_is_order_dependent() -> None:
    forward = _chain([_spec(0, "A", "one"), _spec(1, "B", "two")])
    backward = _chain([_spec(1, "B", "two"), _spec(0, "A", "one")])
    # Same two events, swapped: the head hash differs, so the chain records order.
    assert forward[-1].entry_hash != backward[-1].entry_hash
    assert forward[0].entry_hash != backward[0].entry_hash


def test_prev_hash_links_each_row_to_the_previous_one() -> None:
    rows = _chain([_spec(0, "A", "one"), _spec(1, "B", "two"), _spec(2, "C", "three")])
    assert rows[0].prev_hash == GENESIS_HASH
    assert rows[1].prev_hash == rows[0].entry_hash
    assert rows[2].prev_hash == rows[1].entry_hash


def test_the_same_event_hashes_differently_at_a_different_position() -> None:
    alone = _chain([_spec(0, "A", "one")])
    after = _chain([_spec(1, "B", "two"), _spec(0, "A", "one")])
    assert alone[0].entry_hash != after[1].entry_hash


# --------------------------------------------------------------------------
# Verification
# --------------------------------------------------------------------------


def test_verify_ledger_accepts_an_untouched_chain() -> None:
    rows = _chain([_spec(0, "A", "one"), _spec(1, "B", "two"), _spec(2, "C", "three")])
    result = verify_ledger(rows)
    assert result.valid is True
    assert result.checked == 3
    assert result.first_broken_sequence is None


def test_verify_ledger_accepts_an_empty_ledger() -> None:
    assert verify_ledger([]) == verify_ledger([])
    assert verify_ledger([]).valid is True
    assert verify_ledger([]).checked == 0


def test_verify_ledger_ignores_the_order_it_is_given_rows_in() -> None:
    rows = _chain([_spec(0, "A", "one"), _spec(1, "B", "two")])
    assert verify_ledger(list(reversed(rows))).valid is True


def test_verify_ledger_detects_a_mutated_row_and_reports_its_sequence() -> None:
    rows = _chain([_spec(0, "A", "one"), _spec(1, "B", "two"), _spec(2, "C", "three")])
    rows[1].actor = "someone else"

    result = verify_ledger(rows)
    assert result.valid is False
    assert result.first_broken_sequence == 2
    assert result.checked == 2  # stopped at the first broken row


def test_verify_ledger_detects_a_mutated_details_payload() -> None:
    rows = _chain([_spec(0, "A", "one"), _spec(1, "B", "two")])
    rows[1].details = {"n": 999}
    assert verify_ledger(rows).first_broken_sequence == 2


def test_verify_ledger_detects_a_rewritten_entry_hash() -> None:
    rows = _chain([_spec(0, "A", "one"), _spec(1, "B", "two")])
    rows[0].entry_hash = "f" * 64
    result = verify_ledger(rows)
    assert result.valid is False
    assert result.first_broken_sequence == 1


def test_verify_ledger_detects_a_removed_first_row() -> None:
    rows = _chain([_spec(0, "A", "one"), _spec(1, "B", "two")])
    # Dropping the genesis row leaves a prev_hash that chains to nothing.
    result = verify_ledger(rows[1:])
    assert result.valid is False
    assert result.first_broken_sequence == 2


def test_verify_ledger_detects_a_removed_middle_row() -> None:
    rows = _chain([_spec(0, "A", "one"), _spec(1, "B", "two"), _spec(2, "C", "three")])
    result = verify_ledger([rows[0], rows[2]])
    assert result.valid is False
    assert result.first_broken_sequence == 3


def test_verify_ledger_cannot_detect_a_removed_last_row() -> None:
    """An honest negative: truncating the head of the chain still verifies."""
    rows = _chain([_spec(0, "A", "one"), _spec(1, "B", "two"), _spec(2, "C", "three")])
    assert verify_ledger(rows[:-1]).valid is True


def test_row_payload_round_trips_through_stored_columns() -> None:
    rows = _chain([_spec(0, "A", "one")])
    assert compute_entry_hash(rows[0].prev_hash, row_payload(rows[0])) == rows[0].entry_hash


def test_null_prev_hash_is_treated_as_genesis() -> None:
    rows = _chain([_spec(0, "A", "one"), _spec(1, "B", "two")])
    rows[0].prev_hash = None
    assert verify_ledger(rows).valid is True
