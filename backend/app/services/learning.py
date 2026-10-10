"""Phase 2: AI learning assistant — curricula, lessons, quizzes, exercises, assessments, projects."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy.orm import Session

from ..models import User
from ..models_learning import Course, LessonProgress
from .activity import record_activity
from .jobs import JobContext
from .llm import LLMProvider, generate_json

PASS_MARK = 60.0


# ---------- LLM output schemas ----------
class CurriculumLesson(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    summary: str = Field(default="", max_length=600)


class CurriculumModule(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    summary: str = Field(default="", max_length=800)
    objectives: list[str] = Field(default_factory=list)
    lessons: list[CurriculumLesson] = Field(min_length=1, max_length=8)


class CapstoneProject(BaseModel):
    title: str
    brief: str
    requirements: list[str] = Field(default_factory=list)
    stretch: list[str] = Field(default_factory=list)


class CurriculumOut(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=1500)
    outcomes: list[str] = Field(default_factory=list)
    modules: list[CurriculumModule] = Field(min_length=2, max_length=10)
    project: CapstoneProject


class Example(BaseModel):
    title: str
    content: str


class Exercise(BaseModel):
    prompt: str = Field(min_length=5)
    hints: list[str] = Field(min_length=1, max_length=4)
    solution: str = Field(min_length=5)


class QuizQuestion(BaseModel):
    question: str = Field(min_length=5)
    options: list[str] = Field(min_length=2, max_length=6)
    answer_index: int
    explanation: str = ""

    @model_validator(mode="after")
    def check_index(self):
        if not 0 <= self.answer_index < len(self.options):
            raise ValueError("answer_index must point to one of the options")
        return self


class LessonOut(BaseModel):
    objectives: list[str] = Field(default_factory=list)
    explanation: str = Field(min_length=80)
    examples: list[Example] = Field(default_factory=list)
    key_points: list[str] = Field(default_factory=list)
    exercises: list[Exercise] = Field(min_length=1, max_length=4)
    quiz: list[QuizQuestion] = Field(min_length=3, max_length=8)


class RemedialOut(BaseModel):
    explanation: str = Field(min_length=50)
    analogy: str = ""
    examples: list[Example] = Field(default_factory=list)
    check_yourself: list[str] = Field(default_factory=list)


class ExerciseCheckOut(BaseModel):
    verdict: str
    feedback: str
    next_step: str = ""

    @field_validator("verdict")
    @classmethod
    def norm(cls, v: str) -> str:
        v = v.lower().replace(" ", "_")
        if "partial" in v:
            return "partially_correct"
        return "correct" if v.startswith("correct") else "incorrect"


class AssessmentQuestion(QuizQuestion):
    module_index: int = 0


class AssessmentOut(BaseModel):
    questions: list[AssessmentQuestion] = Field(min_length=5, max_length=15)


class RubricItem(BaseModel):
    criterion: str
    score: float = Field(ge=0, le=100)
    comment: str = ""


class ProjectFeedbackOut(BaseModel):
    score: float = Field(ge=0, le=100)
    summary: str
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    rubric: list[RubricItem] = Field(default_factory=list)


# ---------- curriculum helpers ----------
def lesson_index(course: Course) -> list[dict]:
    """Flat, ordered list of lessons with their module context."""
    out = []
    for mi, m in enumerate((course.curriculum or {}).get("modules", [])):
        for li, lesson in enumerate(m["lessons"]):
            out.append({"key": lesson["key"], "title": lesson["title"], "summary": lesson.get("summary", ""),
                        "module_index": mi, "module_title": m["title"], "position": len(out)})
    return out


def find_lesson(course: Course, key: str) -> dict | None:
    return next((x for x in lesson_index(course) if x["key"] == key), None)


def progress_map(course: Course) -> dict[str, LessonProgress]:
    return {lp.lesson_key: lp for lp in course.lessons}


def course_stats(course: Course) -> dict:
    idx = lesson_index(course)
    pm = progress_map(course)
    total = len(idx)
    completed = sum(1 for x in idx if pm.get(x["key"]) and pm[x["key"]].status == "completed")
    scores = [lp.best_quiz_score for lp in course.lessons if lp.best_quiz_score is not None]
    nxt = next((x for x in idx if not (pm.get(x["key"]) and pm[x["key"]].status == "completed")), None)
    resume = course.last_lesson_key
    if resume and pm.get(resume) and pm[resume].status == "completed":
        resume = nxt["key"] if nxt else None
    return {
        "total_lessons": total,
        "completed_lessons": completed,
        "progress": round(100 * completed / total) if total else 0,
        "mastery": round(sum(scores) / len(scores), 1) if scores else None,
        "next_lesson_key": nxt["key"] if nxt else None,
        "resume_lesson_key": resume or (nxt["key"] if nxt else None),
    }


def recommendations(course: Course) -> list[dict]:
    """Adaptive next steps based on quiz results, assessment and progress."""
    stats = course_stats(course)
    idx = {x["key"]: x for x in lesson_index(course)}
    recs: list[dict] = []
    for lp in course.lessons:
        if lp.best_quiz_score is not None and lp.best_quiz_score < PASS_MARK and lp.lesson_key in idx:
            recs.append({"kind": "review", "title": f"Review “{idx[lp.lesson_key]['title']}”",
                         "detail": f"Best quiz score {lp.best_quiz_score:.0f}%. Try the simpler explanation, then retake the quiz.",
                         "lesson_key": lp.lesson_key})
    if course.assessment_result:
        for mi in course.assessment_result.get("weak_modules", []):
            mods = (course.curriculum or {}).get("modules", [])
            if 0 <= mi < len(mods):
                recs.append({"kind": "review_module", "title": f"Revisit module: {mods[mi]['title']}",
                             "detail": "You missed several assessment questions from this module.",
                             "lesson_key": mods[mi]["lessons"][0]["key"]})
    elif stats["progress"] >= 50:
        recs.append({"kind": "assessment", "title": "Take the final assessment",
                     "detail": "Check what you've learned so far and find weak spots."})
    if stats["progress"] >= 75 and not course.project_submission:
        recs.append({"kind": "project", "title": f"Build the project: {(course.curriculum or {}).get('project', {}).get('title', 'Capstone')}",
                     "detail": "Apply the course in a practical project and get AI feedback."})
    if (stats["mastery"] or 0) >= 70 and stats["completed_lessons"] >= 2:
        recs.append({"kind": "interview", "title": f"Practise an interview on {course.topic}",
                     "detail": "Your quiz scores are strong — test yourself under interview conditions.",
                     "href": f"/interview/new?topics={course.topic}"})
    if stats["resume_lesson_key"] and not any(r.get("lesson_key") == stats["resume_lesson_key"] for r in recs):
        lesson = idx.get(stats["resume_lesson_key"])
        if lesson:
            recs.insert(0, {"kind": "continue", "title": f"Continue: {lesson['title']}",
                            "detail": lesson["module_title"], "lesson_key": lesson["key"]})
    return recs[:6]


# ---------- prompts ----------
def _lang(user: User) -> str:
    return user.preferred_language or "English"


def curriculum_messages(course: Course, user: User) -> list[dict]:
    known = ", ".join(user.skills) or "not specified"
    system = f"""You are an expert curriculum designer and teacher. Design a practical course.
