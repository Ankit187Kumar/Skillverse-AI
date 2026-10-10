"""Phase 5: progress analytics, goals, badges and personalised recommendations."""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta, timezone

from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..models import Activity, Interview, User
from ..models_coding import Problem, ProblemProgress, Submission
from ..models_learning import Course
from ..models_platform import Insight
from ..models_research import ResearchProject
from . import learning as L
from .jobs import JobContext
from .llm import LLMProvider, generate_json

PRACTICE_KINDS = {"interview_completed", "lesson_completed", "quiz_passed", "problem_solved", "problem_attempted",
                  "research_completed", "assessment_completed", "project_reviewed"}
GOAL_KINDS = {"interviews": "interview_completed", "lessons": "lesson_completed", "problems": "problem_solved",
              "research": "research_completed"}
CRITERIA = {"accuracy": "Answer accuracy", "technical_knowledge": "Role knowledge", "communication": "Communication",
            "problem_solving": "Problem solving", "confidence": "Confident delivery"}


def local_date(dt: datetime, tz_minutes: int) -> date:
    return (dt.astimezone(timezone.utc) + timedelta(minutes=tz_minutes)).date()


def today_local(tz_minutes: int) -> date:
    return local_date(datetime.now(timezone.utc), tz_minutes)


def activity_days(db: Session, user_id: int, tz: int, since_days: int = 400) -> Counter:
    since = datetime.now(timezone.utc) - timedelta(days=since_days)
    rows = db.scalars(select(Activity.created_at).where(Activity.user_id == user_id, Activity.created_at >= since,
                                                        Activity.kind.in_(PRACTICE_KINDS)))
    return Counter(local_date(r, tz) for r in rows)


def streaks(days: Counter, today: date) -> tuple[int, int]:
    """(current streak ending today or yesterday, best streak)."""
    current = 0
    d = today if days.get(today) else today - timedelta(days=1)
    while days.get(d):
        current += 1
        d -= timedelta(days=1)
    best = run = 0
    prev = None
    for day in sorted(days):
        run = run + 1 if prev and day - prev == timedelta(days=1) else 1
        best = max(best, run)
        prev = day
    return current, max(best, current)


def goals_progress(db: Session, user: User, tz: int) -> dict:
    today = today_local(tz)
    week_start = today - timedelta(days=today.weekday())
    since = datetime.combine(week_start, datetime.min.time(), tzinfo=timezone.utc) - timedelta(minutes=tz)
    rows = db.execute(select(Activity.kind, Activity.created_at).where(Activity.user_id == user.id,
                                                                      Activity.created_at >= since)).all()
    week = Counter(kind for kind, _ in rows)
    today_count = sum(1 for kind, at in rows if kind in PRACTICE_KINDS and local_date(at, tz) == today)
    goals = user.weekly_goals or {}
    weekly = [{"key": k, "label": {"interviews": "Mock interviews", "lessons": "Lessons", "problems": "Problems solved",
                                   "research": "Research reports"}[k],
               "done": week.get(kind, 0), "target": int(goals.get(k, 0))} for k, kind in GOAL_KINDS.items()]
    return {"week_start": week_start.isoformat(), "weekly": weekly,
            "daily": {"done": today_count, "target": user.daily_goal},
            "weekly_complete": all(g["done"] >= g["target"] for g in weekly if g["target"])}


def _interviews(db: Session, user: User) -> list[Interview]:
    return list(db.scalars(select(Interview).where(Interview.user_id == user.id)
                           .options(selectinload(Interview.report)).order_by(Interview.started_at.asc())))


