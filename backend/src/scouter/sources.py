"""The collectors a real scan runs, built from the boards stored in Postgres (seeded from boards.yaml)."""

import logging
from datetime import datetime

import httpx
from sqlalchemy.orm import Session

from scouter import repo
from scouter.collectors.ats import ATSCollector
from scouter.collectors.base import Collector
from scouter.collectors.freehire import FreeHireCollector
from scouter.discovery import discover, resolve_comeet, seed_boards, seed_comeet_pages
from scouter.tuning import TUNING

log = logging.getLogger(__name__)
DISCOVER_PER_RUN: int = TUNING["discovery"]["boards_per_run"]


def ensure_seed_boards(session: Session) -> None:
    for b in seed_boards():
        repo.add_board(session, b)


def resolve_comeet_seeds(session: Session, client: httpx.Client, limit: int = DISCOVER_PER_RUN) -> int:
    """Read the public Comeet token from a few seeded careers pages per run."""
    known = {b.company.lower() for b in repo.list_boards(session) if b.provider == "comeet"}
    added = 0
    for page, company in seed_comeet_pages():
        if added >= limit:
            break
        if company.lower() in known:
            continue
        try:
            board = resolve_comeet(client, page, company)
        except httpx.HTTPError as e:
            log.info("comeet page %s: %s", page, e)
            continue
        if board and repo.add_board(session, board):
            added += 1
        known.add(company.lower())
    return added


def discover_new_boards(
    session: Session, client: httpx.Client, companies: list[str], limit: int = DISCOVER_PER_RUN
) -> int:
    """Probe public boards for companies seen on FreeHire that have none yet (spec §11b)."""
    known = {b.company.lower() for b in repo.list_boards(session)}
    added = 0
    for company in dict.fromkeys(companies):
        if added >= limit:
            break
        if company.lower() in known:
            continue
        for board in discover(client, company):
            added += repo.add_board(session, board)
        known.add(company.lower())
    return added


def default_collectors(session: Session) -> list[Collector]:
    ensure_seed_boards(session)
    return [FreeHireCollector(), ATSCollector(repo.list_boards(session))]


def record_board_results(session: Session, collectors: list[Collector], now: datetime) -> None:
    """Keep each board's failure count, so a board that keeps failing can be found and fixed."""
    for c in collectors:
        if isinstance(c, ATSCollector):
            boards = {f"{b.provider}:{b.token.split(':')[0]}": b for b in c.boards}
            for key, ok in c.results.items():
                if key in boards:
                    repo.board_result(session, boards[key], ok, now)
