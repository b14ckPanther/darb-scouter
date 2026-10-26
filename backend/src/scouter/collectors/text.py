import html as htmllib
import re

from selectolax.lexbor import LexborHTMLParser as HTMLParser

_BLOCK = re.compile(r"\n\s*\n+")


def html_to_text(markup: str) -> str:
    """Readable text from an HTML fragment: one line per block or list item."""
    tree = HTMLParser(htmllib.unescape(markup) if "&lt;" in markup else markup)
    for tag in ("script", "style"):
        for n in tree.css(tag):
            n.decompose()
    for n in tree.css("li, p, h1, h2, h3, h4, br, div, tr"):
        n.insert_after("\n")
    node = tree.body or tree.root
    text = node.text(separator="") if node else ""
    lines = [re.sub(r"[ \t ]+", " ", x).strip() for x in text.splitlines()]
    return _BLOCK.sub("\n", "\n".join(x for x in lines if x)).strip()
