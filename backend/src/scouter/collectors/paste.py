"""Paste-a-link: any careers page Nour pastes. LinkedIn is never fetched; its text is pasted instead."""

import hashlib
import re
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlparse

import httpx
from selectolax.lexbor import LexborHTMLParser

from scouter.collectors.text import html_to_text
from scouter.models import RawJob

MIN_TEXT = 400
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


def from_url(client: httpx.Client, url: str) -> RawJob | NeedsText:
    host = urlparse(url).hostname or ""
    if host == "linkedin.com" or host.endswith(".linkedin.com"):
        return NeedsText("LinkedIn pages are never fetched. Paste the job text instead.")
    try:
        res = client.get(url)
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
