from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import auth_rate_limit, get_current_user
from sqlalchemy import select

from ..models import User
from ..models_coding import Submission
from ..models_learning import Course
from ..models_research import Document, ResearchProject
from ..schemas import DeleteAccountIn, PasswordChange, ProfileUpdate, UserOut
from ..security import hash_password, verify_password
from .auth import user_out

router = APIRouter(prefix="/api/users", tags=["users"])


@router.patch("/me", response_model=UserOut)
def update_profile(body: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(user, field, value.strip() if isinstance(value, str) else value)
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.post("/me/password", status_code=204, dependencies=[Depends(auth_rate_limit)])
def change_password(body: PasswordChange, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect.")
    if body.new_password.isalpha() or body.new_password.isdigit():
        raise HTTPException(422, "Password must mix letters with numbers or symbols.")
    user.password_hash = hash_password(body.new_password)
    db.commit()


@router.get("/me/export")
def export_data(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Everything stored about the signed-in user, as JSON."""
    return {
        "profile": user_out(user).model_dump(mode="json"),
        "resumes": [{"filename": r.filename, "created_at": r.created_at.isoformat(), "parsed": r.parsed,
                     "extracted_text": r.extracted_text} for r in user.resumes],
        "interviews": [{
            "id": i.id, "config": i.config, "status": i.status, "started_at": i.started_at.isoformat(),
            "transcript": [{"role": t.role, "content": t.content} for t in i.turns],
            "report": i.report.data if i.report else None,
            "overall_score": i.report.overall_score if i.report else None,
        } for i in user.interviews],
        "activities": [{"kind": a.kind, "title": a.title, "created_at": a.created_at.isoformat()} for a in user.activities],
        "courses": [{"topic": c.topic, "title": c.title, "level": c.level, "status": c.status, "curriculum": c.curriculum,
                     "lessons": [{"key": lp.lesson_key, "status": lp.status, "best_quiz_score": lp.best_quiz_score}
                                 for lp in c.lessons],
                     "assessment_result": c.assessment_result, "project_submission": c.project_submission,
                     "project_feedback": c.project_feedback} for c in db.scalars(select(Course).where(Course.user_id == user.id))],
        "research": [{"title": p.title, "prompt": p.prompt, "status": p.status, "plan": p.plan, "report": p.report,
                      "sources": [{"number": s.number, "title": s.title, "url": s.url} for s in p.sources]}
                     for p in db.scalars(select(ResearchProject).where(ResearchProject.user_id == user.id))],
        "documents": [{"filename": d.filename, "created_at": d.created_at.isoformat()}
                      for d in db.scalars(select(Document).where(Document.user_id == user.id))],
        "coding_submissions": [{"problem_id": s.problem_id, "language": s.language, "verdict": s.verdict, "code": s.code,
                                "created_at": s.created_at.isoformat(), "ai_review": s.ai_review}
                               for s in db.scalars(select(Submission).where(Submission.user_id == user.id))],
        "goals": {"weekly": user.weekly_goals, "daily": user.daily_goal},
    }


@router.delete("/me", status_code=204, dependencies=[Depends(auth_rate_limit)])
def delete_account(body: DeleteAccountIn, response: Response, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password is incorrect.")
    db.delete(user)  # cascades to resumes, interviews, transcripts, reports and activity
    db.commit()
    s = get_settings()
    response.delete_cookie(s.cookie_name, path="/", httponly=True, secure=s.cookie_secure, samesite="lax")
