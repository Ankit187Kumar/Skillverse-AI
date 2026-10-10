from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

ExperienceLevel = Literal["Beginner", "Intermediate", "Advanced"]
InterviewType = Literal["Technical", "HR", "Behavioral", "Personality", "Domain-Specific", "Custom"]
Difficulty = Literal["Easy", "Medium", "Hard"]


def _clean_list(values: list[str], max_items: int = 30, max_len: int = 60) -> list[str]:
    out: list[str] = []
    for v in values:
        v = v.strip()[:max_len]
        if v and v.lower() not in {o.lower() for o in out}:
            out.append(v)
    return out[:max_items]


# ---------- Auth ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    full_name: str = Field(min_length=1, max_length=120)

    @field_validator("password")
    @classmethod
    def strong_enough(cls, v: str) -> str:
        if v.isalpha() or v.isdigit():
            raise ValueError("Password must mix letters with numbers or symbols.")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    headline: str
    experience_level: str
    skills: list[str]
    target_roles: list[str]
    learning_goals: list[str]
    preferred_language: str
    streak_count: int
    created_at: datetime


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    headline: str | None = Field(default=None, max_length=200)
    experience_level: ExperienceLevel | None = None
    skills: list[str] | None = None
    target_roles: list[str] | None = None
    learning_goals: list[str] | None = None
    preferred_language: str | None = Field(default=None, min_length=2, max_length=40)

    @field_validator("skills", "target_roles")
    @classmethod
    def clean(cls, v):
        return _clean_list(v) if v is not None else v

    @field_validator("learning_goals")
    @classmethod
    def clean_goals(cls, v):
        return _clean_list(v, max_items=10, max_len=160) if v is not None else v


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=72)
    new_password: str = Field(min_length=8, max_length=72)


class DeleteAccountIn(BaseModel):
    password: str = Field(min_length=1, max_length=72)


# ---------- Resumes ----------
class ResumeParsed(BaseModel):
    summary: str = ""
    skills: list[str] = Field(default_factory=list)
    experience: list[str] = Field(default_factory=list)
    education: list[str] = Field(default_factory=list)
    projects: list[str] = Field(default_factory=list)


class ResumeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    size_bytes: int
    parsed: ResumeParsed | None
    parse_error: str | None
    created_at: datetime
    text_preview: str = ""


# ---------- Interviews ----------
class InterviewConfig(BaseModel):
    interview_type: InterviewType = "Technical"
    role: str = Field(min_length=2, max_length=100)
    skills: list[str] = Field(default_factory=list)
    experience_level: ExperienceLevel = "Intermediate"
    difficulty: Difficulty = "Medium"
    duration_minutes: int = Field(default=15, ge=5, le=60)
    language: str = Field(default="English", min_length=2, max_length=40)
    mode: Literal["text", "voice"] = "text"
    topics: str = Field(default="", max_length=500)
    goals: str = Field(default="", max_length=500)
    resume_id: int | None = None

    @field_validator("skills")
    @classmethod
    def clean(cls, v):
        return _clean_list(v, max_items=20)


class TurnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    kind: str
    content: str
    created_at: datetime


class InterviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    config: InterviewConfig
    status: str
    target_questions: int
    questions_asked: int
    model_name: str
    elapsed_seconds: int
    started_at: datetime
    ended_at: datetime | None
    turns: list[TurnOut]
    overall_score: float | None = None


class InterviewSummary(BaseModel):
    id: int
    role: str
    interview_type: str
    difficulty: str
    status: str
    started_at: datetime
    overall_score: float | None


class AnswerIn(BaseModel):
    answer: str = Field(min_length=1, max_length=6000)
    elapsed_seconds: int | None = Field(default=None, ge=0, le=60 * 60 * 3)


class EndIn(BaseModel):
    elapsed_seconds: int | None = Field(default=None, ge=0, le=60 * 60 * 3)


class AnswerResult(BaseModel):
    interview: InterviewOut
    done: bool


# ---------- Report ----------
class ScoreSet(BaseModel):
    accuracy: float = Field(ge=0, le=100)
    technical_knowledge: float = Field(ge=0, le=100)
    communication: float = Field(ge=0, le=100)
    problem_solving: float = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=100)


class QuestionFeedback(BaseModel):
    question: str
    answer_summary: str = ""
    score: float = Field(ge=0, le=100)
    feedback: str
    suggested_answer: str


class ReportData(BaseModel):
    summary: str
    scores: ScoreSet
    strengths: list[str]
    weaknesses: list[str]
    question_feedback: list[QuestionFeedback]
    improvement_tips: list[str]
    recommended_lessons: list[str]
    practice_questions: list[str]
    skill_gaps: list[str] = Field(default_factory=list)
    confidence_signals: list[str] = Field(default_factory=list)


class ReportOut(BaseModel):
    interview_id: int
    status: str
    overall_score: float | None
    data: ReportData | None
    error: str | None
    model_name: str
    created_at: datetime
    criteria: dict[str, str]
    weights: dict[str, float]
