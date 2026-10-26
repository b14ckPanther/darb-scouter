from scouter.extract.quotes import normalize, verify


def test_quote_survives_bidi_and_nbsp() -> None:
    assert verify("ניסיון ב-React", "דרישות:‏ ניסיון ב-React\n")


def test_quote_survives_line_breaks_and_case() -> None:
    assert verify("experience with node.js and sql", "Experience with\nNode.js   and SQL.")


def test_missing_quote_fails() -> None:
    assert not verify("5+ years of Kubernetes", "1 year of Docker")
    assert not verify("", "anything")


def test_normalize_strips_marks() -> None:
    assert normalize("‫שלום‬  עולם") == "שלום עולם"
