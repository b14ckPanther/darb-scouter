"""Telegram push: strong matches and a one-line morning summary. The bot token lives in env vars."""

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from scouter.config import get_settings
from scouter.models import Job, RunSummary

log = logging.getLogger(__name__)


def format_match(job: Job, app_url: str) -> str:
    return f"Match {job.score.total:,} / 10,000 · {job.title} at {job.company}, {job.city}\n{app_url.rstrip('/')}/job/{job.id}"


def format_summary(s: RunSummary) -> str:
    tz = ZoneInfo(get_settings().timezone)
    started = datetime.fromisoformat(s.started_at.replace("Z", "+00:00")).astimezone(tz)
    parts = [f"Scouter {started:%H:%M}"]
    if s.new_jobs:
        parts.append(f"{s.new_jobs} new job{'s' if s.new_jobs != 1 else ''}")
        if s.top_score is not None:
            parts.append(f"best {s.top_score:,}")
    else:
        parts.append("no new jobs")
    failed = [name for name, r in s.per_source.items() if r.failed]
    if failed:
        parts.append(f"{len(failed)} source{'s' if len(failed) != 1 else ''} failed: {', '.join(failed)}")
    if s.pending:
        parts.append(f"{s.pending} waiting to be read")
    return " · ".join(parts)


def send(text: str, token: str, chat_id: str) -> None:
    res = httpx.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        json={"chat_id": chat_id, "text": text, "disable_web_page_preview": True},
        timeout=15,
    )
    res.raise_for_status()


def telegram_alert(
    summary: RunSummary,
    matches: list[Job],
    *,
    token: str | None = None,
    chat_id: str | None = None,
    app_url: str | None = None,
) -> int:
    """Sends every match, then the summary. Returns how many messages failed; 0 when alerts are off."""
    s = get_settings()
    token, chat_id = token or s.telegram_bot_token, chat_id or s.telegram_chat_id
    if not token or not chat_id:
        return 0
    url = app_url or s.public_app_url
    failed = 0
    for text in [*(format_match(j, url) for j in matches), format_summary(summary)]:
        try:
            send(text, token, chat_id)
        except httpx.HTTPError as e:
            # never log the URL: it contains the bot token
            log.warning("telegram send failed: %s", type(e).__name__)
            failed += 1
    return failed
