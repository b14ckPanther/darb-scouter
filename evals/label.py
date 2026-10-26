"""Walk Nour through each eval job: a 0-10 fit and the must-haves Nour sees. Resumable.

uv run --project backend python evals/label.py
"""

import json
from pathlib import Path

import yaml

HERE = Path(__file__).parent


def main() -> None:
    from scouter.vocab import canonical

    path = HERE / "labels.yaml"
    labels: dict[str, dict] = yaml.safe_load(path.read_text()) if path.exists() else {}
    labels = labels or {}
    todo = [p for p in sorted((HERE / "jobs").glob("*.json")) if p.stem not in labels]
    print(f"{len(labels)} labelled, {len(todo)} to go. Ctrl+C stops; progress is saved after each job.\n")
    for i, p in enumerate(todo, 1):
        raw = json.loads(p.read_text())["raw"]
        print("=" * 80, f"\n[{i}/{len(todo)}] {raw['title']} at {raw['company']} ({raw.get('location') or '?'})\n")
        print(raw["text"][:4000], "\n")
        while True:
            fit = input("How well do you fit, 0-10? ").strip()
            if fit.isdigit() and 0 <= int(fit) <= 10:
                break
        must_raw = input("Must-haves you see (comma separated, e.g. react, node, sql): ")
        must, unknown = [], []
        for phrase in filter(None, (m.strip() for m in must_raw.split(","))):
            (must if (k := canonical(phrase)) else unknown).append(k or phrase)
        if unknown:
            print(f"  not in the vocabulary, skipped: {', '.join(unknown)}")
        labels[p.stem] = {"fit": int(fit), "must": sorted(set(must))}
        path.write_text(yaml.safe_dump(labels, sort_keys=True, allow_unicode=True))
    print("\nDone. Run evals/run.py next.")


if __name__ == "__main__":
    main()