def coding_summary(db: Session, user: User) -> dict:
    solved_rows = db.execute(select(Problem.slug, Problem.difficulty, Problem.topic)
                             .join(ProblemProgress, ProblemProgress.problem_id == Problem.id)
                             .where(ProblemProgress.user_id == user.id, ProblemProgress.solved_at.is_not(None))).all()
    all_problems = db.execute(select(Problem.slug, Problem.title, Problem.difficulty, Problem.topic)).all()
    subs = db.execute(select(Submission.verdict, Submission.problem_id).where(Submission.user_id == user.id)).all()
    attempted_ids = {pid for _, pid in subs}
    slug_by_id = dict(db.execute(select(Problem.id, Problem.slug)).all())
    attempted = {slug_by_id[i] for i in attempted_ids if i in slug_by_id}
    solved = {r.slug for r in solved_rows}
    topics: dict[str, dict] = {}
    for p in all_problems:
        t = topics.setdefault(p.topic, {"topic": p.topic, "solved": 0, "attempted": 0, "total": 0})
        t["total"] += 1
        t["solved"] += p.slug in solved
        t["attempted"] += p.slug in attempted
    accepted = sum(v == "accepted" for v, _ in subs)
    return {
        "solved": len(solved), "total": len(all_problems), "submissions": len(subs),
        "acceptance_rate": round(100 * accepted / len(subs), 1) if subs else None,
        "by_difficulty": {d: {"solved": sum(1 for r in solved_rows if r.difficulty == d),
                              "total": sum(1 for p in all_problems if p.difficulty == d)} for d in ("Easy", "Medium", "Hard")},
        "topics": sorted(topics.values(), key=lambda t: t["topic"]),
        "next_unsolved": [{"slug": p.slug, "title": p.title, "difficulty": p.difficulty, "topic": p.topic}
                          for p in sorted(all_problems, key=lambda p: ({"Easy": 0, "Medium": 1, "Hard": 2}[p.difficulty], p.title))
                          if p.slug not in solved],
        "hard_solved": sum(1 for r in solved_rows if r.difficulty == "Hard"),
    }


def learning_summary(db: Session, user: User) -> dict:
    courses = list(db.scalars(select(Course).where(Course.user_id == user.id).options(selectinload(Course.lessons))
                              .order_by(Course.updated_at.desc())))
    ready = [c for c in courses if c.curriculum]
    items = []
    total_lessons = done_lessons = 0
    weak_lessons = []
    quizzes_passed = 0
    for c in ready:
        st = L.course_stats(c)
        total_lessons += st["total_lessons"]
        done_lessons += st["completed_lessons"]
        idx = {x["key"]: x for x in L.lesson_index(c)}
        for lp in c.lessons:
            if lp.best_quiz_score is not None and lp.best_quiz_score >= L.PASS_MARK:
                quizzes_passed += 1
            if lp.best_quiz_score is not None and lp.best_quiz_score < L.PASS_MARK and lp.lesson_key in idx:
                weak_lessons.append({"course_id": c.id, "course": c.title, "lesson_key": lp.lesson_key,
                                     "title": idx[lp.lesson_key]["title"], "score": lp.best_quiz_score})
        resume = idx.get(st["resume_lesson_key"] or "")
        items.append({"id": c.id, "title": c.title, "topic": c.topic, "status": c.status, **st,
                      "resume_title": resume["title"] if resume else None,
                      "project_score": c.project_feedback["score"] if c.project_feedback else None,
                      "assessment_score": c.assessment_result["score"] if c.assessment_result else None})
    return {
        "courses": items, "completed_courses": [i for i in items if i["status"] == "completed"],
        "lessons_total": total_lessons, "lessons_completed": done_lessons,
        "progress": round(100 * done_lessons / total_lessons) if total_lessons else 0,
        "weak_lessons": weak_lessons[:10], "quizzes_passed": quizzes_passed,
        "projects": [{"course": i["title"], "score": i["project_score"]} for i in items if i["project_score"] is not None],
    }


