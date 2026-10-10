from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import ai_rate_limit, get_current_user, get_llm
from ..models import Interview, User
from ..schemas import AnswerIn, AnswerResult, EndIn, InterviewConfig, InterviewOut, InterviewSummary, ReportData, ReportOut
from ..services import interview_service as svc
from ..services.llm import LLMProvider
from ..services.prompts import CRITERIA, WEIGHTS

router = APIRouter(prefix="/api/interviews", tags=["interviews"])


def _owned(db: Session, user: User, interview_id: int) -> Interview:
    iv = db.get(Interview, interview_id)
    if not iv or iv.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Interview not found.")
    return iv


def _report_out(iv: Interview) -> ReportOut:
    r = iv.report
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No report yet. End the interview to generate one.")
    return ReportOut(
        interview_id=iv.id, status=r.status, overall_score=r.overall_score,
        data=ReportData.model_validate(r.data) if r.data else None, error=r.error, model_name=r.model_name,
        created_at=r.created_at, criteria=CRITERIA, weights=WEIGHTS,
    )


@router.get("", response_model=list[InterviewSummary])
def list_interviews(limit: int = Query(50, ge=1, le=200), user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Interview).where(Interview.user_id == user.id).options(selectinload(Interview.report))
        .order_by(Interview.started_at.desc()).limit(limit)
    )
    return [InterviewSummary(id=i.id, role=i.config["role"], interview_type=i.config["interview_type"],
                             difficulty=i.config["difficulty"], status=i.status, started_at=i.started_at,
                             overall_score=i.report.overall_score if i.report else None) for i in rows]


@router.post("", response_model=InterviewOut, status_code=201, dependencies=[Depends(ai_rate_limit)])
def create_interview(body: InterviewConfig, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                     llm: LLMProvider = Depends(get_llm)):
    try:
        iv = svc.start_interview(db, llm, user, body)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e
    return svc.to_out(iv)


@router.get("/{interview_id}", response_model=InterviewOut)
def get_interview(interview_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return svc.to_out(_owned(db, user, interview_id))


@router.post("/{interview_id}/answer", response_model=AnswerResult, dependencies=[Depends(ai_rate_limit)])
def answer(interview_id: int, body: AnswerIn, user: User = Depends(get_current_user), db: Session = Depends(get_db),
           llm: LLMProvider = Depends(get_llm)):
    iv = _owned(db, user, interview_id)
    try:
        iv, done = svc.submit_answer(db, llm, iv, body.answer, body.elapsed_seconds)
    except ValueError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
    return AnswerResult(interview=svc.to_out(iv), done=done)


@router.post("/{interview_id}/next", response_model=InterviewOut, dependencies=[Depends(ai_rate_limit)])
def retry_next(interview_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db),
               llm: LLMProvider = Depends(get_llm)):
    """Retry generating the next question after a model error (the answer was already saved)."""
    iv = _owned(db, user, interview_id)
    try:
        iv = svc.retry_question(db, llm, iv)
    except ValueError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
    return svc.to_out(iv)


@router.post("/{interview_id}/end", response_model=ReportOut, dependencies=[Depends(ai_rate_limit)])
def end(interview_id: int, body: EndIn | None = None, user: User = Depends(get_current_user),
        db: Session = Depends(get_db), llm: LLMProvider = Depends(get_llm)):
    iv = _owned(db, user, interview_id)
    if iv.report and iv.report.status == "ready":
        return _report_out(iv)
    svc.end_interview(db, llm, iv, body.elapsed_seconds if body else None)
    return _report_out(iv)


@router.get("/{interview_id}/report", response_model=ReportOut)
def get_report(interview_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _report_out(_owned(db, user, interview_id))


@router.post("/{interview_id}/report/retry", response_model=ReportOut, dependencies=[Depends(ai_rate_limit)])
def retry_report(interview_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                 llm: LLMProvider = Depends(get_llm)):
    iv = _owned(db, user, interview_id)
    if iv.status != "completed":
        raise HTTPException(status.HTTP_409_CONFLICT, "End the interview first.")
    svc.build_report(db, llm, iv)
    return _report_out(iv)


@router.delete("/{interview_id}", status_code=204)
def delete_interview(interview_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_owned(db, user, interview_id))
    db.commit()
