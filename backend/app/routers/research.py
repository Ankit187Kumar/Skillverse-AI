from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import ai_rate_limit, get_current_user, get_llm
from ..models import User
from ..models_research import Document, ResearchProject
from ..services import jobs
from ..services import research as R
from ..services.llm import LLMProvider
from .jobs import JobOut

router = APIRouter(prefix="/api/research", tags=["research"])
FIELDS = ["General", "Technology", "Business", "Education", "Science", "Health", "Policy", "Arts & Humanities"]


class ProjectIn(BaseModel):
    prompt: str = Field(min_length=10, max_length=3000)
    goals: str = Field(default="", max_length=1500)
    field: str = Field(default="General", max_length=60)
    use_web: bool = True
    document_ids: list[int] = Field(default_factory=list, max_length=50)
    auto_run: bool = False


class PlanEdit(BaseModel):
    sub_questions: list[R.SubQuestion] = Field(min_length=1, max_length=8)


def _owned(db: Session, user: User, pid: int) -> ResearchProject:
    p = db.get(ResearchProject, pid)
    if not p or p.user_id != user.id:
        raise HTTPException(404, "Research project not found.")
    return p


def _web_available() -> bool:
    return get_settings().search_provider != "none"


def _detail(db: Session, p: ResearchProject) -> dict:
    job = db.query(jobs.Job).filter(jobs.Job.user_id == p.user_id, jobs.Job.ref_type == "research",
                                    jobs.Job.ref_id == p.id, jobs.Job.status.in_(("queued", "running"))).first()
    return {
        "id": p.id, "title": p.title, "prompt": p.prompt, "goals": p.goals, "field": p.field, "use_web": p.use_web,
        "documents": R.document_label(db, p.document_ids), "status": p.status, "plan": p.plan, "report": p.report,
        "notes": p.notes, "error": p.error, "model_name": p.model_name, "created_at": p.created_at,
        "updated_at": p.updated_at,
        "sources": [{"number": s.number, "kind": s.kind, "title": s.title, "url": s.url, "document_id": s.document_id,
                     "query": s.query, "excerpt": s.excerpt, "fetched": s.fetched, "cited": s.cited} for s in p.sources],
        "job": JobOut.model_validate(job).model_dump(mode="json") if job else None,
        "web_available": _web_available(),
    }


def _fail(pid: int):
    def on_fail(db: Session, msg: str):
        p = db.get(ResearchProject, pid)
        if p:
            p.status, p.error = "failed", msg
    return on_fail


def _start(db: Session, user: User, p: ResearchProject, llm: LLMProvider, *, plan: bool, run: bool):
    plan_fn = R.build_plan_job(p.id)
    run_fn = R.build_run_job(p.id)

    def job(d: Session, ctx):
        if plan:
            plan_fn(d, ctx, llm)
        if run:
            proj = d.get(ResearchProject, p.id)
            proj.status = "running"
            d.commit()
            run_fn(d, ctx, llm)

    p.status = "planning" if plan else "running"
    p.error = None
    db.commit()
    kind = "research_plan" if plan and not run else "research_run"
    return jobs.submit(db, user.id, kind, job, ref_type="research", ref_id=p.id, on_fail=_fail(p.id))


@router.get("/config")
def config(user: User = Depends(get_current_user)):
    s = get_settings()
    return {"search_provider": s.search_provider, "web_available": _web_available(), "fields": FIELDS,
            "max_sources": s.research_max_sources}


@router.get("/projects")
def list_projects(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(ResearchProject).where(ResearchProject.user_id == user.id)
                      .order_by(ResearchProject.updated_at.desc()))
    return [{"id": p.id, "title": p.title, "field": p.field, "status": p.status, "updated_at": p.updated_at,
             "sources": len(p.sources), "error": p.error} for p in rows]


@router.post("/projects", status_code=201, dependencies=[Depends(ai_rate_limit)])
def create_project(body: ProjectIn, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                   llm: LLMProvider = Depends(get_llm)):
    if body.document_ids:
        owned = {d.id for d in db.query(Document).filter(Document.user_id == user.id,
                                                          Document.id.in_(body.document_ids))}
        if owned != set(body.document_ids):
            raise HTTPException(400, "One or more documents were not found.")
    title = body.prompt.strip().split("\n")[0][:120]
    p = ResearchProject(user_id=user.id, title=title, prompt=body.prompt.strip(), goals=body.goals.strip(),
                        field=body.field, use_web=body.use_web, document_ids=body.document_ids, notes={})
    db.add(p)
    db.commit()
    db.refresh(p)
    job = _start(db, user, p, llm, plan=True, run=body.auto_run)
    db.refresh(p)
    return {"project": _detail(db, p), "job": JobOut.model_validate(job)}


@router.get("/projects/{pid}")
def get_project(pid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _detail(db, _owned(db, user, pid))


@router.put("/projects/{pid}/plan")
def edit_plan(pid: int, body: PlanEdit, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _owned(db, user, pid)
    if p.status in ("planning", "running"):
        raise HTTPException(409, "Wait for the current step to finish.")
    p.plan = {**(p.plan or {"title": p.title}), "sub_questions": [q.model_dump() for q in body.sub_questions]}
    if p.status in ("draft", "failed"):
        p.status = "planned"
    db.commit()
    return _detail(db, p)


@router.post("/projects/{pid}/plan", response_model=JobOut, dependencies=[Depends(ai_rate_limit)])
def replan(pid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db),
           llm: LLMProvider = Depends(get_llm)):
    p = _owned(db, user, pid)
    if p.status in ("planning", "running"):
        raise HTTPException(409, "Wait for the current step to finish.")
    return _start(db, user, p, llm, plan=True, run=False)


@router.post("/projects/{pid}/run", response_model=JobOut, dependencies=[Depends(ai_rate_limit)])
def run_research(pid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                 llm: LLMProvider = Depends(get_llm)):
    p = _owned(db, user, pid)
    if p.status in ("planning", "running"):
        raise HTTPException(409, "Wait for the current step to finish.")
    if not p.plan:
        raise HTTPException(409, "Create a plan first.")
    return _start(db, user, p, llm, plan=False, run=True)


@router.get("/projects/{pid}/export.md", response_class=PlainTextResponse)
def export_markdown(pid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _owned(db, user, pid)
    if not p.report:
        raise HTTPException(409, "There is no report yet.")
    safe = "".join(ch if ch.isalnum() or ch in "-_ " else "_" for ch in p.title)[:60].strip() or "report"
    return PlainTextResponse(R.to_markdown(p), media_type="text/markdown; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{safe}.md"'})


@router.delete("/projects/{pid}", status_code=204)
def delete_project(pid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_owned(db, user, pid))
    db.commit()

