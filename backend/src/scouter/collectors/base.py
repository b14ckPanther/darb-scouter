from typing import Protocol

import httpx

from scouter.models import RawJob


class CollectorError(Exception):
    """A collector that could not do its job. Recorded in the run and shown in the UI, never swallowed."""


class Collector(Protocol):
    name: str

    def collect(self, client: httpx.Client) -> list[RawJob]: ...
