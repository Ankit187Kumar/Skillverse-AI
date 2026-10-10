import json
import os
import tempfile

os.environ.setdefault("ENVIRONMENT", "test")
os.environ["JOBS_INLINE"] = "true"
os.environ["JWT_SECRET"] = "test-secret-that-is-long-enough-for-hs256-0123456789"
_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.deps import get_llm  # noqa: E402
from app.main import app  # noqa: E402
from app.security import limiter  # noqa: E402
from app.services.llm import LLMError  # noqa: E402


EXTRA_RESPONSES: dict = {}


def respond_to(marker: str):
    """Register a canned model reply for prompts whose system message contains `marker`."""
    def deco(fn):
        EXTRA_RESPONSES[marker] = fn
        return fn
    return deco


@respond_to("curriculum designer")
def _curriculum():
    return {"title": "Python Foundations", "description": "Learn Python.", "outcomes": ["Write scripts"],
            "modules": [{"title": "Basics", "summary": "s", "objectives": ["Explain variables"],
                         "lessons": [{"title": "Variables", "summary": "x"}, {"title": "Loops", "summary": "y"}]},
                        {"title": "Functions", "summary": "s", "objectives": ["Write functions"],
                         "lessons": [{"title": "Defining functions", "summary": "z"}]}],
            "project": {"title": "CLI todo app", "brief": "Build it", "requirements": ["Add tasks"], "stretch": []}}


@respond_to("patient, expert tutor")
def _lesson():
    q = lambda i: {"question": f"Question {i}?", "options": ["a", "b", "c", "d"], "answer_index": 1, "explanation": "b is right"}
    return {"objectives": ["Know variables"], "explanation": "Variables store values. " * 10,
            "examples": [{"title": "Ex", "content": "x = 1"}], "key_points": ["Names refer to objects"],
            "exercises": [{"prompt": "Swap two variables", "hints": ["Use a tuple", "a, b = ..."], "solution": "a, b = b, a"}],
            "quiz": [q(i) for i in range(4)]}


@respond_to("helping a learner who struggled")
def _remedial():
    return {"explanation": "A variable is like a labelled box that holds a value.", "analogy": "box",
            "examples": [], "check_yourself": ["What is a variable?"]}


@respond_to("checking a learner's attempt")
def _check():
    return {"verdict": "Partially correct", "feedback": "Close.", "next_step": "Think about tuples."}


@respond_to("fair end-of-course assessments")
def _assessment():
    return {"questions": [{"question": f"Assessment {i}?", "options": ["w", "x", "y", "z"], "answer_index": 0,
                           "explanation": "", "module_index": i % 2} for i in range(6)]}


@respond_to("capstone project of the course")
def _project():
    return {"score": 81, "summary": "Solid.", "strengths": ["Clear"], "improvements": ["Tests"],
            "rubric": [{"criterion": "Requirements", "score": 85, "comment": "ok"}]}


@respond_to("meticulous research planner")
def _plan():
    return {"title": "Solar adoption in India", "objective": "Understand drivers", "scope": "2015-2025",
            "sub_questions": [{"question": "What drives rooftop solar adoption?", "search_queries": ["rooftop solar drivers"]},
                              {"question": "What are the main barriers?", "search_queries": ["solar barriers financing"]}],
            "key_terms": ["net metering"]}


@respond_to("careful research analyst")
def _report():
    return {"title": "Solar adoption report",
            "executive_summary": [{"text": "Subsidies drive adoption.", "citations": [1], "kind": "fact"},
                                  {"text": "Growth will likely continue.", "citations": [], "kind": "interpretation"}],
            "sections": [{"heading": "Drivers", "paragraphs": [
                {"text": "Net metering lowers payback time.", "citations": ["1", 99], "kind": "fact"},
                {"text": "Prices fell 80% in a decade.", "citations": [], "kind": "fact"}]}],
            "key_findings": [{"text": "Subsidies matter.", "citations": [1], "kind": "fact"}],
            "viewpoints": [{"perspective": "Utilities", "summary": "Worried about revenue.", "citations": [2, 7]}],
            "limitations": ["Few sources"], "open_questions": ["Rural uptake?"]}


