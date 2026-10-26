import httpx
import pytest
import respx

from scouter.alerts import format_match, format_summary, telegram_alert
from scouter.models import Job, RunSummary, Score, SourceResult

API = "https://api.telegram.org/botT0KEN/sendMessage"


def job() -> Job:
    return Job(
        id="junior-backend-wix-1",
        title="Junior Backend Developer",
        company="Wix",
        city="Tel Aviv",
        work_mode="hybrid",
        url="https://x",
        posted_at="",
        found_at="",
        seniority="junior",
        score=Score(total=9320, lines=[]),
    )


def summary() -> RunSummary:
    return RunSummary(
        started_at="2026-10-26T05:00:00.000Z",
        new_jobs=14,
        top_score=8742,
        per_source={"freehire": SourceResult(found=40), "comeet": SourceResult(failed=True, error="boom")},
    )


def test_summary_line() -> None:
    assert format_summary(summary()) == "Scouter 07:00 · 14 new jobs · best 8,742 · 1 source failed: comeet"
    quiet = RunSummary(started_at="2026-10-26T05:00:00.000Z")
    assert format_summary(quiet) == "Scouter 07:00 · no new jobs"


def test_match_message_has_link() -> None:
    msg = format_match(job(), "https://mac.tail.ts.net")
    assert msg.startswith("Match 9,320 / 10,000 · Junior Backend Developer at Wix, Tel Aviv")
    assert msg.endswith("https://mac.tail.ts.net/job/junior-backend-wix-1")


@respx.mock
def test_sends_matches_then_summary(monkeypatch: pytest.MonkeyPatch) -> None:
    route = respx.post(API).mock(return_value=httpx.Response(200, json={"ok": True}))
    assert telegram_alert(summary(), [job()], token="T0KEN", chat_id="42", app_url="https://a") == 0
    assert route.call_count == 2 and b"9,320" in route.calls[0].request.content


@respx.mock
def test_telegram_down_counts_failure() -> None:
    respx.post(API).mock(return_value=httpx.Response(502))
    assert telegram_alert(summary(), [job()], token="T0KEN", chat_id="42", app_url="https://a") == 2


def test_alerts_disabled_without_token() -> None:
    assert telegram_alert(summary(), [job()], token=None, chat_id="42", app_url="https://a") == 0


def test_messages_carry_no_emoji() -> None:
    import re

    emoji = re.compile("[\U0001f300-\U0001faff☀-➿⭐⭕]")
    assert not emoji.search(format_match(job(), "https://a")) and not emoji.search(format_summary(summary()))
