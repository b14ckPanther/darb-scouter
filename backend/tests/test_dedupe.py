from scouter.dedupe import canonical_url, dedupe, norm_title
from scouter.models import RawJob, Requirement

TEXT = "We build payment APIs. Requirements: Python or Go, SQL, Docker. Nice: AWS. Hybrid in Tel Aviv."


def job(
    url: str, title: str, company: str = "Acme", source: str = "freehire", text: str = TEXT, reqs: int = 0
) -> RawJob:
    return RawJob(
        source=source,
        source_id=url,
        url=url,
        title=title,
        company=company,
        text=text,
        requirements=[Requirement(text=f"req {i}", priority="required") for i in range(reqs)],
    )


def test_same_url_with_utm_is_one() -> None:
    a = job("https://acme.example/jobs/1?utm_source=freehire.me", "Dev")
    b = job("https://acme.example/jobs/1", "Dev")
    assert len(dedupe([a, b])) == 1
    assert canonical_url("https://x.example/j?id=4&utm_medium=a&utm_source=b") == "https://x.example/j?id=4"


def test_freehire_and_greenhouse_same_job_merge() -> None:
    fh = job("https://freehire.example/1", "Junior Full Stack Developer", reqs=3)
    gh = job("https://boards.greenhouse.io/acme/jobs/9", "Full Stack Developer (Junior)", source="greenhouse")
    out = dedupe([fh, gh])
    assert len(out) == 1 and out[0].source == "greenhouse" and len(out[0].requirements) == 3


def test_same_title_different_company_kept() -> None:
    assert (
        len(
            dedupe(
                [
                    job("https://a.example/1", "Backend Developer"),
                    job("https://b.example/1", "Backend Developer", company="Wix"),
                ]
            )
        )
        == 2
    )


def test_same_company_different_roles_kept() -> None:
    a = job("https://a.example/1", "Backend Developer")
    b = job("https://a.example/2", "QA Automation Engineer", text="Selenium, Playwright, test plans for mobile apps.")
    assert len(dedupe([a, b])) == 2


def test_norm_title_drops_seniority() -> None:
    assert norm_title("Junior Full-Stack Developer (Hybrid)") == norm_title("Full Stack Developer")