Topic: {course.topic}
Learner's starting level: {course.level}
Learner's goal: {course.goal or 'general mastery'}
Time available: about {course.hours_per_week} hours per week
Skills the learner already has: {known}

Rules:
- 3 to 6 modules that progress from the learner's level towards advanced use. 2 to 5 lessons per module.
- Lessons must be concrete and teachable in 20-40 minutes each. No duplicate lessons.
- Module objectives are measurable ("Explain...", "Build...", "Compare...").
- Include one capstone project that applies the whole course.
- Write in {_lang(user)}.
Reply with JSON only:
{{"title": "...", "description": "2-3 sentences", "outcomes": ["what the learner can do after the course"],
  "modules": [{{"title": "...", "summary": "...", "objectives": ["..."],
               "lessons": [{{"title": "...", "summary": "one sentence"}}]}}],
  "project": {{"title": "...", "brief": "what to build and why", "requirements": ["..."], "stretch": ["optional extensions"]}}}}"""
    return [{"role": "system", "content": system}, {"role": "user", "content": "Design the course now."}]


def lesson_messages(course: Course, user: User, lesson: dict) -> list[dict]:
    mods = course.curriculum["modules"]
    module = mods[lesson["module_index"]]
    prior = [x["title"] for x in lesson_index(course)[: lesson["position"]]][-6:]
    system = f"""You are a patient, expert tutor writing one lesson of the course "{course.title}" ({course.topic}).
