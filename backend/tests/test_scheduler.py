import threading
import time
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import delete
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from scouter import repo
from scouter.db import RunRow
from scouter.scheduler import due_scan_time, run_once_if_due, should_catch_up

TZ = ZoneInfo("Asia/Jerusalem")


def at(h: int, m: int, day: int = 26) -> datetime:
    return datetime(2026, 10, day, h, m, tzinfo=TZ)


def test_due_time_before_and_after_seven() -> None:
    assert due_scan_time(at(6, 59), TZ, 7) == at(7, 0, 25)
    assert due_scan_time(at(7, 1), TZ, 7) == at(7, 0)


def test_should_catch_up() -> None:
    assert should_catch_up(None, at(9, 30), TZ, 7)
    assert should_catch_up(at(7, 0, 25), at(9, 30), TZ, 7)
    assert not should_catch_up(at(7, 2), at(9, 30), TZ, 7)


@pytest.fixture
def clean(engine: Engine) -> Iterator[Engine]:
    with engine.begin() as c:
        c.execute(delete(RunRow))
    yield engine
    with engine.begin() as c:
        c.execute(delete(RunRow))


@pytest.mark.db
def test_woke_at_0930_runs_exactly_once(clean: Engine) -> None:
    calls: list[datetime] = []

    def scan(s: Session, now: datetime) -> None:
        calls.append(now)
        repo.start_run(s, now)
        time.sleep(0.3)

    now = at(9, 30)
    with Session(clean) as s:
        repo.start_run(s, (now - timedelta(days=1)).astimezone(UTC))
    threads = [threading.Thread(target=run_once_if_due, args=(clean, now, scan)) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    run_once_if_due(clean, now + timedelta(minutes=10), scan)
    assert len(calls) == 1


@pytest.mark.db
def test_no_run_when_today_done(clean: Engine) -> None:
    calls: list[datetime] = []
    with Session(clean) as s:
        repo.start_run(s, at(7, 0))
    assert run_once_if_due(clean, at(12, 0), lambda s, now: calls.append(now)) is False
    assert calls == []


@pytest.mark.db
def test_failed_scan_still_releases_lock(clean: Engine) -> None:
    def boom(s: Session, now: datetime) -> None:
        raise RuntimeError("network down")

    assert run_once_if_due(clean, at(9, 0), boom) is False
    calls: list[datetime] = []
    assert run_once_if_due(clean, at(9, 10), lambda s, now: calls.append(now)) is True
