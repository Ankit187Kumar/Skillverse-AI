import httpx
import pytest

from app.main import app
from app.routers.coding import get_runner
from app.services import runner as runner_mod
from app.services.runner import Runner, RunResult

from .conftest import register


class FakeSandbox(Runner):
    """Test double for Piston/Judge0. Behaviour is selected by markers in the submitted code."""

    name = "fake"

    def __init__(self):
        from app.services.coding import _bank
        self.answers = {t["input"]: t["output"] for p in _bank() for t in p["tests"]}

    def languages(self):
        return [{"id": "python", "label": "Python 3", "version": "3.12"}]

    def run(self, language, code, stdin):
        if "NOCOMPILE" in code:
            return RunResult("", "SyntaxError: invalid syntax", 1, "compile_error", None)
        if "CRASH" in code:
            return RunResult("", "IndexError: list index out of range", 1, "runtime_error", 12.0)
        if "SLOW" in code and len(stdin) > 10000:
            return RunResult("", "", None, "time_limit", 3000.0)
        if "WRONG" in code:
            return RunResult("42\n", "", 0, "ok", 5.0)
        return RunResult(self.answers.get(stdin, "?") + "   \n\n", "", 0, "ok", 8.0)  # trailing whitespace is ignored


@pytest.fixture()
def sandbox():
    fake = FakeSandbox()
    app.dependency_overrides[get_runner] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_runner, None)


def test_problem_bank_seeded_and_listed(client):
    register(client)
    data = client.get("/api/coding/problems").json()
    assert len(data["problems"]) >= 20 and "Graphs" in data["topics"]
    assert {p["difficulty"] for p in data["problems"]} == {"Easy", "Medium", "Hard"}
    p = client.get("/api/coding/problems/two-sum").json()
    assert p["samples"] and p["hidden_tests"] > 0 and "tests" not in p
    assert p["hints"] == [] and p["explanation"] is None and "python" in p["starters"]


def test_no_sandbox_means_no_execution_but_static_review(client):
    register(client)
    cfg = client.get("/api/coding/config").json()
    assert cfg["runner"] == "none" and cfg["execution_available"] is False
    r = client.post("/api/coding/problems/two-sum/submit", json={"language": "python", "code": "print(1)"})
    assert r.status_code == 503 and "isn't configured" in r.json()["detail"]
    rev = client.post("/api/coding/problems/two-sum/review", json={"language": "python", "code": "print(1)"}).json()
    assert rev["executed"] is False and rev["time_complexity"] == "O(n^2)"


def test_submit_verdicts_history_and_stats(client, sandbox):
    register(client)
    assert client.get("/api/coding/config").json()["execution_available"] is True
    run = client.post("/api/coding/problems/two-sum/run", json={"language": "python", "code": "ok"}).json()
    assert run["mode"] == "samples" and run["verdict"] == "accepted" and all("expected" in r for r in run["results"])
    custom = client.post("/api/coding/problems/two-sum/run", json={"language": "python", "code": "WRONG", "stdin": "1"}).json()
    assert custom["mode"] == "custom" and custom["stdout"] == "42\n"

    wrong = client.post("/api/coding/problems/two-sum/submit", json={"language": "python", "code": "WRONG"}).json()
    assert wrong["verdict"] == "wrong_answer" and wrong["passed"] == 0
    hidden = [r for r in wrong["results"] if r["hidden"]]
    assert hidden and all("input" not in r and "expected" not in r for r in hidden)  # hidden tests stay hidden

    slow = client.post("/api/coding/problems/two-sum/submit", json={"language": "python", "code": "SLOW"}).json()
    assert slow["verdict"] == "time_limit" and 0 < slow["passed"] < slow["total"]
    comp = client.post("/api/coding/problems/two-sum/submit", json={"language": "python", "code": "NOCOMPILE"}).json()
    assert comp["verdict"] == "compile_error" and len(comp["results"]) == 1

    ok = client.post("/api/coding/problems/two-sum/submit", json={"language": "python", "code": "good"}).json()
    assert ok["verdict"] == "accepted" and ok["first_solve"] is True
    again = client.post("/api/coding/problems/two-sum/submit", json={"language": "python", "code": "good"}).json()
    assert again["first_solve"] is False

    hist = client.get("/api/coding/submissions", params={"problem": "two-sum"}).json()
    assert [h["verdict"] for h in hist][:2] == ["accepted", "accepted"] and len(hist) == 5
    st = client.get("/api/coding/stats").json()
    assert st["solved"] == 1 and st["by_difficulty"]["Easy"]["solved"] == 1 and st["acceptance_rate"] == 40.0
    assert client.get("/api/coding/problems").json()["problems"][0]["status"] in ("solved", "new")