def interview_summary(interviews: list[Interview]) -> dict:
    completed = [i for i in interviews if i.status == "completed"]
    scored = [i for i in completed if i.report and i.report.status == "ready" and i.report.overall_score is not None]
    recent = [i.report.data for i in scored[-10:]]
    criteria = []
    for k, label in CRITERIA.items():
        vals = [r["scores"][k] for r in recent]
        criteria.append({"key": k, "label": label, "score": round(sum(vals) / len(vals), 1) if vals else None})
    gaps = Counter()
    for r in [i.report.data for i in scored[-5:]]:
        for g in r.get("skill_gaps", []):
            gaps[g.strip()] += 1
    by_type: dict[str, list[float]] = {}
    for i in scored:
        by_type.setdefault(i.config["interview_type"], []).append(i.report.overall_score)
    return {
        "completed": len(completed),
        "average": round(sum(i.report.overall_score for i in scored) / len(scored), 1) if scored else None,
        "best": max((i.report.overall_score for i in scored), default=None),
        "trend": [{"id": i.id, "date": i.started_at.date().isoformat(), "score": i.report.overall_score,
                   "role": i.config["role"], "type": i.config["interview_type"]} for i in scored[-20:]],
        "by_type": [{"type": t, "average": round(sum(v) / len(v), 1), "count": len(v)} for t, v in sorted(by_type.items())],
        "criteria": criteria,
        "skill_gaps": [{"skill": g, "count": n} for g, n in gaps.most_common(8)],
        "in_progress": next(({"id": i.id, "role": i.config["role"]} for i in reversed(interviews) if i.status == "in_progress"), None),
        "minutes": round(sum(i.elapsed_seconds for i in completed) / 60),
    }


def badges(user: User, iv: dict, lr: dict, cd: dict, research_done: int, best_streak: int) -> list[dict]:
    defs = [
        ("first_step", "First Step", "Complete your first mock interview", iv["completed"] >= 1),
        ("consistent", "Consistent", "Complete 5 mock interviews", iv["completed"] >= 5),
        ("high_flyer", "High Flyer", "Score 80+ in an interview", (iv["best"] or 0) >= 80),
        ("lifelong_learner", "Lifelong Learner", "Start your first course", bool(lr["courses"])),
        ("quiz_master", "Quiz Master", "Pass 5 lesson quizzes", lr["quizzes_passed"] >= 5),
        ("graduate", "Graduate", "Complete a whole course", bool(lr["completed_courses"])),
        ("builder", "Builder", "Get a capstone project reviewed", bool(lr["projects"])),
        ("hello_world", "Hello, World", "Solve your first coding problem", cd["solved"] >= 1),
        ("problem_solver", "Problem Solver", "Solve 10 coding problems", cd["solved"] >= 10),
        ("hard_mode", "Hard Mode", "Solve a Hard problem", cd["hard_solved"] >= 1),
        ("researcher", "Researcher", "Finish a research report", research_done >= 1),
        ("on_fire", "On Fire", "Keep a 3-day streak", best_streak >= 3),
        ("unstoppable", "Unstoppable", "Keep a 7-day streak", best_streak >= 7),
        ("well_prepared", "Well Prepared", "Upload a resume", bool(user.resumes)),
    ]
    return [{"id": i, "title": t, "description": d, "earned": bool(e)} for i, t, d, e in defs]


