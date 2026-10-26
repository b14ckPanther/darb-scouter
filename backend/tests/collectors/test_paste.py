from pathlib import Path

import httpx
import respx

from scouter.collectors.paste import NeedsText, from_text, from_url
from scouter.http import polite_client

PUBLIC = lambda h: ["93.184.216.34"]  # noqa: E731
PAGE = (Path(__file__).resolve().parents[1] / "fixtures" / "careers_page.html").read_text()


@respx.mock(assert_all_called=False)
def test_linkedin_never_fetched(respx_mock: respx.MockRouter) -> None:
    route = respx_mock.get(url__regex=r".*linkedin\.com.*").mock(return_value=httpx.Response(200, text=PAGE))
    with polite_client(min_interval=0) as c:
        out = from_url(c, "https://www.linkedin.com/jobs/view/123")
    assert isinstance(out, NeedsText) and not route.called


@respx.mock
def test_careers_page_extracts_text() -> None:
    respx.get("https://acme.example/jobs/1").mock(return_value=httpx.Response(200, text=PAGE))
    with polite_client(min_interval=0) as c:
        job = from_url(c, "https://acme.example/jobs/1", resolve=PUBLIC)
    assert not isinstance(job, NeedsText)
    assert job.title == "Junior Backend Developer" and job.company == "Acme" and job.source == "paste"
    assert "PostgreSQL" in job.text and "var x" not in job.text and "Home About" not in job.text


@respx.mock
def test_blocked_page_asks_for_text() -> None:
    respx.get("https://acme.example/jobs/2").mock(return_value=httpx.Response(403))
    with polite_client(min_interval=0) as c:
        assert isinstance(from_url(c, "https://acme.example/jobs/2", resolve=PUBLIC), NeedsText)


@respx.mock
def test_thin_page_asks_for_text() -> None:
    respx.get("https://acme.example/jobs/3").mock(
        return_value=httpx.Response(200, text="<html><body>Loading…</body></html>")
    )
    with polite_client(min_interval=0) as c:
        assert isinstance(from_url(c, "https://acme.example/jobs/3", resolve=PUBLIC), NeedsText)


def test_hebrew_detected() -> None:
    job = from_text("https://x.example/1", "דרושה מפתחת ג'וניור עם ניסיון ב-React ו-Node.js בחיפה", "מפתחת", "Acme")
    assert job.language == "he"
    assert from_text("https://x.example/2", "Junior developer, React", "Dev", "Acme").language == "en"


import pytest  # noqa: E402

from scouter.collectors.paste import UnsafeUrl, check_url  # noqa: E402


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1:8000/api/profile",
        "http://localhost/",
        "http://10.0.0.5/",
        "http://192.168.1.1/",
        "http://100.100.100.100/",  # Tailscale
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/",
        "file:///etc/passwd",
        "http://example.com:5432/",
        "http://db:5432/",
    ],
)
def test_private_and_odd_urls_are_refused(url: str) -> None:
    with pytest.raises(UnsafeUrl):
        check_url(
            url, resolve=lambda host: ["10.0.0.9"] if host == "db" else ["127.0.0.1"] if host == "localhost" else [host]
        )


def test_public_url_allowed() -> None:
    check_url("https://careers.example.com/jobs/1", resolve=lambda h: ["93.184.216.34"])


@respx.mock
def test_redirect_to_private_address_is_refused() -> None:
    respx.get("https://acme.example/jobs/9").mock(
        return_value=httpx.Response(302, headers={"location": "http://127.0.0.1/api/profile"})
    )
    with polite_client(min_interval=0) as c:
        out = from_url(
            c, "https://acme.example/jobs/9", resolve=lambda h: ["93.184.216.34"] if "acme" in h else ["127.0.0.1"]
        )
    assert isinstance(out, NeedsText) and "private" in out.reason.lower()