def test_ai_review_of_submission(client, sandbox):
    register(client)
    sub = client.post("/api/coding/problems/two-sum/submit", json={"language": "python", "code": "CRASH"}).json()
    assert sub["verdict"] == "runtime_error" and "IndexError" in sub["results"][0]["stderr"]
    rev = client.post(f"/api/coding/submissions/{sub['id']}/review").json()
    assert rev["executed"] is True and rev["mistakes"][0]["issue"]
    assert client.get(f"/api/coding/submissions/{sub['id']}").json()["ai_review"]["time_complexity"] == "O(n^2)"


def test_hints_then_explanation_and_drafts(client):
    register(client)
    assert client.post("/api/coding/problems/two-sum/explanation").status_code == 409
    client.post("/api/coding/problems/two-sum/hint")
    h = client.post("/api/coding/problems/two-sum/hint").json()
    assert len(h["hints"]) == 2
    assert client.post("/api/coding/problems/two-sum/hint").status_code == 409
    assert "seen" in client.post("/api/coding/problems/two-sum/explanation").json()["explanation"]
    assert client.put("/api/coding/problems/two-sum/draft", json={"language": "cpp", "code": "int main(){}"}).status_code == 204
    p = client.get("/api/coding/problems/two-sum").json()
    assert p["drafts"]["cpp"] == "int main(){}" and p["last_language"] == "cpp" and p["explanation"]


def test_submissions_are_private(client, sandbox):
    register(client)
    sub = client.post("/api/coding/problems/two-sum/submit", json={"language": "python", "code": "good"}).json()
    client.post("/api/auth/logout")
    register(client, email="ravi@example.com", name="Ravi")
    assert client.get(f"/api/coding/submissions/{sub['id']}").status_code == 404
    assert client.post(f"/api/coding/submissions/{sub['id']}/review").status_code == 404
    assert client.get("/api/coding/submissions").json() == []


def test_piston_adapter_parses_responses(monkeypatch):
    from app.config import get_settings
    s = get_settings()
    runner_mod.PistonRunner._cache = None
    responses = {
        "runtimes": [{"language": "python", "version": "3.10.0", "aliases": ["py"]},
                     {"language": "python", "version": "3.12.0", "aliases": []},
                     {"language": "gcc", "version": "10.2.0", "aliases": ["c++", "cpp"]}],
    }

    def fake_get(url, **kw):
        return httpx.Response(200, json=responses["runtimes"], request=httpx.Request("GET", url))

    calls = []

    def fake_post(url, json=None, **kw):
        calls.append(json)
        if "while True" in json["files"][0]["content"]:
            body = {"run": {"stdout": "", "stderr": "", "code": None, "signal": "SIGKILL", "wall_time": 3001}}
        elif json["language"] == "c++":
            body = {"compile": {"code": 1, "stderr": "error: expected ';'"}, "run": {}}
        else:
            body = {"run": {"stdout": "3\n", "stderr": "", "code": 0, "signal": None, "wall_time": 21}}
        return httpx.Response(200, json=body, request=httpx.Request("POST", url))

    monkeypatch.setattr(runner_mod.httpx, "get", fake_get)
    monkeypatch.setattr(runner_mod.httpx, "post", fake_post)
    r = runner_mod.PistonRunner(s)
    assert {x["id"]: x["version"] for x in r.languages()} == {"python": "3.12.0", "cpp": "10.2.0"}
    assert r.run("python", "print(3)", "").status == "ok"
    assert calls[-1]["version"] == "3.12.0" and calls[-1]["files"][0]["name"] == "main.py"
    assert r.run("python", "while True: pass", "").status == "time_limit"
    res = r.run("cpp", "int main(){return 0}", "")
    assert res.status == "compile_error" and "expected" in res.stderr
    with pytest.raises(runner_mod.RunnerUnavailable):
        r.run("java", "class Main{}", "")
    runner_mod.PistonRunner._cache = None
