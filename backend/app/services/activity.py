from datetime import date, timedelta

from sqlalchemy.orm import Session

from ..models import Activity, User


def touch_streak(db: Session, user: User, today: date | None = None) -> None:
    """Count consecutive days with at least one practice activity."""
    today = today or date.today()
    if user.last_active_date == today:
        return
    if user.last_active_date == today - timedelta(days=1):
        user.streak_count += 1
    else:
        user.streak_count = 1
    user.last_active_date = today


def current_streak(user: User, today: date | None = None) -> int:
    today = today or date.today()
    if user.last_active_date in (today, today - timedelta(days=1)):
        return user.streak_count
    return 0


PRACTICE = {"interview_completed", "lesson_completed", "quiz_passed", "problem_solved", "problem_attempted",
            "research_completed", "assessment_completed", "project_reviewed", "interview_started", "joined"}


def record_activity(db: Session, user: User, kind: str, title: str, link: str | None = None) -> None:
    db.add(Activity(user_id=user.id, kind=kind, title=title[:255], link=link))
    if kind in PRACTICE:
        touch_streak(db, user)
    db.commit()
