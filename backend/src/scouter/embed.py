"""Text embeddings. The real model lives behind this Protocol so tests and the extractor never load it."""

from typing import Any, Protocol, cast


class Embedder(Protocol):
    dim: int

    def encode(self, texts: list[str], kind: str = "passage") -> list[list[float]]: ...


class _SentenceModel(Protocol):
    def encode(self, sentences: list[str], *, normalize_embeddings: bool) -> Any: ...


class E5Embedder:
    """intfloat/multilingual-e5-small: Hebrew and English in one 384-dimension space. Loaded on first use."""

    dim = 384
    MODEL = "intfloat/multilingual-e5-small"

    def __init__(self) -> None:
        self._model: _SentenceModel | None = None

    def encode(self, texts: list[str], kind: str = "passage") -> list[list[float]]:
        if self._model is None:
            from sentence_transformers import SentenceTransformer  # optional "search" extra

            self._model = cast(_SentenceModel, SentenceTransformer(self.MODEL))
        vectors = self._model.encode([f"{kind}: {t}" for t in texts], normalize_embeddings=True)
        return [list(map(float, v)) for v in vectors]
