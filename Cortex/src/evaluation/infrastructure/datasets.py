"""
Dataset loader — read a JSONL evaluation dataset.

The shape is the V4 brief's
``tests/evals/datasets/retrieval_v1.jsonl`` format:

    {"id": "case-001",
     "question": "How are ingestion failures retried?",
     "relevant_document_ids": ["..."],
     "relevant_chunk_ids": ["..."]}

The V3 ``tests/evals/dataset.jsonl`` (the file the
existing test suite already loads) is also accepted —
its rows are missing ``id`` / ``relevant_*_ids`` and
use ``expected_keywords`` instead. The loader
auto-generates an id and falls back to keyword-match
ground truth when those fields are absent, so V3 and
V4 datasets coexist.

Phase 17 added a parallel shape
(``tests/evals/datasets/faithfulness_v1.jsonl``) for
the *faithfulness* evaluation:

    {"id": "faith-001",
     "question": "...",
     "context": ["..."],
     "answer": "...",
     "supported_claims": ["..."]}

The same module loads both — the loader returns
either :class:`EvalCase` or :class:`FaithfulnessCase`
depending on which fields the row carries.

The loader never throws on a malformed row: the row
is logged and skipped, so a single bad entry doesn't
kill a 50-case run.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from pathlib import Path
from typing import Union

from src.evaluation.domain.entities import (
    EvalCase,
    FaithfulnessCase,
)


logger = logging.getLogger(__name__)


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(text: str) -> str:
    """Generate a slug id for a row that lacks one."""
    base = _SLUG_RE.sub("-", text.lower()).strip("-")
    return base or uuid.uuid4().hex[:8]


def _coerce_str_list(value) -> list[str]:
    """Best-effort conversion of an arbitrary JSON value
    to a list of strings. A non-list input becomes
    ``[]``; a list with non-string entries is filtered.
    """
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        if isinstance(item, str):
            out.append(item)
        elif item is not None:
            out.append(str(item))
    return out


def load_dataset(
    path: str | Path,
    *,
    case_type: str = "auto",
) -> list[Union[EvalCase, FaithfulnessCase]]:
    """
    Load a JSONL evaluation dataset.

    Returns a list of :class:`EvalCase` (Phase 16) or
    :class:`FaithfulnessCase` (Phase 17). The two
    shapes are distinguished by the fields the row
    carries: a row with ``context`` / ``answer`` /
    ``supported_claims`` becomes a
    :class:`FaithfulnessCase`; everything else is
    a :class:`EvalCase`.

    ``case_type`` overrides the auto-detection:

    * ``"auto"`` (default) — detect from the row.
    * ``"retrieval"`` — every row is parsed as an
      :class:`EvalCase`. Rows with faithfulness-shape
      fields are skipped (logged at WARNING).
    * ``"faithfulness"`` — every row is parsed as a
      :class:`FaithfulnessCase`. Rows without the
      faithfulness fields are skipped.

    Malformed rows are logged and skipped, so the
    rest of the file still runs.
    """
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Dataset not found: {p}")
    cases: list[Union[EvalCase, FaithfulnessCase]] = []
    skipped = 0
    with p.open("r", encoding="utf-8") as f:
        for lineno, raw in enumerate(f, start=1):
            raw = raw.strip()
            if not raw:
                continue
            try:
                row = json.loads(raw)
            except json.JSONDecodeError as exc:
                logger.warning(
                    "Skipping malformed dataset row %d (%s)", lineno, exc
                )
                skipped += 1
                continue
            if not isinstance(row, dict):
                logger.warning("Skipping non-dict dataset row %d", lineno)
                skipped += 1
                continue
            row_kind = _detect_row_kind(row)
            if case_type == "retrieval" and row_kind == "faithfulness":
                logger.warning("Row %d has faithfulness fields; skipping under retrieval mode", lineno)
                skipped += 1
                continue
            if case_type == "faithfulness" and row_kind == "retrieval":
                logger.warning("Row %d lacks faithfulness fields; skipping under faithfulness mode", lineno)
                skipped += 1
                continue
            try:
                if row_kind == "faithfulness":
                    cases.append(_row_to_faithfulness_case(row))
                else:
                    cases.append(_row_to_retrieval_case(row))
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Skipping dataset row %d (entity validation failed: %s)",
                    lineno,
                    exc,
                )
                skipped += 1
    if skipped:
        logger.info(
            "load_dataset: loaded %d cases, skipped %d malformed row(s)",
            len(cases),
            skipped,
        )
    return cases


def _detect_row_kind(row: dict) -> str:
    """Return ``"faithfulness"`` if the row carries the
    faithfulness fields, else ``"retrieval"``."""
    if (
        "context" in row
        or "answer" in row
        or "supported_claims" in row
    ):
        return "faithfulness"
    return "retrieval"


def _row_to_retrieval_case(row: dict) -> EvalCase:
    """Translate a JSONL row dict into an :class:`EvalCase`."""
    q = (row.get("question") or "").strip()
    if not q:
        raise ValueError("missing 'question'")
    case_id = (
        row.get("id")
        or row.get("case_id")
        or _slugify(q)[:80]
    )
    return EvalCase(
        id=str(case_id),
        question=q,
        relevant_document_ids=_coerce_str_list(
            row.get("relevant_document_ids")
            or row.get("expected_document_ids")
        ),
        relevant_chunk_ids=_coerce_str_list(
            row.get("relevant_chunk_ids")
        ),
        expected_keywords=_coerce_str_list(
            row.get("expected_keywords")
        ),
        metadata={
            k: v
            for k, v in row.items()
            if k
            not in (
                "id",
                "question",
                "relevant_document_ids",
                "relevant_chunk_ids",
                "expected_keywords",
                "case_id",
                "expected_document_ids",
            )
        },
    )


def _row_to_faithfulness_case(row: dict) -> FaithfulnessCase:
    """Translate a JSONL row dict into a
    :class:`FaithfulnessCase`."""
    q = (row.get("question") or "").strip()
    if not q:
        raise ValueError("missing 'question'")
    case_id = (
        row.get("id")
        or row.get("case_id")
        or _slugify(q)[:80]
    )
    return FaithfulnessCase(
        id=str(case_id),
        question=q,
        context=_coerce_str_list(row.get("context")),
        answer=str(row.get("answer") or ""),
        supported_claims=_coerce_str_list(row.get("supported_claims")),
        extraction_mode=str(row.get("extraction_mode") or "simple"),
        metadata={
            k: v
            for k, v in row.items()
            if k
            not in (
                "id",
                "question",
                "context",
                "answer",
                "supported_claims",
                "extraction_mode",
                "case_id",
            )
        },
    )


__all__ = ["load_dataset"]
