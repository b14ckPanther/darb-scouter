import os
from pathlib import Path

import pytest

from scouter.collectors.freehire import parse_page
from scouter.config import get_settings
from scouter.extract.graph import extract_profile
from scouter.extract.llm import AnthropicLLM

pytestmark = pytest.mark.live


@pytest.mark.skipif(not os.environ.get("ANTHROPIC_API_KEY"), reason="needs ANTHROPIC_API_KEY")
def test_live_extraction_smoke() -> None:
    page = (Path(__file__).resolve().parents[1] / "fixtures" / "freehire_fullstack_p1.html").read_text()
    raw = parse_page(page, "fullstack")[0]
    jp, dropped = extract_profile(raw, AnthropicLLM(), model=get_settings().model_default)
    assert jp.must_have, dropped
    assert all(i.evidence.quote for i in jp.must_have)
