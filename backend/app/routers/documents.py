from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import ai_rate_limit, get_current_user, get_llm, upload_rate_limit
from ..models import User
from ..models_research import Document
from ..services import jobs
from ..services.activity import record_activity
from ..services.documents import extract_document
from ..services.llm import LLMProvider
from ..services.resume_service import ResumeError
from ..services.retrieval import index_document, search_documents
from .jobs import JobOut

router = APIRouter(prefix="/api/documents", tags=["documents"])
MAX_DOCS = 50


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    size_bytes: int
    char_count: int
    embedded: bool
    embedding_model: str | None
    created_at: datetime
    chunk_count: int = 0


def _out(d: Document) -> DocumentOut:
    o = DocumentOut.model_validate(d)
    o.chunk_count = len(d.chunks)
    return o


@router.get("", response_model=list[DocumentOut])
def list_documents(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Document).where(Document.user_id == user.id).order_by(Document.created_at.desc()))
    return [_out(d) for d in rows]


@router.post("", status_code=201, dependencies=[Depends(upload_rate_limit)])
def upload_document(file: UploadFile = File(...), user: User = Depends(get_current_user),
                    db: Session = Depends(get_db), llm: LLMProvider = Depends(get_llm)):
    s = get_settings()
    max_bytes = s.max_document_mb * 1024 * 1024
    data = file.file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(413, f"File is larger than {s.max_document_mb} MB.")
    if not data:
        raise HTTPException(400, "The file is empty.")
    if db.query(Document).filter(Document.user_id == user.id).count() >= MAX_DOCS:
        raise HTTPException(400, f"You can store up to {MAX_DOCS} documents. Delete one first.")
    filename = (file.filename or "document").replace("/", "_").replace("\\", "_")[:200]
    try:
        text = extract_document(filename, data)
    except ResumeError as e:
        raise HTTPException(422, str(e)) from e
    doc = Document(user_id=user.id, filename=filename, size_bytes=len(data), char_count=len(text))
    db.add(doc)
    db.commit()
    db.refresh(doc)

    def run(d: Session, ctx):
        ctx.progress(20, "Splitting and embedding the document")
        target = d.get(Document, doc.id)
        index_document(d, llm, target, text)
        d.commit()

    job = jobs.submit(db, user.id, "document_index", run, ref_type="document", ref_id=doc.id)
    record_activity(db, user, "document_uploaded", f"Added {filename} to your library", "/research/library")
    db.refresh(doc)
    return {"document": _out(doc), "job": JobOut.model_validate(job)}


@router.delete("/{doc_id}", status_code=204)
def delete_document(doc_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    d = db.get(Document, doc_id)
    if not d or d.user_id != user.id:
        raise HTTPException(404, "Document not found.")
    db.delete(d)
    db.commit()


@router.get("/search", dependencies=[Depends(ai_rate_limit)])
def search(q: str = Query(min_length=2, max_length=300), ids: str | None = None,
           user: User = Depends(get_current_user), db: Session = Depends(get_db), llm: LLMProvider = Depends(get_llm)):
    doc_ids = None
    if ids:
        try:
            doc_ids = [int(x) for x in ids.split(",") if x.strip()]
        except ValueError as e:
            raise HTTPException(422, "ids must be comma-separated numbers.") from e
    passages, mode = search_documents(db, llm, user.id, q, doc_ids, top_k=8)
    return {"mode": mode, "results": [{"text": p.text, "score": round(p.score, 4), **p.meta} for p in passages]}
