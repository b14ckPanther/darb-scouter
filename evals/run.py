"""Honesty metrics: does the score rank jobs the way Nour does, and does extraction find the must-haves Nour sees?

    uv run --project backend python evals/run.py          # cheap: cached extractions, rescored with the current profile
    uv run --project backend python evals/run.py --live   # re-extract every job with the configured model first

Gates (exit 1 when missed): Spearman rho >= RHO_GATE and must-have recall >= RECALL_GATE.
"""

import argparse
import json
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).parent
RHO_GATE = 0.5
RECALL_GATE = 0.7


def _ranks(xs: list[float]) -> list[float]:
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    ranks = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1  # ties share their average rank
        i = j + 1
    return ranks


def spearman(xs: list[float], ys: list[float]) -> float:
    rx, ry = _ranks(xs), _ranks(ys)
    n = len(xs)
    mx, my = sum(rx) / n, sum(ry) / n
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry, strict=True))
    sx = sum((a - mx) ** 2 for a in rx) ** 0.5
    sy = sum((b - my) ** 2 for b in ry) ** 0.5
    return cov / (sx * sy) if sx and sy else 0.0


def prf(pred: set[str], gold: set[str]) -> tuple[float, float, float]:
    if not pred and not gold:
        return 1.0, 1.0, 1.0
    tp = len(pred & gold)
    p = tp / len(pred) if pred else 0.0
    r = tp / len(gold) if gold else 0.0
    return p, r, (2 * p * r / (p + r) if p + r else 0.0)


def main() -> int:
    from scouter.config import get_settings
    from scouter.extract.graph import extract_profile
    from scouter.extract.llm import AnthropicLLM
    from scouter.filters import region_label, region_of
    from scouter.models import JobProfile, RawJob
    from scouter.profile import load_seed
    from scouter.scoring import score

    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="re-extract with the configured model (costs money)")
    args = ap.parse_args()

    labels: dict[str, dict] = yaml.safe_load((HERE / "labels.yaml").read_text()) or {}
    if not labels:
        print("No labels yet: run evals/label.py first.")
        return 1
    profile = load_seed()
    llm = AnthropicLLM() if args.live else None
    totals: list[float] = []
    fits: list[float] = []
    precision: list[float] = []
    recall: list[float] = []
    for job_id, gold in labels.items():
        case = json.loads((HERE / "jobs" / f"{job_id}.json").read_text())
        raw = RawJob.model_validate(case["raw"])
        jp = (
            extract_profile(raw, llm, model=get_settings().model_default)[0]
            if llm
            else JobProfile.model_validate(case["profile"])
        )
        totals.append(score(jp, profile, region_label(region_of(raw.location))).total)
        fits.append(float(gold["fit"]))
        pred = {s for item in jp.must_have for s in item.skills}
        p, r, _ = prf(pred, set(gold.get("must", [])))
        precision.append(p)
        recall.append(r)

    rho = spearman(totals, fits)
    mean_p = sum(precision) / len(precision)
    mean_r = sum(recall) / len(recall)
    print(f"jobs: {len(labels)}  spearman rho: {rho:.3f}  must-have precision: {mean_p:.3f}  recall: {mean_r:.3f}")
    ok = rho >= RHO_GATE and mean_r >= RECALL_GATE
    print("PASS" if ok else f"FAIL: needs rho >= {RHO_GATE} and recall >= {RECALL_GATE}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
