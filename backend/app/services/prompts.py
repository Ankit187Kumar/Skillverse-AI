"""Prompt templates. Kept separate from the service logic so they are easy to tune."""

from __future__ import annotations

import json

TYPE_GUIDANCE = {
    "Technical": "Ask about concepts, trade-offs, debugging and design in the candidate's skills. Prefer 'how' and 'why' over trivia.",
    "HR": "Ask about motivation, career goals, work preferences, teamwork and fit for the role.",
    "Behavioral": "Ask for concrete past situations (STAR format: Situation, Task, Action, Result).",
    "Personality": "Ask reflective questions about work style, values and how the candidate handles pressure. Do not diagnose personality; just explore working style.",
    "Domain-Specific": "Ask questions grounded in the domain knowledge a person in this role needs day to day.",
    "Custom": "Follow the candidate's custom topics and goals closely.",
}

CRITERIA = {
    "accuracy": "Answer accuracy and relevance: is the content correct and does it address the question asked?",
    "technical_knowledge": "Depth of role knowledge: correct use of concepts, tools and terminology for the target role.",
    "communication": "Communication clarity: structure, conciseness and how easy the answer is to follow.",
    "problem_solving": "Problem-solving: breaking problems down, reasoning about trade-offs, considering edge cases.",
    "confidence": (
        "Confidence in communication, judged ONLY from the written transcript: directness, committing to an answer, "
        "and limited unnecessary hedging. It is not measured from the camera, face, tone of voice or emotions."
    ),
}

WEIGHTS = {"accuracy": 0.25, "technical_knowledge": 0.25, "communication": 0.2, "problem_solving": 0.2, "confidence": 0.1}


def _profile_block(config: dict, resume: dict | None) -> str:
    lines = [
        f"Interview type: {config['interview_type']}",
        f"Target role: {config['role']}",
        f"Candidate experience level: {config['experience_level']}",
        f"Difficulty: {config['difficulty']}",
        f"Candidate's stated skills: {', '.join(config.get('skills') or []) or 'not specified'}",
    ]
    if config.get("topics"):
        lines.append(f"Topics to cover: {config['topics']}")
    if config.get("goals"):
        lines.append(f"Candidate's goals for this practice: {config['goals']}")
    if resume:
        lines.append("Resume summary (extracted from the candidate's upload):")
        lines.append(json.dumps(resume, ensure_ascii=False)[:3000])
    return "\n".join(lines)


def _transcript(turns: list[dict], max_chars_per_turn: int = 1500) -> str:
    if not turns:
        return "(no conversation yet)"
    out = []
    for t in turns:
        who = "Interviewer" if t["role"] == "interviewer" else "Candidate"
        text = t["content"]
        if len(text) > max_chars_per_turn:
            text = text[:max_chars_per_turn] + " …[truncated]"
        out.append(f"{who}: {text}")
    return "\n\n".join(out)


def next_question_messages(config: dict, resume: dict | None, turns: list[dict], number: int, total: int,
                           followups_in_row: int) -> list[dict]:
    system = f"""You are a professional, friendly interviewer running a realistic mock interview for practice.
{_profile_block(config, resume)}

Guidance for this interview type: {TYPE_GUIDANCE[config['interview_type']]}

Rules:
- Ask exactly ONE question at a time. Keep it under 70 words. No numbering, no answer hints.
- Match the difficulty and experience level. Do not repeat earlier questions.
- If a resume is provided, ground some questions in the candidate's real projects and experience.
- Speak to the candidate in {config['language']}.
- Never give feedback or scores during the interview.
- Reply with JSON only: {{"question": "<text>", "kind": "question" or "followup"}}"""

    if number == 1:
        instruction = (f"Start the interview. Greet the candidate in one short sentence, then ask question 1 of {total}. "
                       'Use "kind": "question".')
    elif number == total:
        instruction = (f"This is the final question ({number} of {total}). Ask a strong closing question for this role "
                       "(not a follow-up).")
    else:
        followup_rule = (
            'You may ask a "followup" probing the candidate\'s last answer if it was vague, incomplete or interesting. '
            if followups_in_row < 1 else 'Do NOT ask a follow-up now; move to a new topic with "kind": "question". '
        )
        instruction = f"Ask question {number} of {total}. {followup_rule}"

    user = f"Transcript so far:\n\n{_transcript(turns)}\n\n{instruction}"
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def report_messages(config: dict, resume: dict | None, turns: list[dict]) -> list[dict]:
    criteria = "\n".join(f"- {k}: {v}" for k, v in CRITERIA.items())
    schema = {
        "summary": "2-3 sentence overall assessment",
        "scores": {k: "number 0-100" for k in CRITERIA},
        "strengths": ["specific strength referencing the answers"],
        "weaknesses": ["specific weakness referencing the answers"],
        "question_feedback": [
            {"question": "the question asked", "answer_summary": "one-line summary of the answer",
             "score": "number 0-100", "feedback": "what was good and what was missing",
             "suggested_answer": "a concise model answer (3-6 sentences)"}
        ],
        "improvement_tips": ["actionable tip"],
        "recommended_lessons": ["short lesson/topic title to study next"],
        "practice_questions": ["new question to practise next time"],
        "skill_gaps": ["skill the target role needs that the candidate did not demonstrate"],
        "confidence_signals": ["observable text signal used for the confidence score, e.g. 'committed to a clear recommendation in Q2'"],
    }
    system = f"""You are an experienced, fair interview coach writing a feedback report for a practice interview.
{_profile_block(config, resume)}

Score each criterion from 0 to 100:
{criteria}

Calibration: 90+ exceptional, 75-89 strong, 60-74 adequate, 40-59 needs work, below 40 major gaps.
Unanswered or skipped questions score low. Be specific and evidence-based: quote or reference what the candidate actually said.
Do not infer personality, emotions or traits from anything other than the words in the transcript.
Write the report in {config['language']}.
Reply with JSON only, matching this shape exactly:
{json.dumps(schema, indent=2)}"""
    user = f"Interview transcript:\n\n{_transcript(turns, max_chars_per_turn=2500)}\n\nWrite the report now."
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def resume_parse_messages(text: str, target_roles: list[str]) -> list[dict]:
    system = """You extract structured information from resumes. Only use information present in the text; never invent details.
Reply with JSON only:
{"summary": "2 sentence professional summary",
 "skills": ["skill"], "experience": ["Role at Company (dates): one-line highlight"],
 "education": ["Degree, Institution (year)"], "projects": ["Project name: one-line description"]}"""
    roles = f"The candidate is targeting: {', '.join(target_roles)}.\n" if target_roles else ""
    user = f"{roles}Resume text:\n\n{text[:12000]}"
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]
