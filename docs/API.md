# SkillVerse AI — API reference

Base path: `/api`. Interactive OpenAPI docs are served by the backend at `/api/docs` (Swagger) and `/api/redoc`.

**Auth:** a signed session token in the httpOnly cookie `skillverse_session`, set by register/login. For scripts, the same token can be sent as `Authorization: Bearer <token>`.

**CSRF:** when a session cookie is present, every `POST`, `PATCH` and `DELETE` must include the header `X-SkillVerse-Client: web`, otherwise the API returns `403`.

**Errors** are JSON: `{"detail": "Human-readable message"}`. Validation errors (422) also include `errors: [{field, message}]`. When the AI model is unreachable or returns unusable output the status is `503` with `"code": "ai_unavailable"`.

**Rate limits** (per minute, configurable): auth endpoints 10 per IP, AI endpoints 30 per user, uploads 10 per user, code runs 20 per user, voice 40 per user. Exceeding returns `429` with `Retry-After`.

**Background jobs:** long AI tasks return a Job `{id, kind, status: queued|running|succeeded|failed, progress, message, error}`. Poll `GET /jobs/{id}` until it finishes.

## System

| Method | Path | Description |
|---|---|---|
| GET | `/health` | `{"status":"ok"}` |
| GET | `/system/ai-status` | `{provider, model, reachable, model_available, message}` (signed-in users) |
| GET | `/jobs/{id}` | A background job you own |

## Auth

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `{email, password (8–72, letters + numbers/symbols), full_name}` | `201` User, sets cookie. `409` if email exists. |
| POST | `/auth/login` | `{email, password}` | User, sets cookie. `401` on bad credentials. |
| POST | `/auth/logout` | — | `204`, clears cookie |
| GET | `/auth/me` | — | User or `401` |

**User**: `{id, email, full_name, headline, experience_level, skills[], target_roles[], learning_goals[], preferred_language, streak_count, created_at}`

## Profile and account

| Method | Path | Body | Response |
|---|---|---|---|
| PATCH | `/users/me` | any of `full_name, headline, experience_level, skills, target_roles, learning_goals, preferred_language` | User |
| POST | `/users/me/password` | `{current_password, new_password}` | `204` |
| GET | `/users/me/export` | — | All stored data as JSON |
| DELETE | `/users/me` | `{password}` | `204`; deletes the user and every related record (courses, research, documents, code, …) |

## Resumes

| Method | Path | Description |
|---|---|---|
| GET | `/resumes` | List the user's resumes |
| POST | `/resumes` | `multipart/form-data` field `file` (PDF or DOCX, ≤ `MAX_UPLOAD_MB`). Extension and file signature are both checked. Returns `201` Resume. If AI parsing fails the resume is still saved with `parse_error`. |
| POST | `/resumes/{id}/analyze` | Re-run AI parsing |
| DELETE | `/resumes/{id}` | `204` |

**Resume**: `{id, filename, size_bytes, parsed: {summary, skills[], experience[], education[], projects[]} | null, parse_error, created_at, text_preview}`

