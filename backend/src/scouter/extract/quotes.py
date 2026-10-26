"""Verbatim-quote check: every extracted item must quote the post, or it is dropped (spec §4)."""

import re
import unicodedata

_MARKS = re.compile("[‎‏‪-‮⁦-⁩﻿]")
_SPACE = re.compile(r"\s+")


def normalize(s: str) -> str:
    s = _MARKS.sub("", unicodedata.normalize("NFC", s)).replace(" ", " ")
    return _SPACE.sub(" ", s).strip().casefold()


def verify(quote: str, text: str) -> bool:
    q = normalize(quote)
    return bool(q) and q in normalize(text)
