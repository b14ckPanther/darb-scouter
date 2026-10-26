"""Text embeddings. The real model lives behind this Protocol so tests and the extractor never load it."""

from typing import Protocol


class Embedder(Protocol):
    dim: int

    def encode(self, texts: list[str], kind: str = "passage") -> list[list[float]]: ...