Learner level: {course.level}. Learner goal: {course.goal or 'general mastery'}.
Module: {module['title']} — objectives: {'; '.join(module.get('objectives', []))}
Lessons already covered: {', '.join(prior) or 'none (this is the first lesson)'}
This lesson: {lesson['title']} — {lesson['summary']}

Write the lesson in {_lang(user)} using Markdown (headings, lists, and fenced code blocks when code helps).
- explanation: a clear teaching text of 350-700 words that builds intuition before details.
- examples: 2-3 worked examples.
- key_points: 3-6 bullet takeaways.
- exercises: 2 practical exercises. Each has 2-3 progressive hints (nudges, NOT the answer) and a full worked solution.
- quiz: 4-5 multiple-choice questions testing understanding (not trivia), each with 4 options, the 0-based answer_index and a short explanation.
Reply with JSON only:
{{"objectives": ["..."], "explanation": "markdown", "examples": [{{"title": "...", "content": "markdown"}}],
  "key_points": ["..."], "exercises": [{{"prompt": "markdown", "hints": ["...", "..."], "solution": "markdown"}}],
  "quiz": [{{"question": "...", "options": ["A", "B", "C", "D"], "answer_index": 0, "explanation": "..."}}]}}"""
    return [{"role": "system", "content": system}, {"role": "user", "content": "Write the lesson now."}]


def remedial_messages(course: Course, user: User, lesson: dict, content: dict, missed: list[str]) -> list[dict]:
    system = f"""You are a tutor helping a learner who struggled with the lesson "{lesson['title']}" in "{course.title}".
They answered these quiz questions incorrectly: {json.dumps(missed, ensure_ascii=False) if missed else 'unknown'}.
Original explanation (for reference): {content.get('explanation', '')[:3000]}

Explain the same ideas again more simply, in {_lang(user)}, using Markdown: shorter sentences, an everyday analogy, and
2 small step-by-step examples. Finish with 3 quick self-check questions (no answers).
Reply with JSON only: {{"explanation": "markdown", "analogy": "...", "examples": [{{"title": "...", "content": "markdown"}}], "check_yourself": ["..."]}}"""
    return [{"role": "system", "content": system}, {"role": "user", "content": "Write the simpler explanation."}]


def exercise_check_messages(lesson_title: str, exercise: dict, answer: str, language: str) -> list[dict]:
    system = f"""You are a supportive tutor checking a learner's attempt at an exercise from the lesson "{lesson_title}".
Exercise: {exercise['prompt']}
Reference solution (PRIVATE — never reveal it or quote it): {exercise['solution']}

Judge the attempt. Give specific feedback on what is right and what is missing, and one next step.
Do NOT give away the full solution; guide them toward it. Write in {language}.
Reply with JSON only: {{"verdict": "correct" | "partially_correct" | "incorrect", "feedback": "markdown", "next_step": "..."}}"""
    return [{"role": "system", "content": system}, {"role": "user", "content": f"Learner's attempt:\n{answer[:6000]}"}]


def assessment_messages(course: Course, user: User) -> list[dict]:
    outline = "\n".join(
        f"Module {i}: {m['title']} — lessons: {', '.join(lesson['title'] for lesson in m['lessons'])}"
        for i, m in enumerate(course.curriculum["modules"]))
    system = f"""You write fair end-of-course assessments. Course: "{course.title}" (level {course.level}).
{outline}

