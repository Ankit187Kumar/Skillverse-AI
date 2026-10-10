# Security

This document describes SkillVerse AI's security model, the controls in place, how they're tested, and a production checklist.

## Threat model (summary)

| Asset | Threats | Main controls |
|---|---|---|
| Accounts & sessions | credential stuffing, session theft, CSRF | bcrypt (cost 12), login rate limit, constant-time login path, httpOnly + SameSite=Lax + Secure cookie, signed JWT (HS256, 7-day expiry), custom-header CSRF check on every state-changing request |
| Personal data (resumes, transcripts, reports, documents, code) | access by other users (IDOR) | every query is scoped to the signed-in user; foreign IDs return 404; verified by an automated matrix over all routes |
| Server & internal network | SSRF via research fetching | only http(s); DNS resolution checked; private, loopback, link-local, reserved and multicast addresses refused; redirects re-checked hop by hop; size and time limits; no credentials in URLs |
| Server | remote code execution via the Coding Lab | user code is sent to a separate sandbox (Piston/Judge0) and never executed by the API process; run time and memory limits |
| Server | malicious uploads | extension + magic-byte checks, size limits, DOCX zip-bomb guard, encrypted PDFs rejected; only extracted text is stored |
| Browser | XSS from AI output or documents | React escaping; Markdown rendered without raw HTML; external links `noopener noreferrer nofollow`; `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` limiting camera/mic to this origin |
| Privacy | covert recording, data retention | camera/mic start only on explicit user action with visible indicators; nothing recorded; audio for STT held in memory for the request only; no facial or emotion analysis |
| Availability & cost | AI/compute abuse | per-user rate limits on AI, upload, code-run and voice endpoints; caps on courses, documents and resumes per user |
| Secrets | leakage | all secrets in environment variables; the app refuses to start in production with a default or short `JWT_SECRET` or without `COOKIE_SECURE=true`; API keys are never sent to the browser |

## Automated security testing

- `backend/tests/test_security.py`:
  - every non-public route returns **401** without a session;
  - for every route that takes an owned ID (interviews, resumes, courses, lessons, research, documents, jobs, submissions), another signed-in user gets **404** for every method;
  - every state-changing route rejects requests without the CSRF header (**403**);
  - session cookie flags; forged, `alg=none` and tampered tokens are rejected.
- Feature tests cover SSRF blocking, upload spoofing and size limits, hidden-test secrecy, quiz-answer secrecy, and citation validation.
- CI runs `pytest`, `alembic check`, `pip-audit`, `bandit` and `npm audit`.

## Production checklist

- [ ] `ENVIRONMENT=production`, random `JWT_SECRET` (≥ 32 chars, e.g. `python -c "import secrets;print(secrets.token_urlsafe(48))"`), `COOKIE_SECURE=true`
- [ ] HTTPS everywhere (Caddy in `docker-compose.yml` does this automatically)
- [ ] PostgreSQL with a strong password, not exposed publicly, with regular backups
- [ ] Backend, Ollama, Piston, SearXNG and STT reachable **only** on the internal Docker network (as in the compose file)
- [ ] `ALLOW_PRIVATE_FETCH=false`
- [ ] Piston/Judge0 on a host you control; never expose its API publicly
- [ ] Move rate limiting and jobs to Redis/a queue before running several API instances
- [ ] Keep dependencies patched (`pip-audit`, `npm audit`, rebuild images regularly)
- [ ] Decide and publish a data-retention policy; users can export and delete their data in Settings

## Reporting a vulnerability

Please report issues privately to the project maintainers rather than opening a public issue. Include steps to reproduce and the affected version.
