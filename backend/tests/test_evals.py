import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def load(name: str):  # type: ignore[no-untyped-def]
    spec = importlib.util.spec_from_file_location(name, ROOT / "evals" / f"{name}.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def test_spearman_known_values() -> None:
    run = load("run")
    assert run.spearman([1, 2, 3, 4], [10, 20, 30, 40]) == pytest.approx(1.0)
    assert run.spearman([1, 2, 3, 4], [4, 3, 2, 1]) == pytest.approx(-1.0)
    # ties take the average rank
    assert run.spearman([1, 1, 2], [1, 1, 2]) == pytest.approx(1.0)


def test_prf_empty_sets() -> None:
    run = load("run")
    assert run.prf(set(), set()) == (1.0, 1.0, 1.0)
    assert run.prf({"a", "b"}, {"a"}) == pytest.approx((0.5, 1.0, 2 / 3))


def test_pick_spreads_across_deciles() -> None:
    pick = load("pick")
    scored = [(f"j{i}", i * 100, "freehire", "en") for i in range(100)]
    chosen = pick.spread(scored, n=10)
    assert len(chosen) == 10 and len({s // 1000 for _, s, _, _ in chosen}) == 10
