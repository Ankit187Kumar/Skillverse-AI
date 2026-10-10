from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import ai_rate_limit, get_current_user, get_llm
from ..models import User
from ..models_learning import Course
from ..services import jobs
from ..services import learning as L
from ..services.activity import record_activity
from ..services.llm import LLMProvider, generate_json
from .jobs import JobOut

router = APIRouter(prefix="/api/learning", tags=["learning"])
MAX_COURSES = 30


class CourseIn(BaseModel):
    topic: str = Field(min_length=2, max_length=200)
    level: Literal["Beginner", "Intermediate", "Advanced"] = "Beginner"
    goal: str = Field(default="", max_length=500)
    hours_per_week: int = Field(default=5, ge=1, le=40)


class CourseSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    topic: str
    title: str
    level: str
    status: str
    error: str | None
    created_at: datetime
    updated_at: datetime
    stats: dict


class QuizIn(BaseModel):
    answers: list[int | None] = Field(max_length=20)


class AttemptIn(BaseModel):
    answer: str = Field(min_length=3, max_length=6000)


class ProjectIn(BaseModel):
    submission: str = Field(min_length=30, max_length=20000)


def _owned(db: Session, user: User, course_id: int) -> Course:
    c = db.get(Course, course_id)
    if not c or c.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found.")
    return c


def _ready(c: Course) -> Course:
    if c.status not in ("ready", "completed") or not c.curriculum:
        raise HTTPException(status.HTTP_409_CONFLICT, "The course outline isn't ready yet.")
    return c


def _lesson(c: Course, key: str) -> dict:
    lesson = L.find_lesson(c, key)
    if not lesson:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesson not found.")
    return lesson


def _summary(c: Course) -> CourseSummary:
    return CourseSummary(id=c.id, topic=c.topic, title=c.title or c.topic, level=c.level, status=c.status,
                         error=c.error, created_at=c.created_at, updated_at=c.updated_at, stats=L.course_stats(c))


def _detail(db: Session, c: Course) -> dict:
    pm = L.progress_map(c)
    modules = []
    for mi, m in enumerate((c.curriculum or {}).get("modules", [])):
        lessons = []
        for lesson in m["lessons"]:
            lp = pm.get(lesson["key"])
            lessons.append({**lesson, "status": lp.status if lp else "not_started",
                            "best_quiz_score": lp.best_quiz_score if lp else None,
                            "generated": bool(lp and lp.content)})
        modules.append({"index": mi, "title": m["title"], "summary": m.get("summary", ""),
                        "objectives": m.get("objectives", []), "lessons": lessons})
    job = jobs.active_job(db, c.user_id, "course_outline", "course", c.id)
    return {
        **_summary(c).model_dump(mode="json"),
        "goal": c.goal, "hours_per_week": c.hours_per_week, "description": c.description, "outcomes": c.outcomes,
        "modules": modules,
        "project": (c.curriculum or {}).get("project"),
        "project_submitted": bool(c.project_submission),
        "project_feedback": c.project_feedback,
        "assessment_available": bool(c.assessment),
        "assessment_result": c.assessment_result,
        "recommendations": L.recommendations(c) if c.curriculum else [],
        "job": JobOut.model_validate(job).model_dump(mode="json") if job else None,
        "model_name": c.model_name,
    }


def _start_outline_job(db: Session, user: User, c: Course, llm: LLMProvider):
    def on_fail(db2: Session, msg: str):
        course = db2.get(Course, c.id)
        if course:
            course.status, course.error = "failed", msg

    run = L.build_curriculum_job(c.id)
    return jobs.submit(db, user.id, "course_outline", lambda d, ctx: run(d, ctx, llm), ref_type="course",
                       ref_id=c.id, on_fail=on_fail)


@router.get("/courses", response_model=list[CourseSummary])
def list_courses(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Course).where(Course.user_id == user.id).options(selectinload(Course.lessons))
                      .order_by(Course.updated_at.desc()))
    return [_summary(c) for c in rows]


