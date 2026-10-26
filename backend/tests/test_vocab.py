import json
from pathlib import Path

import pytest

from scouter.vocab import canonical, is_any_of, label, skills_in

FIXTURES = Path(__file__).resolve().parents[2] / "frontend/src/data/fixtures/jobs.json"


@pytest.mark.parametrize("phrase", ["Node", "NodeJS", "Node.js", "node.js"])
def test_node_variants_normalize(phrase: str) -> None:
    assert canonical(phrase) == "nodejs"


def test_react_not_react_native() -> None:
    assert skills_in("React Native apps") == ["react-native"]
    assert skills_in("React and Redux") == ["react"]


def test_javascript_not_java() -> None:
    assert skills_in("JavaScript") == ["javascript"]


def test_or_list() -> None:
    assert is_any_of("Python or Go") is True
    assert is_any_of("Python, Go and SQL") is False


def test_label() -> None:
    assert label("nodejs") == "Node.js"


def test_fixture_parity() -> None:
    for job in json.loads(FIXTURES.read_text()):
        for line in job["score"]["lines"]:
            if line.get("skill"):
                assert line["skill"] in skills_in(line["evidence"]["quote"]), line