@respond_to("senior engineer reviewing a solution")
def _code_review():
    return {"summary": "Nested loops.", "time_complexity": "O(n^2)", "space_complexity": "O(1)",
            "complexity_explanation": "Two loops.", "meets_expected": False,
            "mistakes": [{"issue": "Index error on short input", "explanation": "...", "fix_hint": "Check bounds"}],
            "improvements": ["Use a hash map"], "code_quality": ["Name variables"]}


@respond_to("supportive career and learning coach")
def _roadmap():
    return {"headline": "Focus on communication and graphs.",
            "focus_areas": [{"title": "Communication", "why": "Interview average 55",
                             "actions": [{"label": "Behavioral mock interview", "kind": "interview", "target": "STAR"}]}],
            "weekly_plan": [{"day": "Monday", "tasks": ["One lesson"]}], "milestones": ["Score 70+"]}


class FakeLLM:
    """Deterministic stand-in for a real model, used only by the test suite."""

    name = "fake"
    model = "fake-model"

    def __init__(self):
        self.fail = False
        self.calls = []

    def embed(self, texts):
        if self.fail:
            raise LLMError("Embeddings offline (test).")
        import hashlib
        out = []
        for t in texts:  # deterministic bag-of-words hashing vector
            v = [0.0] * 64
            for w in t.lower().split():
                v[int(hashlib.md5(w.encode()).hexdigest(), 16) % 64] += 1.0
            out.append(v)
        return out

    def status(self):
        return {"provider": "fake", "model": self.model, "reachable": True, "model_available": True, "message": "Ready."}

    def chat(self, messages, *, json_mode=False, temperature=None):
        self.calls.append(messages)
        if self.fail:
            raise LLMError("Model offline (test).")
        system, user = messages[0]["content"], messages[-1]["content"]
        for marker, payload in EXTRA_RESPONSES.items():
            if marker in system:
                return json.dumps(payload() if callable(payload) else payload)
        if "extract structured information from resumes" in system:
            return json.dumps({"summary": "Backend engineer.", "skills": ["Python", "FastAPI"],
                               "experience": ["Engineer at Acme (2021-2024): built APIs"],
                               "education": ["B.Tech, IIT Delhi (2021)"], "projects": ["Chatbot: support bot"]})
        if "Write the report now" in user:
            return "Here you go:\n```json\n" + json.dumps({
                "summary": "Solid answers with room to add depth.",
                "scores": {"accuracy": 80, "technical_knowledge": 70, "communication": 90, "problem_solving": 60,
                           "confidence": 50},
                "strengths": ["Clear structure"], "weaknesses": ["Few concrete examples"],
                "question_feedback": [{"question": "Q", "answer_summary": "A", "score": 70, "feedback": "Good",
                                       "suggested_answer": "Better answer"}],
                "improvement_tips": ["Use STAR"], "recommended_lessons": ["System design basics"],
                "practice_questions": ["Explain caching"], "skill_gaps": ["Docker"],
                "confidence_signals": ["Committed to a clear answer in Q1"],
            }) + "\n```"
        n = sum(1 for m in messages if m["role"] == "user")
        return json.dumps({"question": f"Question text {len(self.calls)}-{n}?", "kind": "question"})


@pytest.fixture()
def llm():
    return FakeLLM()


@pytest.fixture()
def client(llm):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    limiter.reset()
    app.dependency_overrides[get_llm] = lambda: llm
    with TestClient(app, headers={"X-SkillVerse-Client": "web"}) as c:
        yield c
    app.dependency_overrides.clear()


def register(c, email="asha@example.com", password="secret123", name="Asha Rao"):
    r = c.post("/api/auth/register", json={"email": email, "password": password, "full_name": name})
    assert r.status_code == 201, r.text
    return r.json()
