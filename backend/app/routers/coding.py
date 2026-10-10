from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import ai_rate_limit, get_current_user, get_llm
from ..models import User
from ..models_coding import CodeDraft, Problem, ProblemProgress, Submission
from ..security import limiter
from ..services import coding as C
from ..services.activity import record_activity
from ..services.llm import LLMProvider, generate_json
from ..services.runner import LANGUAGES, STARTERS, Runner, RunnerUnavailable, build_runner

router = APIRouter(prefix="/api/coding", tags=["coding"])
Lang = Literal["python", "javascript", "java", "cpp"]


def get_runner() -> Runner:
    return build_runner(get_settings())


def run_rate_limit(user: User = Depends(get_current_user)) -> None:
    limiter.check(f"code:{user.id}", 20)


class CodeIn(BaseModel):
    language: Lang
    code: str = Field(min_length=1, max_length=50_000)


class RunIn(CodeIn):
    stdin: str | None = Field(default=None, max_length=200_000)


def _problem(db: Session, slug: str) -> Problem:
    p = db.scalar(select(Problem).where(Problem.slug == slug))
    if not p:
        raise HTTPException(404, "Problem not found.")
    return p


def _progress(db: Session, user: User, p: Problem) -> ProblemProgress:
    pp = db.scalar(select(ProblemProgress).where(ProblemProgress.user_id == user.id, ProblemProgress.problem_id == p.id))
    if not pp:
        pp = ProblemProgress(user_id=user.id, problem_id=p.id, hints_revealed=0, explanation_revealed=False)
        db.add(pp)
        db.flush()
    return pp


def _languages(runner: Runner) -> tuple[list[dict], str | None]:
    try:
        return runner.languages(), None
    except RunnerUnavailable as e:
        return [], str(e)


@router.get("/config")
def config(user: User = Depends(get_current_user), runner: Runner = Depends(get_runner)):
    langs, err = _languages(runner)
    return {"runner": runner.name, "execution_available": bool(langs), "languages": langs, "error": err,
            "all_languages": [{"id": k, "label": v["label"]} for k, v in LANGUAGES.items()],
            "time_limit_ms": get_settings().code_run_timeout_ms}


