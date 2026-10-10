"""Phase 2: courses, lessons and learning progress."""

from datetime import datetime

from sqlalchemy import JSON, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base
from .models import DateTime, utcnow


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    topic: Mapped[str] = mapped_column(String(200))
    level: Mapped[str] = mapped_column(String(20))
    goal: Mapped[str] = mapped_column(String(500), default="")
    hours_per_week: Mapped[int] = mapped_column(Integer, default=5)
    status: Mapped[str] = mapped_column(String(20), default="generating")  # generating | ready | failed | completed
    title: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    outcomes: Mapped[list] = mapped_column(JSON, default=list)
    curriculum: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # modules -> lessons, capstone project
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_lesson_key: Mapped[str | None] = mapped_column(String(20), nullable=True)
    assessment: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # includes answers; never sent raw
    assessment_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    project_submission: Mapped[str | None] = mapped_column(Text, nullable=True)
    project_feedback: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    model_name: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    lessons: Mapped[list["LessonProgress"]] = relationship(
        back_populates="course", cascade="all, delete-orphan", passive_deletes=True)


class LessonProgress(Base):
    __tablename__ = "lesson_progress"
    __table_args__ = (UniqueConstraint("course_id", "lesson_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    lesson_key: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="not_started")  # not_started | in_progress | completed
    content: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # includes quiz answers + solutions
    remedial: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    hints_revealed: Mapped[dict] = mapped_column(JSON, default=dict)  # exercise index -> hints shown
    solutions_revealed: Mapped[list] = mapped_column(JSON, default=list)
    exercise_feedback: Mapped[dict] = mapped_column(JSON, default=dict)  # exercise index -> last AI feedback
    quiz_attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_quiz_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    best_quiz_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    course: Mapped[Course] = relationship(back_populates="lessons")