@router.post("/courses", status_code=201, dependencies=[Depends(ai_rate_limit)])
def create_course(body: CourseIn, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                  llm: LLMProvider = Depends(get_llm)):
    if db.query(Course).filter(Course.user_id == user.id).count() >= MAX_COURSES:
        raise HTTPException(400, f"You can have up to {MAX_COURSES} courses. Delete one to start another.")
    c = Course(user_id=user.id, topic=body.topic.strip(), level=body.level, goal=body.goal.strip(),
               hours_per_week=body.hours_per_week, title=body.topic.strip(), outcomes=[])
    db.add(c)
    db.commit()
    db.refresh(c)
    job = _start_outline_job(db, user, c, llm)
    db.refresh(c)
    return {"course": _detail(db, c), "job": JobOut.model_validate(job)}


@router.get("/courses/{course_id}")
def get_course(course_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _detail(db, _owned(db, user, course_id))


@router.post("/courses/{course_id}/retry", dependencies=[Depends(ai_rate_limit)])
def retry_course(course_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                 llm: LLMProvider = Depends(get_llm)):
    c = _owned(db, user, course_id)
    if c.status != "failed":
        raise HTTPException(409, "Only a failed outline can be retried.")
    c.status, c.error = "generating", None
    db.commit()
    job = _start_outline_job(db, user, c, llm)
    db.refresh(c)
    return {"course": _detail(db, c), "job": JobOut.model_validate(job)}


@router.delete("/courses/{course_id}", status_code=204)
def delete_course(course_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_owned(db, user, course_id))
    db.commit()


# ---------- lessons ----------
@router.get("/courses/{course_id}/lessons/{key}")
def get_lesson(course_id: int, key: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _ready(_owned(db, user, course_id))
    lesson = _lesson(c, key)
    lp = L.progress_map(c).get(key)
    c.last_lesson_key = key  # resume from here next time
    db.commit()
    idx = L.lesson_index(c)
    pos = lesson["position"]
    job = jobs.active_job(db, user.id, "lesson", "course", c.id)
    return {
        **lesson,
        "course_id": c.id, "course_title": c.title, "course_topic": c.topic,
        "status": lp.status if lp else "not_started",
        "quiz_attempts": lp.quiz_attempts if lp else 0,
        "best_quiz_score": lp.best_quiz_score if lp else None,
        "content": L.public_lesson(lp),
        "prev_key": idx[pos - 1]["key"] if pos > 0 else None,
        "next_key": idx[pos + 1]["key"] if pos + 1 < len(idx) else None,
        "total_lessons": len(idx),
        "pass_mark": L.PASS_MARK,
        "job": JobOut.model_validate(job).model_dump(mode="json") if job else None,
    }


@router.post("/courses/{course_id}/lessons/{key}/generate", response_model=JobOut, dependencies=[Depends(ai_rate_limit)])
def generate_lesson(course_id: int, key: str, regenerate: bool = False, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db), llm: LLMProvider = Depends(get_llm)):
    c = _ready(_owned(db, user, course_id))
    _lesson(c, key)
    lp = L.progress_map(c).get(key)
    if lp and lp.content and not regenerate:
        raise HTTPException(409, "This lesson is already written.")
    existing = jobs.active_job(db, user.id, "lesson", "course", c.id)
    if existing:
        return existing
    if lp and regenerate:  # a fresh lesson resets per-lesson exercise state, keeps quiz history
        lp.hints_revealed, lp.solutions_revealed, lp.exercise_feedback, lp.remedial = {}, [], {}, None
        db.commit()
    run = L.build_lesson_job(c.id, key)
    return jobs.submit(db, user.id, "lesson", lambda d, ctx: run(d, ctx, llm), ref_type="course", ref_id=c.id)


def _content_lp(db: Session, c: Course, key: str):
    lp = L.progress_map(c).get(key)
    if not lp or not lp.content:
        raise HTTPException(409, "Generate the lesson first.")
    return lp


@router.post("/courses/{course_id}/lessons/{key}/quiz")
def submit_quiz(course_id: int, key: str, body: QuizIn, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    c = _ready(_owned(db, user, course_id))
    lesson = _lesson(c, key)
    lp = _content_lp(db, c, key)
    quiz = lp.content["quiz"]
    if len(body.answers) != len(quiz):
        raise HTTPException(422, f"Expected {len(quiz)} answers.")
    score, results = L.grade(quiz, body.answers)
    lp.quiz_attempts += 1
    lp.last_quiz_score = score
    lp.best_quiz_score = max(lp.best_quiz_score or 0, score)
    passed = score >= L.PASS_MARK
    lp.content = {**lp.content, "_last_quiz": {"score": score, "passed": passed, "results": results}}
    db.commit()
    if passed:
        record_activity(db, user, "quiz_passed", f"Passed the quiz: {lesson['title']} ({score:.0f}%)",
                        f"/learn/{c.id}/{key}")
        L.mark_completed(db, user, c, lp, lesson["title"])
    advice = ("Great work — move on to the next lesson." if score >= 80 else
              "You passed. Review the explanations for the questions you missed." if passed else
              "Not quite yet. Read the simpler explanation and use the exercises, then try again.")
    return {"score": score, "passed": passed, "results": results, "advice": advice,
            "best_quiz_score": lp.best_quiz_score, "status": lp.status}


@router.post("/courses/{course_id}/lessons/{key}/complete")
def complete_lesson(course_id: int, key: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _ready(_owned(db, user, course_id))
    lesson = _lesson(c, key)
    lp = L.get_or_create_progress(db, c, key)
    L.mark_completed(db, user, c, lp, lesson["title"])
    return {"status": lp.status, "stats": L.course_stats(c)}


@router.post("/courses/{course_id}/lessons/{key}/exercises/{i}/hint")
def reveal_hint(course_id: int, key: str, i: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _ready(_owned(db, user, course_id))
    lp = _content_lp(db, c, key)
    exercises = lp.content["exercises"]
    if not 0 <= i < len(exercises):
        raise HTTPException(404, "Exercise not found.")
    shown = int(lp.hints_revealed.get(str(i), 0))
    if shown >= len(exercises[i]["hints"]):
        raise HTTPException(409, "All hints are already shown.")
    lp.hints_revealed = {**lp.hints_revealed, str(i): shown + 1}
    db.commit()
    return L.public_lesson(lp)["exercises"][i]


@router.post("/courses/{course_id}/lessons/{key}/exercises/{i}/solution")
def reveal_solution(course_id: int, key: str, i: int, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    c = _ready(_owned(db, user, course_id))
    lp = _content_lp(db, c, key)
    if not 0 <= i < len(lp.content["exercises"]):
        raise HTTPException(404, "Exercise not found.")
    tried = int(lp.hints_revealed.get(str(i), 0)) > 0 or str(i) in lp.exercise_feedback
    if not tried:
        raise HTTPException(409, "Try a hint or submit an attempt before revealing the full solution.")
    if i not in lp.solutions_revealed:
        lp.solutions_revealed = [*lp.solutions_revealed, i]
        db.commit()
    return L.public_lesson(lp)["exercises"][i]


@router.post("/courses/{course_id}/lessons/{key}/exercises/{i}/check", dependencies=[Depends(ai_rate_limit)])
def check_exercise(course_id: int, key: str, i: int, body: AttemptIn, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db), llm: LLMProvider = Depends(get_llm)):
    c = _ready(_owned(db, user, course_id))
    lesson = _lesson(c, key)
    lp = _content_lp(db, c, key)
    exercises = lp.content["exercises"]
    if not 0 <= i < len(exercises):
        raise HTTPException(404, "Exercise not found.")
    out = generate_json(llm, L.exercise_check_messages(lesson["title"], exercises[i], body.answer,
                                                       user.preferred_language or "English"),
                        L.ExerciseCheckOut, temperature=0.2)
    lp.exercise_feedback = {**lp.exercise_feedback, str(i): {**out.model_dump(), "answer": body.answer}}
    if lp.status == "not_started":
        lp.status = "in_progress"
    db.commit()
    return L.public_lesson(lp)["exercises"][i]


@router.post("/courses/{course_id}/lessons/{key}/simplify", response_model=JobOut, dependencies=[Depends(ai_rate_limit)])
def simplify(course_id: int, key: str, user: User = Depends(get_current_user), db: Session = Depends(get_db),
             llm: LLMProvider = Depends(get_llm)):
    c = _ready(_owned(db, user, course_id))
    _lesson(c, key)
    _content_lp(db, c, key)
    run = L.build_remedial_job(c.id, key)
    return jobs.submit(db, user.id, "lesson_remedial", lambda d, ctx: run(d, ctx, llm), ref_type="course", ref_id=c.id)


# ---------- assessment & project ----------
@router.post("/courses/{course_id}/assessment", response_model=JobOut, dependencies=[Depends(ai_rate_limit)])
def create_assessment(course_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                      llm: LLMProvider = Depends(get_llm)):
    c = _ready(_owned(db, user, course_id))
    run = L.build_assessment_job(c.id)
    return jobs.submit(db, user.id, "assessment", lambda d, ctx: run(d, ctx, llm), ref_type="course", ref_id=c.id)


@router.get("/courses/{course_id}/assessment")
def get_assessment(course_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _ready(_owned(db, user, course_id))
    if not c.assessment:
        raise HTTPException(404, "No assessment yet.")
    mods = c.curriculum["modules"]
    return {
        "course_id": c.id, "course_title": c.title,
        "questions": [{"question": q["question"], "options": q["options"],
                       "module": mods[q["module_index"]]["title"]} for q in c.assessment["questions"]],
        "result": c.assessment_result,
    }


@router.post("/courses/{course_id}/assessment/submit")
def submit_assessment(course_id: int, body: QuizIn, user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    c = _ready(_owned(db, user, course_id))
    if not c.assessment:
        raise HTTPException(404, "No assessment yet.")
    qs = c.assessment["questions"]
    if len(body.answers) != len(qs):
        raise HTTPException(422, f"Expected {len(qs)} answers.")
    score, results = L.grade(qs, body.answers)
    by_module: dict[int, list[bool]] = {}
    for q, r in zip(qs, results):
        by_module.setdefault(q["module_index"], []).append(r["correct"])
    mods = c.curriculum["modules"]
    module_scores = [{"module_index": mi, "module": mods[mi]["title"], "score": round(100 * sum(v) / len(v))}
                     for mi, v in sorted(by_module.items())]
    weak = [m["module_index"] for m in module_scores if m["score"] < L.PASS_MARK]
    c.assessment_result = {"score": score, "results": results, "module_scores": module_scores, "weak_modules": weak,
                           "submitted_at": datetime.now().astimezone().isoformat()}
    db.commit()
    record_activity(db, user, "assessment_completed", f"Scored {score:.0f}% on the {c.title} assessment",
                    f"/learn/{c.id}/assessment")
    return c.assessment_result


@router.post("/courses/{course_id}/project", response_model=JobOut, dependencies=[Depends(ai_rate_limit)])
def submit_project(course_id: int, body: ProjectIn, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db), llm: LLMProvider = Depends(get_llm)):
    c = _ready(_owned(db, user, course_id))
    c.project_submission = body.submission.strip()
    c.project_feedback = None
    db.commit()
    run = L.build_project_job(c.id)
    return jobs.submit(db, user.id, "project_review", lambda d, ctx: run(d, ctx, llm), ref_type="course", ref_id=c.id)
