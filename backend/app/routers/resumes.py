from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import ai_rate_limit, get_current_user, get_llm, upload_rate_limit
from ..models import Resume, User
from ..schemas import ResumeOut, ResumeParsed
from ..services import prompts
from ..services.activity import record_activity
from ..services.llm import LLMError, LLMProvider, generate_json
from ..services.resume_service import ResumeError, extract_text

router = APIRouter(prefix="/api/resumes", tags=["resumes"])
MAX_RESUMES = 10


def _out(r: Resume) -> ResumeOut:
    out = ResumeOut.model_validate(r)
    out.text_preview = r.extracted_text[:600]
    return out


def _owned(db: Session, user: User, resume_id: int) -> Resume:
    r = db.get(Resume, resume_id)
    if not r or r.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resume not found.")
    return r


def _parse(llm: LLMProvider, user: User, r: Resume) -> None:
    try:
        parsed = generate_json(llm, prompts.resume_parse_messages(r.extracted_text, user.target_roles), ResumeParsed,
                               temperature=0.1)
        r.parsed, r.parse_error = parsed.model_dump(), None
    except LLMError as e:
        r.parsed, r.parse_error = None, str(e)


@router.get("", response_model=list[ResumeOut])
def list_resumes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Resume).where(Resume.user_id == user.id).order_by(Resume.created_at.desc()))
    return [_out(r) for r in rows]


@router.post("", response_model=ResumeOut, status_code=201, dependencies=[Depends(upload_rate_limit)])
def upload_resume(file: UploadFile = File(...), user: User = Depends(get_current_user),
                  db: Session = Depends(get_db), llm: LLMProvider = Depends(get_llm)):
    # Sync handler: FastAPI runs it in a worker thread, so the model call does not block the event loop.
    max_bytes = get_settings().max_upload_mb * 1024 * 1024
    data = file.file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(413,
                            f"File is larger than {get_settings().max_upload_mb} MB.")
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The file is empty.")
    if len(user.resumes) >= MAX_RESUMES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"You can keep up to {MAX_RESUMES} resumes. Delete one first.")
    filename = (file.filename or "resume").replace("/", "_").replace("\\", "_")[:200]
    try:
        text = extract_text(filename, data)
    except ResumeError as e:
        raise HTTPException(422, str(e)) from e

    r = Resume(user_id=user.id, filename=filename, size_bytes=len(data), extracted_text=text)
    _parse(llm, user, r)  # the raw file bytes are discarded after extraction
    db.add(r)
    db.commit()
    db.refresh(r)
    record_activity(db, user, "resume_uploaded", f"Uploaded resume {filename}")
    return _out(r)


@router.post("/{resume_id}/analyze", response_model=ResumeOut, dependencies=[Depends(ai_rate_limit)])
def reanalyze(resume_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db),
              llm: LLMProvider = Depends(get_llm)):
    r = _owned(db, user, resume_id)
    _parse(llm, user, r)
    db.commit()
    return _out(r)


@router.delete("/{resume_id}", status_code=204)
def delete_resume(resume_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_owned(db, user, resume_id))
    db.commit()
