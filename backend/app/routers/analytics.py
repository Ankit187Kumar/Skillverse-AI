from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import ai_rate_limit, get_current_user, get_llm
from ..models import User
from ..services import analytics as A
from ..services import jobs
from ..services.llm import LLMProvider
from .jobs import JobOut

router = APIRouter(prefix="/api/analytics", tags=["analytics"])
TZ = Query(0, ge=-14 * 60, le=14 * 60, description="Minutes east of UTC (e.g. 330 for IST)")


class WeeklyGoals(BaseModel):
    interviews: int = Field(ge=0, le=50)
    lessons: int = Field(ge=0, le=100)
    problems: int = Field(ge=0, le=100)
    research: int = Field(ge=0, le=20)


class GoalsIn(BaseModel):
    weekly: WeeklyGoals
    daily: int = Field(ge=1, le=20)


@router.get("/overview")
def get_overview(tz: int = TZ, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return A.overview(db, user, tz)


@router.get("/recommendations")
def get_recommendations(tz: int = TZ, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return A.overview(db, user, tz)["recommendations"]


@router.put("/goals")
def set_goals(body: GoalsIn, tz: int = TZ, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.weekly_goals = body.weekly.model_dump()
    user.daily_goal = body.daily
    db.commit()
    return A.goals_progress(db, user, tz)


@router.get("/roadmap")
def get_roadmap(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ins = A.latest_insight(db, user.id, "roadmap")
    job = db.query(jobs.Job).filter(jobs.Job.user_id == user.id, jobs.Job.kind == "roadmap",
                                    jobs.Job.status.in_(("queued", "running"))).first()
    return {"roadmap": ins.data if ins else None, "created_at": ins.created_at if ins else None,
            "model_name": ins.model_name if ins else None,
            "job": JobOut.model_validate(job).model_dump(mode="json") if job else None}


@router.post("/roadmap", response_model=JobOut, dependencies=[Depends(ai_rate_limit)])
def create_roadmap(tz: int = TZ, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                   llm: LLMProvider = Depends(get_llm)):
    existing = db.query(jobs.Job).filter(jobs.Job.user_id == user.id, jobs.Job.kind == "roadmap",
                                         jobs.Job.status.in_(("queued", "running"))).first()
    if existing:
        return existing
    run = A.build_roadmap_job(user.id, tz)
    return jobs.submit(db, user.id, "roadmap", lambda d, ctx: run(d, ctx, llm), ref_type="user", ref_id=user.id)
