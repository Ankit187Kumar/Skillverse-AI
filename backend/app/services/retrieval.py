"""Document library indexing and passage retrieval.

Vector store: embeddings are stored as float32 blobs next to each chunk and ranked with cosine
similarity in NumPy. That keeps the MVP dependency-free and is fast for personal libraries
(tens of thousands of chunks). For larger deployments, the same interface can be backed by
pgvector, Qdrant or Chroma. If the embedding model is unavailable, a BM25 keyword ranker is used.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass

import numpy as np
from sqlalchemy.orm import Session

from ..models_research import Document, DocumentChunk
from .llm import LLMError, LLMProvider
from .web import chunk_text

_TOKEN = re.compile(r"[A-Za-z0-9À-ɏऀ-ॿ]+")
STOP = set("the a an and or of to in for on with is are was were be by as at it this that from how what why which "
           "who when does do can should into about vs versus".split())


def to_blob(vec: list[float]) -> bytes:
    return np.asarray(vec, dtype=np.float32).tobytes()


def from_blob(b: bytes) -> np.ndarray:
    return np.frombuffer(b, dtype=np.float32)


def tokens(text: str) -> list[str]:
    return [t.lower() for t in _TOKEN.findall(text) if t.lower() not in STOP and len(t) > 1]


@dataclass
class Passage:
    text: str
    score: float
    source_key: str  # e.g. "doc:12" or "web:https://..."
    meta: dict


def cosine_rank(query_vec: np.ndarray, vecs: np.ndarray) -> np.ndarray:
    q = query_vec / (np.linalg.norm(query_vec) + 1e-9)
    m = vecs / (np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-9)
    return m @ q


def bm25_rank(query: str, docs: list[str], k1: float = 1.5, b: float = 0.75) -> list[float]:
    q = tokens(query)
    toks = [tokens(d) for d in docs]
    n = len(docs)
    if not n or not q:
        return [0.0] * n
    avg = sum(len(t) for t in toks) / n or 1
    df = Counter(w for t in toks for w in set(t))
    scores = []
    for t in toks:
        tf = Counter(t)
        s = 0.0
        for w in q:
            if w not in tf:
                continue
            idf = math.log(1 + (n - df[w] + 0.5) / (df[w] + 0.5))
            s += idf * tf[w] * (k1 + 1) / (tf[w] + k1 * (1 - b + b * len(t) / avg))
        scores.append(s)
    return scores


def rank_passages(llm: LLMProvider, query: str, candidates: list[Passage],
                  precomputed: dict[int, np.ndarray] | None = None, top_k: int = 4) -> tuple[list[Passage], str]:
    """Rank candidate passages for a query. Returns (top passages, mode) where mode is 'semantic' or 'keyword'."""
    if not candidates:
        return [], "none"
    try:
        need = [i for i in range(len(candidates)) if not precomputed or i not in precomputed]
        vecs: dict[int, np.ndarray] = dict(precomputed or {})
        batch = [query] + [candidates[i].text for i in need]
        embedded = []
        for start in range(0, len(batch), 64):
            embedded.extend(llm.embed(batch[start:start + 64]))
        qv = np.asarray(embedded[0], dtype=np.float32)
        for i, v in zip(need, embedded[1:]):
            vecs[i] = np.asarray(v, dtype=np.float32)
        vecs = {i: np.asarray(v, dtype=np.float32) for i, v in vecs.items()}
        if any(vecs[i].shape != qv.shape for i in vecs):
            raise LLMError("Embedding dimensions changed; re-index documents.")
        sims = cosine_rank(qv, np.stack([vecs[i] for i in range(len(candidates))]))
        mode = "semantic"
        scores = sims.tolist()
    except LLMError:
        scores = bm25_rank(query, [c.text for c in candidates])
        mode = "keyword"
    for c, s in zip(candidates, scores):
        c.score = float(s)
    ranked = sorted(candidates, key=lambda c: c.score, reverse=True)
    if mode == "keyword":
        ranked = [c for c in ranked if c.score > 0] or ranked[:1]
    return ranked[:top_k], mode


def index_document(db: Session, llm: LLMProvider, doc: Document, text: str) -> None:
    """Chunk and embed a document. Embedding failures leave chunks keyword-searchable."""
    chunks = chunk_text(text)
    rows = [DocumentChunk(document_id=doc.id, user_id=doc.user_id, idx=i, text=c) for i, c in enumerate(chunks)]
    try:
        for start in range(0, len(rows), 64):
            vecs = llm.embed([r.text for r in rows[start:start + 64]])
            for r, v in zip(rows[start:start + 64], vecs):
                r.embedding = to_blob(v)
        doc.embedded = True
        doc.embedding_model = getattr(llm, "embedding_model", None)
    except LLMError:
        for r in rows:
            r.embedding = None
        doc.embedded = False
    db.add_all(rows)


def document_candidates(db: Session, user_id: int, document_ids: list[int] | None) -> tuple[list[Passage], dict[int, np.ndarray]]:
    q = db.query(DocumentChunk, Document).join(Document, DocumentChunk.document_id == Document.id).filter(
        DocumentChunk.user_id == user_id)
    if document_ids is not None:
        q = q.filter(DocumentChunk.document_id.in_(document_ids or [-1]))
    passages, pre = [], {}
    for chunk, doc in q.all():
        if chunk.embedding is not None:
            pre[len(passages)] = from_blob(chunk.embedding)
        passages.append(Passage(chunk.text, 0.0, f"doc:{doc.id}", {"title": doc.filename, "document_id": doc.id,
                                                                    "chunk": chunk.idx}))
    return passages, pre


def search_documents(db: Session, llm: LLMProvider, user_id: int, query: str, document_ids: list[int] | None = None,
                     top_k: int = 6) -> tuple[list[Passage], str]:
    cands, pre = document_candidates(db, user_id, document_ids)
    # Only reuse stored vectors when every chunk has one; otherwise mixed indexes would be inconsistent.
    use_pre = pre if len(pre) == len(cands) else None
    if use_pre is None and pre:
        return rank_passages(_KeywordOnly(), query, cands, None, top_k)
    return rank_passages(llm, query, cands, use_pre, top_k)


class _KeywordOnly:
    def embed(self, texts):
        raise LLMError("keyword only")
