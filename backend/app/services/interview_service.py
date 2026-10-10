from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..models import Interview, InterviewReport, InterviewTurn, Resume, User
from ..schemas import InterviewConfig, InterviewOut, ReportData, TurnOut
from . import prompts
from .activity import record_activity
from .llm import LLMError, LLMProvider, generate_json


class QuestionOut(BaseModel):
    question: str = Field(min_length=3, max_length=1200)
    kind: str = "question"

    @field_validator("kind")
    @classmethod
    def norm_kind(cls, v: str) -> str:
        return "followup" if "follow" in v.lower() else "question"


def target_question_count(duration_minutes: int) -> int:
    """Roughly one question every three minutes, between 3 and 12 questions."""
    return max(3, min(12, round(duration_minutes / 3)))


def _turn_dicts(interview: Interview) -> list[dict]:
    return [{"role": t.role, "kind": t.kind, "content": t.content} for t in interview.turns]


def _resume_summary(db: Session, interview: Interview) -> dict | None:
    if not interview.resume_id:
        return None
    resume = db.get(Resume, interview.resume_id)
    if not resume or resume.user_id != interview.user_id:
        return None
    if resume.parsed:
        return resume.parsed
    return {"raw_text_excerpt": resume.extracted_text[:2500]}


def questions_asked(interview: Interview) -> int:
    return sum(1 for t in interview.turns if t.role == "interviewer" and t.kind in ("question", "followup"))


def _followups_in_row(interview: Interview) -> int:
    count = 0
    for t in reversed(interview.turns):
        if t.role != "interviewer":
            continue
        if t.kind == "followup":
            count += 1
        else:
            break
    return count


def to_out(interview: Interview) -> InterviewOut:
    return InterviewOut(
        id=interview.id,
        config=InterviewConfig.model_validate(interview.config),
        status=interview.status,
        target_questions=interview.target_questions,
        questions_asked=questions_asked(interview),
        model_name=interview.model_name,
        elapsed_seconds=interview.elapsed_seconds,
        started_at=interview.started_at,
        ended_at=interview.ended_at,
        turns=[TurnOut.model_validate(t) for t in interview.turns],
        overall_score=interview.report.overall_score if interview.report else None,
    )


def _ask_next(db: Session, llm: LLMProvider, interview: Interview) -> InterviewTurn:
    number = questions_asked(interview) + 1
    msgs = prompts.next_question_messages(
        interview.config, _resume_summary(db, interview), _turn_dicts(interview), number,
        interview.target_questions, _followups_in_row(interview),
    )
    q = generate_json(llm, msgs, QuestionOut, temperature=0.7)
    kind = "question" if number == 1 else q.kind
    turn = InterviewTurn(role="interviewer", kind=kind, content=q.question.strip())
    interview.turns.append(turn)
    db.flush()
    return turn


def start_interview(db: Session, llm: LLMProvider, user: User, config: InterviewConfig) -> Interview:
    if config.resume_id is not None:
        resume = db.get(Resume, config.resume_id)
        if not resume or resume.user_id != user.id:
            raise ValueError("Resume not found.")
    interview = Interview(
        user_id=user.id,
        resume_id=config.resume_id,
        config=config.model_dump(),
        target_questions=target_question_count(config.duration_minutes),
        model_name=llm.model,
    )
    db.add(interview)
    db.flush()
    try:
        _ask_next(db, llm, interview)
    except LLMError:
        db.rollback()
        raise
    db.commit()
    db.refresh(interview)
    record_activity(db, user, "interview_started", f"Started a {config.interview_type} interview for {config.role}",
                    f"/interview/{interview.id}")
    return interview


def submit_answer(db: Session, llm: LLMProvider, interview: Interview, answer: str,
                  elapsed: int | None) -> tuple[Interview, bool]:
    if interview.status != "in_progress":
        raise ValueError("This interview has already ended.")
    last = interview.turns[-1] if interview.turns else None
    if not last or last.role != "interviewer":
        raise ValueError("There is no open question to answer.")

    interview.turns.append(InterviewTurn(role="candidate", kind="answer", content=answer.strip()))
    if elapsed is not None:
        interview.elapsed_seconds = max(interview.elapsed_seconds, elapsed)
    db.flush()

    done = questions_asked(interview) >= interview.target_questions
    if not done:
        try:
            _ask_next(db, llm, interview)
        except LLMError:
            # Keep the saved answer so nothing the user typed is lost; the client can retry.
            db.commit()
            raise
    db.commit()
    db.refresh(interview)
    return interview, done


def retry_question(db: Session, llm: LLMProvider, interview: Interview) -> Interview:
    """Re-ask for the next question when a previous attempt failed after the answer was saved."""
    if interview.status != "in_progress":
        raise ValueError("This interview has already ended.")
    last = interview.turns[-1] if interview.turns else None
    if last and last.role == "interviewer":
        return interview  # already has an open question
    if questions_asked(interview) >= interview.target_questions:
        raise ValueError("All questions have been asked. End the interview to get your report.")
    _ask_next(db, llm, interview)
    db.commit()
    db.refresh(interview)
    return interview


def build_report(db: Session, llm: LLMProvider, interview: Interview) -> InterviewReport:
    report = interview.report or InterviewReport(interview_id=interview.id, model_name=llm.model)
    report.model_name = llm.model
    answered = [t for t in interview.turns if t.role == "candidate"]
    if not answered:
        report.status = "failed"
        report.error = "No answers were given, so there is nothing to evaluate."
        report.data, report.overall_score = None, None
    else:
        try:
            data = generate_json(
                llm, prompts.report_messages(interview.config, _resume_summary(db, interview), _turn_dicts(interview)),
                ReportData, temperature=0.2,
            )
            report.data = data.model_dump()
            report.overall_score = overall_score(data)
            report.status, report.error = "ready", None
        except LLMError as e:
            report.status, report.error = "failed", str(e)
            report.data, report.overall_score = None, None
    report.created_at = datetime.now(timezone.utc)
    if not interview.report:
        db.add(report)
    db.commit()
    db.refresh(interview)
    return report


def overall_score(data: ReportData) -> float:
    """Weighted mean computed server-side so the headline number is consistent and explainable."""
    s = data.scores.model_dump()
    return round(sum(s[k] * w for k, w in prompts.WEIGHTS.items()), 1)


def end_interview(db: Session, llm: LLMProvider, interview: Interview, elapsed: int | None) -> InterviewReport:
    if interview.status == "in_progress":
        # Drop a trailing unanswered question so it is not graded as a skipped answer.
        if interview.turns and interview.turns[-1].role == "interviewer":
            interview.turns.remove(interview.turns[-1])
        interview.status = "completed"
        interview.ended_at = datetime.now(timezone.utc)
        if elapsed is not None:
            interview.elapsed_seconds = max(interview.elapsed_seconds, elapsed)
        db.commit()
        db.refresh(interview)
        record_activity(db, interview.user, "interview_completed",
                        f"Completed {interview.config['interview_type']} interview: {interview.config['role']}",
                        f"/interview/{interview.id}/report")
    return build_report(db, llm, interview)
