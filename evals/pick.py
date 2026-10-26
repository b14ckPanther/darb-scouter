"""Pick about 30 scored jobs for hand labelling, spread across score deciles and sources.

    uv run --project backend python evals/pick.py --n 30

Writes evals/jobs/<id>.json with the public post text and its cached extraction. No personal data.
"""

import argparse
import json
from pathlib import Path

HERE = Path(__file__).parent


def spread(scored: list[tuple[str, int, str, str]], n: int) -> list[tuple[str, int, str, str]]:
    """Round-robin over score deciles (0-999, 1000-1999, ...), Hebrew posts first inside each decile."""
    buckets: dict[int, list[tuple[str, int, str, str]]] = {}
    for row in sorted(scored, key=lambda r: (r[3] != "he", -r[1])):
        buckets.setdefault(min(row[1] // 1000, 10), []).append(row)
    chosen: list[tuple[str, int, str, str]] = []
    while len(chosen) < n and any(buckets.values()):
        for key in sorted(buckets):
            if buckets[key] and len(chosen) < n:
                chosen.append(buckets[key].pop(0))
    return chosen


def main() -> None:
    from scouter import repo
    from scouter.db import session_factory

    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=30)
    n = ap.parse_args().n
    session = session_factory()()
    rows = {r.id: r for r in repo.scored_jobs(session)}
    scored = [(j.id, j.score.total, rows[j.id].source, rows[j.id].language) for j in repo.list_jobs(session)]
    out = HERE / "jobs"
    out.mkdir(exist_ok=True)
    for job_id, *_ in spread(scored, n):
        row = rows[job_id]
        jp = repo.get_profile_cache(session, row.content_hash) if row.content_hash else None
        case = {
            "raw": repo.raw_of(row).model_dump(mode="json"),
            "profile": jp.model_dump(mode="json") if jp else None,
        }
        (out / f"{job_id}.json").write_text(json.dumps(case, ensure_ascii=False, indent=1))
    print(f"wrote {len(list(out.glob('*.json')))} eval jobs to {out}")


if __name__ == "__main__":
    main()