@router.get("/problems")
def list_problems(difficulty: str | None = None, topic: str | None = None, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    q = select(Problem)
    if difficulty:
        q = q.where(Problem.difficulty == difficulty)
    if topic:
        q = q.where(Problem.topic == topic)
    problems = db.scalars(q).all()
    prog = {pp.problem_id: pp for pp in db.scalars(select(ProblemProgress).where(ProblemProgress.user_id == user.id))}
    attempted = set(db.scalars(select(Submission.problem_id).where(Submission.user_id == user.id).distinct()))
    order = {"Easy": 0, "Medium": 1, "Hard": 2}
    rows = sorted(problems, key=lambda p: (order.get(p.difficulty, 3), p.title))
    return {
        "topics": sorted({p.topic for p in db.scalars(select(Problem))}),
        "problems": [{"slug": p.slug, "title": p.title, "difficulty": p.difficulty, "topic": p.topic,
                      "status": "solved" if prog.get(p.id) and prog[p.id].solved_at else
                      ("attempted" if p.id in attempted else "new")} for p in rows],
    }


@router.get("/problems/{slug}")
def get_problem(slug: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _problem(db, slug)
    pp = _progress(db, user, p)
    db.commit()
    drafts = {d.language: d.code for d in db.scalars(select(CodeDraft).where(CodeDraft.user_id == user.id,
                                                                              CodeDraft.problem_id == p.id))}
    subs = db.scalars(select(Submission).where(Submission.user_id == user.id, Submission.problem_id == p.id)
                      .order_by(Submission.id.desc()).limit(10)).all()
    return {
        "slug": p.slug, "title": p.title, "difficulty": p.difficulty, "topic": p.topic, "statement": p.statement,
        "input_format": p.input_format, "output_format": p.output_format, "constraints": p.constraints,
        "samples": p.samples, "hidden_tests": len(p.tests) - len(p.samples),
        "hints": p.hints[: pp.hints_revealed], "hints_total": len(p.hints),
        "explanation": p.explanation if pp.explanation_revealed else None,
        "expected_complexity": p.expected_complexity if pp.explanation_revealed or pp.solved_at else None,
        "solved": bool(pp.solved_at), "last_language": pp.last_language,
        "drafts": drafts, "starters": STARTERS,
        "submissions": [{"id": s.id, "language": s.language, "verdict": s.verdict, "passed": s.passed, "total": s.total,
                         "created_at": s.created_at} for s in subs],
    }


@router.put("/problems/{slug}/draft", status_code=204)
def save_draft(slug: str, body: CodeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _problem(db, slug)
    d = db.scalar(select(CodeDraft).where(CodeDraft.user_id == user.id, CodeDraft.problem_id == p.id,
                                          CodeDraft.language == body.language))
    if d:
        d.code = body.code
    else:
        db.add(CodeDraft(user_id=user.id, problem_id=p.id, language=body.language, code=body.code))
    _progress(db, user, p).last_language = body.language
    db.commit()


@router.post("/problems/{slug}/hint")
def reveal_hint(slug: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _problem(db, slug)
    pp = _progress(db, user, p)
    if pp.hints_revealed >= len(p.hints):
        raise HTTPException(409, "All hints are already shown.")
    pp.hints_revealed += 1
    db.commit()
    return {"hints": p.hints[: pp.hints_revealed], "hints_total": len(p.hints)}


@router.post("/problems/{slug}/explanation")
def reveal_explanation(slug: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _problem(db, slug)
    pp = _progress(db, user, p)
    if pp.hints_revealed < len(p.hints) and not pp.solved_at:
        raise HTTPException(409, "Use the hints first — the full explanation unlocks after all hints or a solve.")
    pp.explanation_revealed = True
    db.commit()
    return {"explanation": p.explanation, "expected_complexity": p.expected_complexity}


@router.post("/problems/{slug}/run", dependencies=[Depends(run_rate_limit)])
def run_code(slug: str, body: RunIn, user: User = Depends(get_current_user), db: Session = Depends(get_db),
             runner: Runner = Depends(get_runner)):
    p = _problem(db, slug)
    try:
        C.ensure_runner(runner)
        if body.stdin is not None:
            return {"mode": "custom", **C.run_custom(runner, body.language, body.code, body.stdin)}
        return {"mode": "samples", **C.judge(runner, p, body.language, body.code, samples_only=True)}
    except RunnerUnavailable as e:
        raise HTTPException(503, str(e)) from e


@router.post("/problems/{slug}/submit", dependencies=[Depends(run_rate_limit)])
def submit(slug: str, body: CodeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db),
           runner: Runner = Depends(get_runner)):
    p = _problem(db, slug)
    try:
        C.ensure_runner(runner)
        judged = C.judge(runner, p, body.language, body.code, samples_only=False)
    except RunnerUnavailable as e:
        raise HTTPException(503, str(e)) from e
    sub = Submission(user_id=user.id, problem_id=p.id, language=body.language, code=body.code,
                     verdict=judged["verdict"], passed=judged["passed"], total=judged["total"],
                     max_time_ms=judged["max_time_ms"], results=judged["results"])
    db.add(sub)
    pp = _progress(db, user, p)
    pp.last_language = body.language
    first_solve = judged["verdict"] == "accepted" and not pp.solved_at
    if first_solve:
        pp.solved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(sub)
    if first_solve:
        record_activity(db, user, "problem_solved", f"Solved {p.title} ({p.difficulty})", f"/coding/{p.slug}")
    elif judged["verdict"] != "accepted":
        record_activity(db, user, "problem_attempted", f"Attempted {p.title}", f"/coding/{p.slug}")
    return {"id": sub.id, **judged, "first_solve": first_solve}


@router.get("/submissions")
def list_submissions(problem: str | None = None, limit: int = Query(30, ge=1, le=200),
                     user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = select(Submission, Problem).join(Problem, Submission.problem_id == Problem.id).where(Submission.user_id == user.id)
    if problem:
        q = q.where(Problem.slug == problem)
    rows = db.execute(q.order_by(Submission.id.desc()).limit(limit)).all()
    return [{"id": s.id, "problem": p.slug, "title": p.title, "difficulty": p.difficulty, "language": s.language,
             "verdict": s.verdict, "passed": s.passed, "total": s.total, "max_time_ms": s.max_time_ms,
             "created_at": s.created_at, "reviewed": bool(s.ai_review)} for s, p in rows]


def _owned_submission(db: Session, user: User, sid: int) -> Submission:
    s = db.get(Submission, sid)
    if not s or s.user_id != user.id:
        raise HTTPException(404, "Submission not found.")
    return s


@router.get("/submissions/{sid}")
def get_submission(sid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = _owned_submission(db, user, sid)
    p = db.get(Problem, s.problem_id)
    return {"id": s.id, "problem": p.slug, "title": p.title, "language": s.language, "code": s.code,
            "verdict": s.verdict, "passed": s.passed, "total": s.total, "max_time_ms": s.max_time_ms,
            "results": s.results, "ai_review": s.ai_review, "created_at": s.created_at}


@router.post("/submissions/{sid}/review", dependencies=[Depends(ai_rate_limit)])
def review_submission(sid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                      llm: LLMProvider = Depends(get_llm)):
    s = _owned_submission(db, user, sid)
    p = db.get(Problem, s.problem_id)
    judged = {"verdict": s.verdict, "passed": s.passed, "total": s.total, "results": s.results}
    out = generate_json(llm, C.review_messages(p, s.language, s.code, judged), C.ReviewOut, temperature=0.2)
    s.ai_review = {**out.model_dump(), "model": llm.model, "executed": True}
    db.commit()
    return s.ai_review


@router.post("/problems/{slug}/review", dependencies=[Depends(ai_rate_limit)])
def review_unexecuted(slug: str, body: CodeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                      llm: LLMProvider = Depends(get_llm)):
    """Static AI review for when no sandbox is configured (the code is not run)."""
    p = _problem(db, slug)
    out = generate_json(llm, C.review_messages(p, body.language, body.code, None), C.ReviewOut, temperature=0.2)
    return {**out.model_dump(), "model": llm.model, "executed": False}


@router.get("/stats")
def stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    solved = db.execute(select(Problem.difficulty, Problem.topic).join(ProblemProgress, ProblemProgress.problem_id == Problem.id)
                        .where(ProblemProgress.user_id == user.id, ProblemProgress.solved_at.is_not(None))).all()
    totals = dict(db.execute(select(Problem.difficulty, func.count()).group_by(Problem.difficulty)).all())
    subs = db.execute(select(Submission.verdict, Submission.language).where(Submission.user_id == user.id)).all()
    by_lang: dict[str, int] = {}
    for _, lang in subs:
        by_lang[lang] = by_lang.get(lang, 0) + 1
    by_topic: dict[str, int] = {}
    for _, topic in solved:
        by_topic[topic] = by_topic.get(topic, 0) + 1
    accepted = sum(1 for v, _ in subs if v == "accepted")
    return {
        "solved": len(solved), "total_problems": sum(totals.values()),
        "by_difficulty": {d: {"solved": sum(1 for x, _ in solved if x == d), "total": totals.get(d, 0)}
                          for d in ("Easy", "Medium", "Hard")},
        "submissions": len(subs), "accepted": accepted,
        "acceptance_rate": round(100 * accepted / len(subs), 1) if subs else None,
        "by_language": by_lang, "solved_by_topic": by_topic,
    }
