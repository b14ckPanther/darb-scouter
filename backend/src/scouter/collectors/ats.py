"""Polls every known public ATS board. One dead board never stops the rest."""

import logging
from collections.abc import Callable

import httpx

from scouter.collectors import comeet, greenhouse, lever
from scouter.collectors.base import CollectorError
from scouter.models import Board, RawJob

log = logging.getLogger(__name__)
FETCH: dict[str, Callable[[httpx.Client, str, str], list[RawJob]]] = {
    "greenhouse": greenhouse.fetch,
    "lever": lever.fetch,
    "comeet": comeet.fetch,
}


class ATSCollector:
    name = "ats"

    def __init__(self, boards: list[Board]) -> None:
        self.boards = boards
        self.results: dict[str, bool] = {}

    def collect(self, client: httpx.Client) -> list[RawJob]:
        out: list[RawJob] = []
        errors: list[str] = []
        for b in self.boards:
            key = f"{b.provider}:{b.token.split(':')[0]}"
            try:
                out += FETCH[b.provider](client, b.token, b.company)
                self.results[key] = True
            except (httpx.HTTPError, ValueError, KeyError) as e:
                log.warning("board %s failed: %s", key, e)
                self.results[key] = False
                errors.append(f"{key}: {e}")
        if self.boards and not any(self.results.values()):
            raise CollectorError(f"all {len(self.boards)} ATS boards failed; first: {errors[0]}")
        return out
