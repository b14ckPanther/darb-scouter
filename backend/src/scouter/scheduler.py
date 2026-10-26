"""The 07:00 scan on Nour's Mac, with catch-up when the Mac wakes after missing it.

APScheduler can't see the Mac sleep, so a 10-minute tick asks "has today's scan run?" and runs it
when it hasn't. A Postgres advisory lock plus a re-check inside the lock make it run exactly once.
"""

import logging
from collections.abc import Callable
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from scouter import repo
from scouter.config import get_settings

log = logging.getLogger(__name__)
LOCK_ID = 7007
Scan = Callable[[Session, datetime], object]


def due_scan_time(now: datetime, tz: ZoneInfo, hour: int) -> datetime:
    """The most recent scheduled scan time at or before `now`."""
    local = now.astimezone(tz)
    today = datetime.combine(local.date(), time(hour), tz)
    return today if local >= today else today - timedelta(days=1)


def should_catch_up(last_started: datetime | None, now: datetime, tz: ZoneInfo, hour: int) -> bool:
    return last_started is None or last_started < due_scan_time(now, tz, hour)


def run_once_if_due(engine: Engine, now: datetime, scan: Scan) -> bool:
    """Runs `scan` when the latest scheduled scan hasn't happened. True when this call ran it."""
    s = get_settings()
    tz = ZoneInfo(s.timezone)
    with engine.connect() as lock_conn:
        if not lock_conn.execute(text("select pg_try_advisory_lock(:id)"), {"id": LOCK_ID}).scalar():
            return False
        try:
            with Session(engine) as session:
                if not should_catch_up(repo.last_run_started(session), now, tz, s.scan_hour):
                    return False
                log.info("scan due (scheduled %s), starting", due_scan_time(now, tz, s.scan_hour))
                scan(session, now)
                return True
        except Exception:
            log.exception("scheduled scan failed")
            return False
        finally:
            lock_conn.execute(text("select pg_advisory_unlock(:id)"), {"id": LOCK_ID})
            lock_conn.commit()


def daily_scan(session: Session, now: datetime) -> None:
    from scouter.alerts import telegram_alert
    from scouter.api import default_deps
    from scouter.collectors.freehire import FreeHireCollector
    from scouter.http import polite_client
    from scouter.pipeline import run_scan
    from scouter.sources import default_collectors, discover_new_boards, record_board_results, resolve_comeet_seeds

    deps = default_deps()
    if deps.llm is None:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    with polite_client() as client:
        resolve_comeet_seeds(session, client)
        collectors = default_collectors(session)
        summary = run_scan(session, collectors, deps.llm, deps.indexer, now, alert=telegram_alert, client=client)
        record_board_results(session, collectors, now)
        seen = [j.company for c in collectors if isinstance(c, FreeHireCollector) for j in c.last]
        discover_new_boards(session, client, seen)
    log.info("scan finished: %s", summary.model_dump_json(by_alias=True))


def main() -> None:
    from apscheduler.schedulers.blocking import BlockingScheduler

    from scouter.db import make_engine
    from scouter.logs import configure_logging

    configure_logging()
    s = get_settings()
    tz = ZoneInfo(s.timezone)
    engine = make_engine()

    def tick() -> None:
        run_once_if_due(engine, datetime.now(tz), daily_scan)

    sched = BlockingScheduler(timezone=tz)
    sched.add_job(tick, "cron", hour=s.scan_hour, minute=0, misfire_grace_time=None, coalesce=True, id="daily")
    sched.add_job(tick, "interval", minutes=10, id="wake-check")
    tick()
    sched.start()


if __name__ == "__main__":
    main()