def recommendations(user: User, iv: dict, lr: dict, cd: dict, research_done: int, goals: dict) -> list[dict]:
    """Rule-based next steps that link learning, interviews and coding together."""
    recs: list[tuple[int, dict]] = []

    def add(priority: int, kind: str, title: str, detail: str, href: str):
        recs.append((priority, {"kind": kind, "title": title, "detail": detail, "href": href}))

    if iv["in_progress"]:
        add(100, "interview", f"Finish your {iv['in_progress']['role']} interview", "You left it part-way through.",
            f"/interview/{iv['in_progress']['id']}")
    for c in lr["courses"]:
        if c["status"] == "ready" and c["resume_lesson_key"]:
            add(80, "learn", f"Continue {c['title']}", f"Next: {c['resume_title']} · {c['progress']}% done",
                f"/learn/{c['id']}/{c['resume_lesson_key']}")
            break
    for w in lr["weak_lessons"][:1]:
        add(75, "review", f"Review “{w['title']}”", f"Your best quiz score was {w['score']:.0f}%.",
            f"/learn/{w['course_id']}/{w['lesson_key']}")
    course_topics = {c["topic"].lower() for c in lr["courses"]} | {c["title"].lower() for c in lr["courses"]}
    for g in iv["skill_gaps"][:2]:
        if not any(g["skill"].lower() in t or t in g["skill"].lower() for t in course_topics):
            add(70, "learn", f"Close a skill gap: {g['skill']}",
                f"Flagged in {g['count']} recent interview report{'s' if g['count'] > 1 else ''}.",
                f"/learn/new?topic={g['skill']}")
    weak = [c for c in iv["criteria"] if c["score"] is not None and c["score"] < 65]
    if weak:
        w = min(weak, key=lambda c: c["score"])
        practice = "Behavioral" if w["key"] in ("communication", "confidence") else "Technical"
        add(65, "interview", f"Practise {w['label'].lower()}", f"Your average is {w['score']:.0f}. Try a {practice} interview.",
            f"/interview/new?goals=Improve my {w['label'].lower()}")
    for c in lr["courses"]:
        if (c["mastery"] or 0) >= 70 and c["completed_lessons"] >= 2:
            add(55, "interview", f"Interview on {c['topic']}", f"Your {c['topic']} mastery is {c['mastery']:.0f}%.",
                f"/interview/new?topics={c['topic']}")
            break
    if cd["next_unsolved"]:
        weak_topics = [t for t in cd["topics"] if t["attempted"] > t["solved"]]
        pick = None
        if weak_topics:
            pick = next((p for p in cd["next_unsolved"] if p["topic"] == weak_topics[0]["topic"]), None)
        pick = pick or cd["next_unsolved"][0]
        add(60 if cd["solved"] else 50, "coding", f"Solve: {pick['title']}", f"{pick['difficulty']} · {pick['topic']}",
            f"/coding/{pick['slug']}")
    if not lr["courses"]:
        add(45, "learn", "Start a learning path", "Pick any skill and get a personalised course.", "/learn/new")
    if iv["completed"] == 0 and not iv["in_progress"]:
        add(90, "interview", "Take your first mock interview", "It takes about 15 minutes.", "/interview/new")
    if research_done == 0:
        add(30, "research", "Try the research agent", "Get a cited report on any question.", "/research")
    behind = [g for g in goals["weekly"] if g["target"] and g["done"] < g["target"]]
    if behind and datetime.now(timezone.utc).weekday() >= 4:
        g = behind[0]
        add(58, "goal", f"Weekly goal: {g['label']}", f"{g['done']}/{g['target']} done this week.", "/progress")
    return [r for _, r in sorted(recs, key=lambda x: -x[0])][:6]


def overview(db: Session, user: User, tz: int) -> dict:
    interviews = _interviews(db, user)
    iv = interview_summary(interviews)
    lr = learning_summary(db, user)
    cd = coding_summary(db, user)
    research_done = db.scalar(select(func.count()).select_from(ResearchProject).where(
        ResearchProject.user_id == user.id, ResearchProject.status == "ready")) or 0
    days = activity_days(db, user.id, tz)
    today = today_local(tz)
    current, best = streaks(days, today)
    heat = [{"date": (today - timedelta(days=i)).isoformat(), "count": days.get(today - timedelta(days=i), 0)}
            for i in range(83, -1, -1)]
    goals = goals_progress(db, user, tz)

    skills = [{"skill": c["label"], "score": c["score"], "source": "interviews"} for c in iv["criteria"] if c["score"] is not None]
    skills += [{"skill": c["topic"], "score": c["mastery"], "source": "learning"} for c in lr["courses"] if c["mastery"] is not None]
    skills += [{"skill": f"Coding: {t['topic']}", "score": round(100 * t["solved"] / t["total"]), "source": "coding"}
               for t in cd["topics"] if t["attempted"]]

    weaknesses = [{"title": c["label"], "detail": f"Interview average {c['score']:.0f}", "source": "interviews"}
                  for c in iv["criteria"] if c["score"] is not None and c["score"] < 65]
    weaknesses += [{"title": g["skill"], "detail": f"Skill gap in {g['count']} report(s)", "source": "interviews"}
                   for g in iv["skill_gaps"]]
    weaknesses += [{"title": w["title"], "detail": f"{w['course']}: quiz {w['score']:.0f}%", "source": "learning"}
                   for w in lr["weak_lessons"]]
    weaknesses += [{"title": f"Coding: {t['topic']}", "detail": f"{t['attempted'] - t['solved']} attempted but unsolved",
                    "source": "coding"} for t in cd["topics"] if t["attempted"] > t["solved"]]

    parts = [lr["progress"] if lr["lessons_total"] else None,
             round(100 * cd["solved"] / cd["total"]) if cd["total"] and cd["submissions"] else None,
             min(100, iv["completed"] * 10) if iv["completed"] else None]
    present = [p for p in parts if p is not None]
    return {
        "overall_progress": round(sum(present) / len(present)) if present else 0,
        "interviews": iv, "learning": lr, "coding": cd, "research_completed": research_done,
        "skills": sorted(skills, key=lambda s: -(s["score"] or 0)),
        "weaknesses": weaknesses[:12],
        "streak": {"current": current, "best": best, "heatmap": heat, "active_days": len(days)},
        "goals": goals,
        "badges": badges(user, iv, lr, cd, research_done, best),
        "recommendations": recommendations(user, iv, lr, cd, research_done, goals),
    }


