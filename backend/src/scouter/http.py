"""One polite HTTP client for every collector: identifies itself and spaces out requests per host."""

import threading
import time

import httpx

USER_AGENT = "darb-scouter/0.1 (personal job scout; github.com/b14ckPanther)"


class PoliteTransport(httpx.BaseTransport):
    def __init__(self, min_interval: float) -> None:
        self._inner = httpx.HTTPTransport(retries=1)
        self._min = min_interval
        self._last: dict[str, float] = {}
        self._lock = threading.Lock()

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        host = request.url.host
        with self._lock:
            wait = self._last.get(host, 0) + self._min - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self._last[host] = time.monotonic()
        return self._inner.handle_request(request)

    def close(self) -> None:
        self._inner.close()


def polite_client(min_interval: float = 1.0) -> httpx.Client:
    return httpx.Client(
        transport=PoliteTransport(min_interval),
        headers={"User-Agent": USER_AGENT},
        timeout=20,
        follow_redirects=True,
    )