Write 10 multiple-choice questions covering every module (use the module number as module_index, 0-based).
Mix recall, understanding and application. 4 options each, exactly one correct. Write in {_lang(user)}.
Reply with JSON only: {{"questions": [{{"question": "...", "options": ["...", "...", "...", "..."], "answer_index": 0, "explanation": "...", "module_index": 0}}]}}"""
    return [{"role": "system", "content": system}, {"role": "user", "content": "Write the assessment."}]


def project_feedback_messages(course: Course, user: User, submission: str) -> list[dict]:
    p = course.curriculum["project"]
    system = f"""You are a fair, encouraging reviewer for the capstone project of the course "{course.title}".
Project: {p['title']} — {p['brief']}
Requirements: {json.dumps(p.get('requirements', []), ensure_ascii=False)}

Review the learner's submission (a description, code, or links). Score 0-100 using a rubric of 3-5 criteria
based on the requirements. Only judge what is in the submission; if links are given you cannot open them,
so say so and judge the description. Write in {_lang(user)}.
Reply with JSON only: {{"score": 0, "summary": "...", "strengths": ["..."], "improvements": ["..."],
  "rubric": [{{"criterion": "...", "score": 0, "comment": "..."}}]}}"""
    return [{"role": "system", "content": system}, {"role": "user", "content": f"Submission:\n{submission[:12000]}"}]


# ---------- jobs ----------
def build_curriculum_job(course_id: int):
    def run(db: Session, ctx: JobContext, llm: LLMProvider):
        course = db.get(Course, course_id)
        user = db.get(User, course.user_id)
        ctx.progress(10, "Designing your curriculum")
        out = generate_json(llm, curriculum_messages(course, user), CurriculumOut, temperature=0.5)
        data = out.model_dump()
        for mi, m in enumerate(data["modules"], start=1):
            for li, lesson in enumerate(m["lessons"], start=1):
                lesson["key"] = f"m{mi}l{li}"
        course.title, course.description, course.outcomes = out.title, out.description, out.outcomes
        course.curriculum = {"modules": data["modules"], "project": data["project"]}
        course.status, course.error, course.model_name = "ready", None, llm.model
        db.commit()
        record_activity(db, user, "course_created", f"Started the course: {course.title}", f"/learn/{course.id}")
    return run


def build_lesson_job(course_id: int, key: str):
    def run(db: Session, ctx: JobContext, llm: LLMProvider):
        course = db.get(Course, course_id)
        user = db.get(User, course.user_id)
        lesson = find_lesson(course, key)
        ctx.progress(10, f"Writing “{lesson['title']}”")
        out = generate_json(llm, lesson_messages(course, user, lesson), LessonOut, temperature=0.5)
        lp = get_or_create_progress(db, course, key)
        lp.content = out.model_dump()
        if lp.status == "not_started":
            lp.status = "in_progress"
        db.commit()
    return run


def build_remedial_job(course_id: int, key: str):
    def run(db: Session, ctx: JobContext, llm: LLMProvider):
        course = db.get(Course, course_id)
        user = db.get(User, course.user_id)
        lesson = find_lesson(course, key)
        lp = get_or_create_progress(db, course, key)
        last = (lp.content or {}).get("_last_quiz") or {}
        quiz = (lp.content or {}).get("quiz", [])
        missed = [quiz[i]["question"] for i, r in enumerate(last.get("results", [])) if not r.get("correct") and i < len(quiz)]
        ctx.progress(15, "Writing a simpler explanation")
        out = generate_json(llm, remedial_messages(course, user, lesson, lp.content or {}, missed), RemedialOut,
                            temperature=0.6)
        lp.remedial = out.model_dump()
        db.commit()
    return run


def build_assessment_job(course_id: int):
    def run(db: Session, ctx: JobContext, llm: LLMProvider):
        course = db.get(Course, course_id)
        user = db.get(User, course.user_id)
        ctx.progress(15, "Writing your assessment")
        out = generate_json(llm, assessment_messages(course, user), AssessmentOut, temperature=0.4)
        nmods = len(course.curriculum["modules"])
        qs = out.model_dump()["questions"]
        for q in qs:
            q["module_index"] = q["module_index"] if 0 <= q["module_index"] < nmods else 0
        course.assessment = {"questions": qs, "created_at": datetime.now(timezone.utc).isoformat()}
        course.assessment_result = None
        db.commit()
    return run


def build_project_job(course_id: int):
    def run(db: Session, ctx: JobContext, llm: LLMProvider):
        course = db.get(Course, course_id)
        user = db.get(User, course.user_id)
        ctx.progress(20, "Reviewing your project")
        out = generate_json(llm, project_feedback_messages(course, user, course.project_submission or ""),
                            ProjectFeedbackOut, temperature=0.3)
        course.project_feedback = out.model_dump()
        db.commit()
        record_activity(db, user, "project_reviewed", f"Got feedback on the project for {course.title}",
                        f"/learn/{course.id}/project")
    return run


# ---------- state changes ----------
def get_or_create_progress(db: Session, course: Course, key: str) -> LessonProgress:
    lp = next((x for x in course.lessons if x.lesson_key == key), None)
    if not lp:
        lp = LessonProgress(lesson_key=key, hints_revealed={}, solutions_revealed=[], exercise_feedback={})
        course.lessons.append(lp)
        db.flush()
    return lp


def grade(questions: list[dict], answers: list[int | None]) -> tuple[float, list[dict]]:
    results = []
    for i, q in enumerate(questions):
        chosen = answers[i] if i < len(answers) else None
        results.append({"chosen": chosen, "correct_index": q["answer_index"], "correct": chosen == q["answer_index"],
                        "explanation": q.get("explanation", "")})
    score = round(100 * sum(r["correct"] for r in results) / len(results), 1) if results else 0.0
    return score, results


def mark_completed(db: Session, user: User, course: Course, lp: LessonProgress, title: str) -> None:
    if lp.status == "completed":
        return
    lp.status = "completed"
    lp.completed_at = datetime.now(timezone.utc)
    db.commit()
    record_activity(db, user, "lesson_completed", f"Completed lesson: {title}", f"/learn/{course.id}/{lp.lesson_key}")
    stats = course_stats(course)
    if stats["total_lessons"] and stats["completed_lessons"] == stats["total_lessons"] and course.status != "completed":
        course.status = "completed"
        course.completed_at = datetime.now(timezone.utc)
        db.commit()
        record_activity(db, user, "course_completed", f"Completed the course: {course.title}", f"/learn/{course.id}")


def public_lesson(lp: LessonProgress | None) -> dict | None:
    """Lesson content safe to send to the browser: quiz answers and unrevealed hints/solutions removed."""
    if not lp or not lp.content:
        return None
    c = lp.content
    exercises = []
    for i, ex in enumerate(c.get("exercises", [])):
        shown = int(lp.hints_revealed.get(str(i), 0))
        exercises.append({
            "prompt": ex["prompt"],
            "hints": ex["hints"][:shown],
            "hints_total": len(ex["hints"]),
            "solution": ex["solution"] if i in lp.solutions_revealed else None,
            "feedback": lp.exercise_feedback.get(str(i)),
        })
    return {
        "objectives": c.get("objectives", []),
        "explanation": c.get("explanation", ""),
        "examples": c.get("examples", []),
        "key_points": c.get("key_points", []),
        "exercises": exercises,
        "quiz": [{"question": q["question"], "options": q["options"]} for q in c.get("quiz", [])],
        "last_quiz": c.get("_last_quiz"),
        "remedial": lp.remedial,
    }