# ---------- AI roadmap ----------
class RoadmapAction(BaseModel):
    label: str
    kind: str = "learn"
    target: str = ""


class FocusArea(BaseModel):
    title: str
    why: str
    actions: list[RoadmapAction] = Field(default_factory=list)


class WeekDay(BaseModel):
    day: str
    tasks: list[str] = Field(default_factory=list)


class RoadmapOut(BaseModel):
    headline: str
    focus_areas: list[FocusArea] = Field(min_length=1, max_length=5)
    weekly_plan: list[WeekDay] = Field(default_factory=list)
    milestones: list[str] = Field(default_factory=list)


def roadmap_messages(user: User, ov: dict) -> list[dict]:
    snapshot = {
        "target_roles": user.target_roles, "skills": user.skills, "goals": user.learning_goals,
        "experience_level": user.experience_level,
        "interviews": {k: ov["interviews"][k] for k in ("completed", "average", "criteria", "skill_gaps")},
        "learning": {"courses": [{"title": c["title"], "progress": c["progress"], "mastery": c["mastery"]}
                                 for c in ov["learning"]["courses"]], "weak_lessons": ov["learning"]["weak_lessons"][:5]},
        "coding": {k: ov["coding"][k] for k in ("solved", "total", "acceptance_rate", "by_difficulty")},
        "weaknesses": ov["weaknesses"], "weekly_goals": user.weekly_goals,
    }
    system = f"""You are a supportive career and learning coach. Create a personalised improvement roadmap from the learner's data.
Be specific to the data (name their actual weak areas, courses and roles). Prioritise 2-4 focus areas, each with 2-4 concrete actions.
Action kinds: learn (a course/lesson topic), interview (a mock interview type/topic), coding (a problem topic), research (a question to research).
Include a realistic 7-day plan that fits their weekly goals, and 3 milestones for the next month. Write in {user.preferred_language or 'English'}.
Reply with JSON only:
{{"headline": "one motivating sentence", "focus_areas": [{{"title": "...", "why": "evidence from the data", "actions": [{{"label": "...", "kind": "learn", "target": "topic or problem area"}}]}}],
  "weekly_plan": [{{"day": "Monday", "tasks": ["..."]}}], "milestones": ["..."]}}"""
    import json as _json
    return [{"role": "system", "content": system}, {"role": "user", "content": _json.dumps(snapshot, ensure_ascii=False)[:9000]}]


def build_roadmap_job(user_id: int, tz: int):
    def run(db: Session, ctx: JobContext, llm: LLMProvider):
        user = db.get(User, user_id)
        ctx.progress(10, "Analysing your progress")
        ov = overview(db, user, tz)
        ctx.progress(30, "Writing your roadmap")
        out = generate_json(llm, roadmap_messages(user, ov), RoadmapOut, temperature=0.5)
        db.add(Insight(user_id=user_id, kind="roadmap", data=out.model_dump(), model_name=llm.model))
        db.commit()
    return run


def latest_insight(db: Session, user_id: int, kind: str) -> Insight | None:
    return db.scalar(select(Insight).where(Insight.user_id == user_id, Insight.kind == kind).order_by(Insight.id.desc()))
