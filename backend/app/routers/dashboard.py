from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Activity, User
from ..services import analytics as A

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

QUOTES = [
    ("The expert in anything was once a beginner.", "Helen Hayes"),
    ("It always seems impossible until it's done.", "Nelson Mandela"),
    ("Practice isn't the thing you do once you're good. It's the thing you do that makes you good.", "Malcolm Gladwell"),
    ("Learning never exhausts the mind.", "Leonardo da Vinci"),
    ("The beautiful thing about learning is that nobody can take it away from you.", "B.B. King"),
    ("Success is the sum of small efforts, repeated day in and day out.", "Robert Collier"),
    ("An investment in knowledge pays the best interest.", "Benjamin Franklin"),
    ("Arise, awake, and stop not till the goal is reached.", "Swami Vivekananda"),
    ("Live as if you were to die tomorrow. Learn as if you were to live forever.", "Mahatma Gandhi"),
    ("You don't have to be great to start, but you have to start to be great.", "Zig Ziglar"),
    ("Dream, dream, dream. Dreams transform into thoughts and thoughts result in action.", "A. P. J. Abdul Kalam"),
    ("Mistakes are proof that you are trying.", "Jennifer Lim"),
]


@router.get("")
def dashboard(tz: int = Query(0, ge=-840, le=840), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ov = A.overview(db, user, tz)
    iv, lr, cd = ov["interviews"], ov["learning"], ov["coding"]
    activities = db.scalars(select(Activity).where(Activity.user_id == user.id)
                            .order_by(Activity.created_at.desc(), Activity.id.desc()).limit(8))
    quote, author = QUOTES[A.today_local(tz).toordinal() % len(QUOTES)] if tz else QUOTES[date.today().toordinal() % len(QUOTES)]
    setup = [
        {"title": "Complete your profile", "done": bool(user.skills and user.target_roles), "href": "/profile"},
        {"title": "Finish a mock interview", "done": iv["completed"] >= 1, "href": "/interview/new"},
        {"title": "Start a learning path", "done": bool(lr["courses"]), "href": "/learn/new"},
        {"title": "Solve a coding problem", "done": cd["solved"] >= 1, "href": "/coding"},
        {"title": "Run a research report", "done": ov["research_completed"] >= 1, "href": "/research"},
    ]
    earned = [b for b in ov["badges"] if b["earned"]]
    locked = [b for b in ov["badges"] if not b["earned"]]
    return {
        "user": {"full_name": user.full_name, "first_name": user.full_name.split()[0], "target_roles": user.target_roles},
        "quote": {"text": quote, "author": author},
        "stats": {
            "interviews_completed": iv["completed"], "average_score": iv["average"], "best_score": iv["best"],
            "practice_minutes": iv["minutes"], "streak": ov["streak"]["current"], "best_streak": ov["streak"]["best"],
            "lessons_completed": lr["lessons_completed"], "problems_solved": cd["solved"],
            "problems_total": cd["total"], "research_completed": ov["research_completed"],
        },
        "overall_progress": ov["overall_progress"],
        "score_trend": iv["trend"][-10:],
        "skill_mastery": [{"key": c["key"], "label": c["label"], "score": c["score"]} for c in iv["criteria"]],
        "recommendations": ov["recommendations"],
        "goals": user.learning_goals,
        "weekly_goals": ov["goals"],
        "courses": [c for c in lr["courses"] if c["status"] != "completed"][:3],
        "coding": {"solved": cd["solved"], "total": cd["total"], "by_difficulty": cd["by_difficulty"]},
        "roadmap": setup,
        "roadmap_progress": round(100 * sum(r["done"] for r in setup) / len(setup)),
        "in_progress_interview": iv["in_progress"],
        "recent_activity": [{"id": a.id, "kind": a.kind, "title": a.title, "link": a.link,
                             "created_at": a.created_at.isoformat()} for a in activities],
        "achievements": (earned + locked)[:5],
        "badges_earned": len(earned), "badges_total": len(ov["badges"]),
    }
