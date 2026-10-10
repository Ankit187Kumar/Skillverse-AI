"""Code execution through an isolated sandbox service.

User code is NEVER executed by this backend process. It is sent to a separate sandbox:

* Piston (https://github.com/engineer-man/piston) — open source, self-hosted with Docker.
* Judge0 (https://github.com/judge0/judge0) — open source, self-hosted with Docker (or the hosted API).

With CODE_RUNNER=none, running code is disabled and the lab offers AI review only.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass

import httpx

from ..config import Settings

LANGUAGES = {
    "python": {"label": "Python 3", "piston": ["python", "python3"], "judge0": 71, "file": "main.py"},
    "javascript": {"label": "JavaScript (Node.js)", "piston": ["javascript", "node", "js"], "judge0": 63, "file": "main.js"},
    "java": {"label": "Java", "piston": ["java"], "judge0": 62, "file": "Main.java"},
    "cpp": {"label": "C++", "piston": ["c++", "cpp", "g++"], "judge0": 54, "file": "main.cpp"},
}

STARTERS = {
    "python": "import sys\n\n\ndef main():\n    data = sys.stdin.read().split()\n    # Parse the input described in the problem, then print the answer.\n\n\nif __name__ == \"__main__\":\n    main()\n",
    "javascript": "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/).filter(Boolean);\n// Parse the input described in the problem, then print the answer with console.log.\n",
    "java": "import java.io.*;\nimport java.util.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));\n        StringBuilder out = new StringBuilder();\n        // Parse the input described in the problem, then print the answer.\n        System.out.print(out);\n    }\n}\n",
    "cpp": "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // Parse the input described in the problem, then print the answer.\n    return 0;\n}\n",
}


class RunnerUnavailable(Exception):
    pass


@dataclass
class RunResult:
    stdout: str
    stderr: str
    exit_code: int | None
    status: str  # ok | runtime_error | compile_error | time_limit | memory_limit | error
    time_ms: float | None


class Runner:
    name = "none"

    def languages(self) -> list[dict]:
        return []

    def run(self, language: str, code: str, stdin: str) -> RunResult:
        raise RunnerUnavailable("Code execution is not configured on this server.")


class PistonRunner(Runner):
    name = "piston"
    _cache: tuple[float, dict] | None = None
    _lock = threading.Lock()

    def __init__(self, s: Settings):
        self.url = s.piston_url.rstrip("/")
        self.timeout_ms = s.code_run_timeout_ms
        self.mem = s.code_memory_limit_mb * 1024 * 1024

    def _runtimes(self) -> dict[str, str]:
        with self._lock:
            if PistonRunner._cache and time.time() - PistonRunner._cache[0] < 300:
                return PistonRunner._cache[1]
        try:
            r = httpx.get(f"{self.url}/api/v2/runtimes", timeout=8)
            r.raise_for_status()
            runtimes = r.json()
        except (httpx.HTTPError, ValueError) as e:
            raise RunnerUnavailable(f"The code sandbox (Piston) is not reachable at {self.url}.") from e
        found: dict[str, str] = {}
        for lang, cfg in LANGUAGES.items():
            versions = [rt["version"] for rt in runtimes
                        if rt.get("language") in cfg["piston"] or set(rt.get("aliases", [])) & set(cfg["piston"])]
            if versions:
                found[lang] = sorted(versions, key=lambda v: [int(x) if x.isdigit() else 0 for x in v.split(".")])[-1]
        with self._lock:
            PistonRunner._cache = (time.time(), found)
        return found

    def languages(self):
        rt = self._runtimes()
        return [{"id": k, "label": LANGUAGES[k]["label"], "version": rt[k]} for k in LANGUAGES if k in rt]

    def run(self, language, code, stdin):
        rt = self._runtimes()
        if language not in rt:
            raise RunnerUnavailable(f"{LANGUAGES.get(language, {}).get('label', language)} isn't installed in the sandbox.")
        body = {
            "language": LANGUAGES[language]["piston"][0], "version": rt[language],
            "files": [{"name": LANGUAGES[language]["file"], "content": code}], "stdin": stdin,
            "run_timeout": self.timeout_ms, "compile_timeout": 10000, "run_memory_limit": self.mem,
        }
        started = time.perf_counter()
        try:
            r = httpx.post(f"{self.url}/api/v2/execute", json=body, timeout=self.timeout_ms / 1000 + 25)
        except httpx.HTTPError as e:
            raise RunnerUnavailable("The code sandbox didn't respond.") from e
        wall = (time.perf_counter() - started) * 1000
        if r.status_code >= 400:
            return RunResult("", r.text[:2000], None, "error", None)
        data = r.json()
        comp = data.get("compile") or {}
        if comp and (comp.get("code") not in (0, None) or comp.get("signal")):
            return RunResult("", (comp.get("stderr") or comp.get("output") or "")[:8000], comp.get("code"), "compile_error", None)
        run = data.get("run") or {}
        t = run.get("wall_time") or run.get("cpu_time") or wall
        if run.get("signal") == "SIGKILL" or (run.get("status") in ("TO",)):
            status = "time_limit" if (t or 0) >= self.timeout_ms * 0.9 or run.get("status") == "TO" else "memory_limit"
        elif run.get("code") not in (0, None) or run.get("signal"):
            status = "runtime_error"
        else:
            status = "ok"
        return RunResult(run.get("stdout") or "", (run.get("stderr") or "")[:8000], run.get("code"), status, float(t))


class Judge0Runner(Runner):
    name = "judge0"

    def __init__(self, s: Settings):
        self.url = s.judge0_url.rstrip("/")
        self.key = s.judge0_api_key
        self.timeout_s = s.code_run_timeout_ms / 1000
        self.mem_kb = s.code_memory_limit_mb * 1024

    def _headers(self):
        return {"X-Auth-Token": self.key} if self.key else {}

    def languages(self):
        try:
            r = httpx.get(f"{self.url}/languages", headers=self._headers(), timeout=8)
            r.raise_for_status()
            ids = {x["id"]: x["name"] for x in r.json()}
        except (httpx.HTTPError, ValueError) as e:
            raise RunnerUnavailable(f"The code sandbox (Judge0) is not reachable at {self.url}.") from e
        return [{"id": k, "label": v["label"], "version": ids[v["judge0"]]} for k, v in LANGUAGES.items() if v["judge0"] in ids]

    def run(self, language, code, stdin):
        body = {"source_code": code, "language_id": LANGUAGES[language]["judge0"], "stdin": stdin,
                "cpu_time_limit": self.timeout_s, "wall_time_limit": self.timeout_s * 2, "memory_limit": self.mem_kb}
        try:
            r = httpx.post(f"{self.url}/submissions?base64_encoded=false&wait=true", json=body,
                           headers=self._headers(), timeout=self.timeout_s * 3 + 20)
        except httpx.HTTPError as e:
            raise RunnerUnavailable("The code sandbox didn't respond.") from e
        if r.status_code >= 400:
            return RunResult("", r.text[:2000], None, "error", None)
        d = r.json()
        sid = (d.get("status") or {}).get("id")
        status = {3: "ok", 5: "time_limit", 6: "compile_error"}.get(sid, "runtime_error" if sid and sid >= 7 else "error")
        if sid in (7, 8, 9, 10, 11, 12) and "memory" in (d.get("status") or {}).get("description", "").lower():
            status = "memory_limit"
        stderr = d.get("compile_output") if status == "compile_error" else d.get("stderr")
        t = float(d["time"]) * 1000 if d.get("time") else None
        return RunResult(d.get("stdout") or "", (stderr or "")[:8000], d.get("exit_code"), status, t)


def build_runner(s: Settings) -> Runner:
    if s.code_runner == "piston":
        return PistonRunner(s)
    if s.code_runner == "judge0":
        return Judge0Runner(s)
    return Runner()


def normalize(out: str) -> str:
    """Compare outputs ignoring trailing spaces on each line and trailing blank lines."""
    return "\n".join(line.rstrip() for line in out.replace("\r\n", "\n").rstrip().split("\n"))
