"""Paste-a-link: any careers page Nour pastes. LinkedIn is never fetched; its text is pasted instead."""

import hashlib
import ipaddress
import re
import socket
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urljoin, urlparse

import httpx
from selectolax.lexbor import LexborHTMLParser

from scouter.collectors.text import html_to_text
from scouter.models import RawJob
from scouter.tuning import TUNING

MIN_TEXT: int = TUNING["paste"]["min_text_chars"]
MAX_BYTES = 2_000_000
MAX_REDIRECTS = 5
ALLOWED = {("http", 80), ("https", 443)}
Resolver = Callable[[str], list[str]]


class UnsafeUrl(ValueError):
    """A pasted link that points somewhere the scouter must never fetch (this Mac, the LAN, the tailnet)."""


def _resolve(host: str) -> list[str]:
    return list({str(info[4][0]) for info in socket.getaddrinfo(host, None)})


def check_url(url: str, resolve: Resolver = _resolve) -> None:
    """Refuse anything but plain http(s) on standard ports to public addresses."""
    u = urlparse(url)
    port = u.port or {"http": 80, "https": 443}.get(u.scheme, -1)
    if (u.scheme, port) not in ALLOWED or not u.hostname:
        raise UnsafeUrl(f"only http and https links on standard ports can be scanned: {url}")
    try:
        addrs = resolve(u.hostname)
    except OSError as e:
        raise UnsafeUrl(f"couldn't resolve {u.hostname}") from e
    for a in addrs:
        if not ipaddress.ip_address(a.split("%")[0]).is_global:
            raise UnsafeUrl(f"{u.hostname} points to a private address")


_HEBREW = re.compile(r"[֐-׿]")
_LETTER = re.compile(r"[^\W\d_]")


@dataclass(frozen=True)
class NeedsText:
    reason: str


def language_of(text: str) -> Literal["en", "he"]:
    letters = len(_LETTER.findall(text))
    return "he" if letters and len(_HEBREW.findall(text)) / letters >= 0.3 else "en"


def from_text(url: str, text: str, title: str, company: str) -> RawJob:
    return RawJob(
        source="paste",
        source_id=hashlib.sha1(url.encode()).hexdigest()[:12],
        url=url,
        title=title.strip(),
        company=company.strip(),
        text=text.strip(),
        language=language_of(text),
    )


def _meta(tree: LexborHTMLParser, prop: str) -> str | None:
    node = tree.css_first(f'meta[property="{prop}"]')
    value = node.attributes.get("content") if node else None
    return value.strip() if value else None


def _main_text(tree: LexborHTMLParser) -> str:
    for tag in ("script", "style", "nav", "header", "footer", "noscript", "form"):
        for n in tree.css(tag):
            n.decompose()
    candidates = tree.css("main, article, [role=main], section, div") or []
    best = max(candidates, key=lambda n: len(n.text(strip=True)), default=None) or tree.body
    return html_to_text(best.html or "") if best else ""


def _fetch(client: httpx.Client, url: str, resolve: Resolver) -> httpx.Response:
    """GET with redirects followed by hand, so every hop is checked before it is fetched."""
    for _ in range(MAX_REDIRECTS + 1):
        check_url(url, resolve)
        with client.stream("GET", url, follow_redirects=False) as res:
            if res.is_redirect and "location" in res.headers:
                url = urljoin(url, res.headers["location"])
                continue
            body = b""
            for chunk in res.iter_bytes():
                body += chunk
                if len(body) > MAX_BYTES:
                    break
            return httpx.Response(res.status_code, headers=res.headers, content=body[:MAX_BYTES], request=res.request)
    raise UnsafeUrl("too many redirects")


def from_url(client: httpx.Client, url: str, resolve: Resolver = _resolve) -> RawJob | NeedsText:
    host = urlparse(url).hostname or ""
    if host == "linkedin.com" or host.endswith(".linkedin.com"):
        return NeedsText("LinkedIn pages are never fetched. Paste the job text instead.")
    try:
        res = _fetch(client, url, resolve)
    except UnsafeUrl as e:
        return NeedsText(f"That link can't be scanned ({e}). Paste the job text instead.")
    except httpx.HTTPError as e:
        return NeedsText(f"Couldn't reach the page ({e.__class__.__name__}). Paste the job text instead.")
    if res.status_code >= 400:
        return NeedsText(f"The page answered {res.status_code}. Paste the job text instead.")
    tree = LexborHTMLParser(res.text)
    title = _meta(tree, "og:title")
    for tag in ("h1", "title"):
        node = tree.css_first(tag)
        if not title and node:
            title = node.text(strip=True)
    company = _meta(tree, "og:site_name") or host.removeprefix("www.").split(".")[0].title()
    text = _main_text(tree)
    if len(text) < MIN_TEXT or not title:
        return NeedsText("The page has too little text to read (it may need JavaScript). Paste the job text instead.")
    return from_text(url, text, title, company)
