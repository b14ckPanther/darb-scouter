import logging
import re
from pathlib import Path

import httpx
import pytest
import respx
import yaml

from scouter.alerts import telegram_alert
from scouter.logs import configure_logging
from scouter.models import RunSummary

ROOT = Path(__file__).resolve().parents[2]
TOKEN = "123456789:AAH-secret-token-value-abcdefghijklmn"


@respx.mock
def test_bot_token_never_logged(caplog: pytest.LogCaptureFixture) -> None:
    configure_logging()
    caplog.set_level(logging.INFO)
    respx.post(url__startswith="https://api.telegram.org/").mock(return_value=httpx.Response(200, json={"ok": True}))
    telegram_alert(RunSummary(started_at="2026-10-26T05:00:00.000Z"), [], token=TOKEN, chat_id="1", app_url="https://a")
    assert TOKEN not in caplog.text


def test_compose_publishes_ports_on_localhost_only() -> None:
    compose = yaml.safe_load((ROOT / "docker-compose.yml").read_text())
    for name, svc in compose["services"].items():
        for port in svc.get("ports", []):
            assert re.match(r"^127\.0\.0\.1:", str(port)), f"{name} publishes {port} on every interface"
