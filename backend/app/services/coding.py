"""Phase 4: coding lab — problem bank seeding, judging via the sandbox, and AI review."""

from __future__ import annotations

import gzip
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..models_coding import Problem
from .runner import RunnerUnavailable, Runner, normalize

log = logging.getLogger(__name__)
BANK = Path(__file__).resolve().parent.parent / "data" / "problems.json.gz"
SHOW = 2000  # characters of input/output shown per visible test


def seed_problems(db: Session) -> int:
    """Insert or update the built-in problem bank (idempotent, keyed by slug)."""
    data = _bank()
    if not data:
        log.warning("Problem bank %s is missing; run scripts/build_problems.py", BANK)
        return 0
    existing = {p.slug: p for p in db.query(Problem).all()}
    for item in data:
        p = existing.get(item["slug"])
        if p and p.tests == item["tests"] and p.statement == item["statement"]:
            continue  # unchanged
        p = p or Problem(slug=item["slug"])
        for k in ("title", "difficulty", "topic", "statement", "input_format", "output_format", "constraints",
                  "samples", "tests", "hints", "explanation", "expected_complexity"):
            setattr(p, k, item[k])
        db.add(p)
    db.commit()
    return len(data)


@lru_cache(maxsize=1)
def _bank() -> list[dict]:
    return json.loads(gzip.decompress(BANK.read_bytes())) if BANK.exists() else []


def _clip(s: str) -> str:
    return s if len(s) <= SHOW else s[:SHOW] + f"\n… ({len(s) - SHOW} more characters)"


def judge(runner: Runner, problem: Problem, language: str, code: str, *, samples_only: bool) -> dict:
    tests = problem.tests[: len(problem.samples)] if samples_only else problem.tests
    n_visible = len(problem.samples)
    results: list[dict | None] = [None] * len(tests)

    def one(i: int) -> dict:
        t = tests[i]
        r = runner.run(language, code, t["input"])
        if r.status == "ok":
            status = "passed" if normalize(r.stdout) == normalize(t["output"]) else "wrong_answer"
        else:
            status = r.status
        visible = i < n_visible
        res = {"index": i, "hidden": not visible, "status": status, "time_ms": r.time_ms}
        if visible:
            res.update({"input": _clip(t["input"]), "expected": _clip(t["output"]), "actual": _clip(r.stdout),
                        "stderr": _clip(r.stderr)})
        elif status in ("runtime_error", "compile_error"):
            res["stderr"] = _clip(r.stderr)  # error messages help debugging and don't reveal the hidden input
        return res

    # Run the first test alone: a compile error means there is no point running the rest.
    results[0] = one(0)
    if results[0]["status"] != "compile_error" and len(tests) > 1:
        with ThreadPoolExecutor(max_workers=4) as pool:
            for res in pool.map(one, range(1, len(tests))):
                results[res["index"]] = res
    done = [r for r in results if r]
    passed = sum(r["status"] == "passed" for r in done)
    first_fail = next((r for r in done if r["status"] != "passed"), None)
    verdict = "accepted" if passed == len(tests) and len(done) == len(tests) else (first_fail or {}).get("status", "error")
    times = [r["time_ms"] for r in done if r["time_ms"] is not None]
    return {"verdict": verdict, "passed": passed, "total": len(tests), "results": done,
            "max_time_ms": max(times) if times else None}


def run_custom(runner: Runner, language: str, code: str, stdin: str) -> dict:
    r = runner.run(language, code, stdin)
    return {"status": r.status, "stdout": _clip(r.stdout), "stderr": _clip(r.stderr), "time_ms": r.time_ms,
            "exit_code": r.exit_code}


# ---------- AI review ----------
class Mistake(BaseModel):
    issue: str
    explanation: str
    fix_hint: str = ""


class ReviewOut(BaseModel):
    summary: str
    time_complexity: str
    space_complexity: str
    complexity_explanation: str = ""
    meets_expected: bool | None = None
    mistakes: list[Mistake] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    code_quality: list[str] = Field(default_factory=list)


def review_messages(problem: Problem, language: str, code: str, judged: dict | None) -> list[dict]:
    if judged:
        fail = next((r for r in judged["results"] if r["status"] != "passed"), None)
        if fail and not fail["hidden"]:
            detail = (f"First failing test (visible sample): status={fail['status']}\nInput:\n{fail.get('input', '')[:1500]}\n"
                      f"Expected:\n{fail.get('expected', '')[:800]}\nActual:\n{fail.get('actual', '')[:800]}\n"
                      f"Stderr:\n{fail.get('stderr', '')[:1500]}")
        elif fail:
            t = problem.tests[fail["index"]]
            detail = (f"First failing test is HIDDEN: status={fail['status']}. Hidden input (PRIVATE: describe the kind of "
                      f"case, e.g. 'very large n' or 'empty input', but never quote it):\n{t['input'][:1200]}\n"
                      f"Stderr:\n{fail.get('stderr', '')[:1200]}")
        else:
            detail = "All tests passed."
        run_info = f"Verdict: {judged['verdict']} ({judged['passed']}/{judged['total']} tests passed).\n{detail}"
    else:
        run_info = "The code was NOT executed (no sandbox available). Review it statically and say so."
    system = f"""You are a senior engineer reviewing a solution to a coding problem. Be precise and kind.
Problem: {problem.title}
{problem.statement}
Input: {problem.input_format}
Output: {problem.output_format}
Constraints: {problem.constraints}
Target complexity: {problem.expected_complexity}

{run_info}

Explain: the time and space complexity of THIS code (Big-O, with a one-paragraph justification), whether it meets the target
complexity for the constraints, concrete mistakes (logic errors, edge cases, overflow, I/O format, performance), and how to fix
each one WITHOUT writing the full corrected solution. Mention code quality points briefly.
Reply with JSON only:
{{"summary": "...", "time_complexity": "O(...)", "space_complexity": "O(...)", "complexity_explanation": "...",
  "meets_expected": true, "mistakes": [{{"issue": "...", "explanation": "...", "fix_hint": "..."}}],
  "improvements": ["..."], "code_quality": ["..."]}}"""
    return [{"role": "system", "content": system},
            {"role": "user", "content": f"Language: {language}\n```\n{code[:20000]}\n```"}]


def ensure_runner(runner: Runner) -> None:
    if runner.name == "none":
        raise RunnerUnavailable("Code execution isn't configured on this server. You can still get an AI review of your code.")
