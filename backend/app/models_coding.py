"""Phase 4: coding problems, drafts and submissions."""

from datetime import datetime

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base
from .models import DateTime, utcnow


class Problem(Base):
    __tablename__ = "problems"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    difficulty: Mapped[str] = mapped_column(String(10))  # Easy | Medium | Hard
    topic: Mapped[str] = mapped_column(String(60))
    statement: Mapped[str] = mapped_column(Text)  # markdown
    input_format: Mapped[str] = mapped_column(Text)
    output_format: Mapped[str] = mapped_column(Text)
    constraints: Mapped[str] = mapped_column(Text, default="")
    samples: Mapped[list] = mapped_column(JSON)  # [{input, output, explanation}]
    tests: Mapped[list] = mapped_column(JSON)  # [{input, output}] hidden
    hints: Mapped[list] = mapped_column(JSON, default=list)
    explanation: Mapped[str] = mapped_column(Text, default="")  # editorial, revealed on request
    expected_complexity: Mapped[str] = mapped_column(String(120), default="")


class CodeDraft(Base):
    __tablename__ = "code_drafts"
    __table_args__ = (UniqueConstraint("user_id", "problem_id", "language"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    problem_id: Mapped[int] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"))
    language: Mapped[str] = mapped_column(String(20))
    code: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ProblemProgress(Base):
    __tablename__ = "problem_progress"
    __table_args__ = (UniqueConstraint("user_id", "problem_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    problem_id: Mapped[int] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"))
    hints_revealed: Mapped[int] = mapped_column(Integer, default=0)
    explanation_revealed: Mapped[bool] = mapped_column(Boolean, default=False)
    solved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_language: Mapped[str | None] = mapped_column(String(20), nullable=True)


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    problem_id: Mapped[int] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"), index=True)
    language: Mapped[str] = mapped_column(String(20))
    code: Mapped[str] = mapped_column(Text)
    verdict: Mapped[str] = mapped_column(String(30))  # accepted|wrong_answer|runtime_error|compile_error|time_limit|error
    passed: Mapped[int] = mapped_column(Integer, default=0)
    total: Mapped[int] = mapped_column(Integer, default=0)
    max_time_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    results: Mapped[list] = mapped_column(JSON, default=list)
    ai_review: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