## Interviews

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/interviews` | — | `InterviewSummary[]` (newest first) |
| POST | `/interviews` | InterviewConfig | `201` Interview containing the first question |
| GET | `/interviews/{id}` | — | Interview |
| POST | `/interviews/{id}/answer` | `{answer (1–6000 chars), elapsed_seconds?}` | `{interview, done}`. `done` is true when all questions are answered. |
| POST | `/interviews/{id}/next` | — | Interview. Retries question generation after a `503`; the previous answer is already saved. |
| POST | `/interviews/{id}/end` | `{elapsed_seconds?}` | Report. Marks the interview completed and generates the report. A trailing unanswered question is dropped. |
| GET | `/interviews/{id}/report` | — | Report |
| POST | `/interviews/{id}/report/retry` | — | Report (regenerates a failed report) |
| DELETE | `/interviews/{id}` | — | `204` |

**InterviewConfig**
```json
{
  "interview_type": "Technical | HR | Behavioral | Personality | Domain-Specific | Custom",
  "role": "Frontend Developer",
  "skills": ["React", "TypeScript"],
  "experience_level": "Beginner | Intermediate | Advanced",
  "difficulty": "Easy | Medium | Hard",
  "duration_minutes": 15,
  "language": "English",
  "mode": "text",
  "topics": "optional, required in practice for Custom",
  "goals": "optional",
  "resume_id": null
}
```
The number of questions is `clamp(round(duration / 3), 3, 12)`, including follow-ups.

**Interview**: `{id, config, status: "in_progress"|"completed", target_questions, questions_asked, model_name, elapsed_seconds, started_at, ended_at, turns: [{id, role: "interviewer"|"candidate", kind: "question"|"followup"|"answer", content, created_at}], overall_score}`

**Report**
```json
{
  "interview_id": 1,
  "status": "ready | failed",
  "overall_score": 72.5,
  "error": null,
  "model_name": "llama3.2:3b",
  "criteria": {"accuracy": "…definition…", "...": "..."},
  "weights": {"accuracy": 0.25, "technical_knowledge": 0.25, "communication": 0.2, "problem_solving": 0.2, "confidence": 0.1},
  "data": {
    "summary": "…",
    "scores": {"accuracy": 80, "technical_knowledge": 70, "communication": 90, "problem_solving": 60, "confidence": 50},
    "strengths": [], "weaknesses": [],
    "question_feedback": [{"question": "", "answer_summary": "", "score": 70, "feedback": "", "suggested_answer": ""}],
    "improvement_tips": [], "recommended_lessons": [], "practice_questions": [],
    "skill_gaps": [], "confidence_signals": []
  }
}
```
`overall_score` is the weighted mean of `data.scores` computed by the server.

## Dashboard

`GET /dashboard?tz=330` (tz = minutes east of UTC) returns `{user, quote, stats, overall_progress, score_trend[], skill_mastery[], recommendations[], goals[], weekly_goals, courses[], coding, roadmap[], roadmap_progress, in_progress_interview, recent_activity[], achievements[], badges_earned, badges_total}`.

## Learning (Phase 2) — `/learning`

| Method | Path | Body / notes |
|---|---|---|
| GET | `/courses` | Your courses with `stats {total_lessons, completed_lessons, progress, mastery, resume_lesson_key}` |
| POST | `/courses` | `{topic, level, goal?, hours_per_week?}` → `{course, job}` (outline generated in the background) |
| GET | `/courses/{id}` | Curriculum (modules → lessons with status/score), outcomes, project, recommendations, active job |
| POST | `/courses/{id}/retry` | Retry a failed outline |
| DELETE | `/courses/{id}` | |
| GET | `/courses/{id}/lessons/{key}` | Lesson meta + `content` with quiz answers, unrevealed hints and solutions removed; sets resume point |
| POST | `/courses/{id}/lessons/{key}/generate[?regenerate=true]` | Job that writes the lesson |
| POST | `/courses/{id}/lessons/{key}/quiz` | `{answers: [int]}` → `{score, passed, results[], advice}` (pass mark 60 completes the lesson) |
| POST | `/courses/{id}/lessons/{key}/complete` | Mark complete |
| POST | `/courses/{id}/lessons/{key}/exercises/{i}/hint` | Reveal the next hint |
| POST | `/courses/{id}/lessons/{key}/exercises/{i}/check` | `{answer}` → AI feedback (never the full solution) |
| POST | `/courses/{id}/lessons/{key}/exercises/{i}/solution` | `409` until a hint was used or an attempt checked |
| POST | `/courses/{id}/lessons/{key}/simplify` | Job: simpler explanation targeted at missed questions |
| POST / GET | `/courses/{id}/assessment` | Create (job) / fetch questions without answers |
| POST | `/courses/{id}/assessment/submit` | `{answers}` → score, per-module scores, weak modules |
| POST | `/courses/{id}/project` | `{submission}` (30–20,000 chars) → job with rubric feedback |

## Documents & research (Phase 3)

| Method | Path | Body / notes |
|---|---|---|
| GET | `/documents` | Your library (`embedded` tells whether semantic search is available) |
| POST | `/documents` | multipart `file` (PDF, DOCX, TXT, MD ≤ 15 MB) → `{document, job}` (chunking + embeddings) |
| DELETE | `/documents/{id}` | |
| GET | `/documents/search?q=&ids=1,2` | Top passages + `mode: semantic|keyword` |
| GET | `/research/config` | Search provider and whether web search is available |
| GET / POST | `/research/projects` | List / create `{prompt, goals?, field?, use_web, document_ids[], auto_run}` → `{project, job}` |
| GET | `/research/projects/{id}` | Plan, report, numbered sources (`fetched`, `cited`, `excerpt`), run notes |
| PUT | `/research/projects/{id}/plan` | `{sub_questions: [{question, search_queries[]}]}` |
| POST | `/research/projects/{id}/plan` | Re-plan (job) |
| POST | `/research/projects/{id}/run` | Run research (job) |
| GET | `/research/projects/{id}/export.md` | Markdown download |
| DELETE | `/research/projects/{id}` | |

Report claims: `{text, citations: [n], kind: "fact"|"interpretation", unsupported?: true}`. Citations are validated against the numbered sources.

## Coding (Phase 4) — `/coding`

| Method | Path | Body / notes |
|---|---|---|
| GET | `/config` | Runner, available languages (from the sandbox), time limit |
| GET | `/problems?difficulty=&topic=` | Problems with your status (new/attempted/solved) and topics |
| GET | `/problems/{slug}` | Statement, samples, revealed hints, drafts, starters, recent submissions (hidden tests never included) |
| PUT | `/problems/{slug}/draft` | `{language, code}` |
| POST | `/problems/{slug}/hint` · `/explanation` | Progressive hints; editorial after all hints or a solve |
| POST | `/problems/{slug}/run` | `{language, code, stdin?}` → samples verdict or custom-input output (`503` if no sandbox) |
| POST | `/problems/{slug}/submit` | `{language, code}` → verdict, per-test results (hidden tests show status only) |
| POST | `/problems/{slug}/review` | Static AI review when no sandbox is configured |
| GET | `/submissions` · `/submissions/{id}` | History / detail |
| POST | `/submissions/{id}/review` | AI complexity + mistakes review |
| GET | `/stats` | Solved by difficulty/topic, acceptance rate, languages |

## Voice (Phase 5) — `/voice`

| Method | Path | Notes |
|---|---|---|
| GET | `/config` | `{stt, tts, max_audio_mb, stt_note}` |
| POST | `/transcribe` | multipart `audio` (webm/ogg/wav/mp4/mpeg ≤ 10 MB) + `language` → `{text}`; audio is not stored |
| POST | `/speak` | `{text}` → audio/mpeg (only with `TTS_PROVIDER=openai_compatible`) |

## Analytics (Phase 5) — `/analytics`

| Method | Path | Notes |
|---|---|---|
| GET | `/overview?tz=` | Overall progress, interviews, learning, coding, skills, weaknesses, streak + heatmap, goals, badges, recommendations |
| GET | `/recommendations?tz=` | Just the next-step cards |
| PUT | `/goals?tz=` | `{weekly: {interviews, lessons, problems, research}, daily}` |
| GET / POST | `/roadmap` | Latest AI improvement roadmap / generate a new one (job) |
