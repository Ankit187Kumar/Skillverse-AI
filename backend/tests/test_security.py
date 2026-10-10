"""Security regression tests: every API route requires auth, and no route leaks another user's data."""

import re

from fastapi.testclient import TestClient

from app.main import app

from .conftest import register
from .test_api import CONFIG, _docx_bytes

PUBLIC = {("GET", "/api/health"), ("POST", "/api/auth/register"), ("POST", "/api/auth/login"),
          ("POST", "/api/auth/logout")}
BODY = {"answer": "my answer", "elapsed_seconds": 1, "answers": [0, 0, 0, 0], "submission": "x" * 40,
        "sub_questions": [{"question": "What is this about?", "search_queries": []}], "language": "python",
        "code": "print(1)", "password": "secret123", "current_password": "secret123", "new_password": "newpass99",
        "text": "hi", "weekly": {"interviews": 1, "lessons": 1, "problems": 1, "research": 1}, "daily": 1}


def api_routes():
    # The OpenAPI schema lists every registered endpoint (FastAPI may nest included routers).
    for path, ops in app.openapi()["paths"].items():
        if path.startswith("/api/"):
            for m in ops:
                yield m.upper(), path


def fill(path: str, ids: dict) -> str:
    return re.sub(r"\{(\w+)\}", lambda m: str(ids.get(m.group(1), 1)), path)


def test_every_private_route_requires_sign_in(client):
    anon = TestClient(app, headers={"X-SkillVerse-Client": "web"})
    checked = 0
    for method, path in api_routes():
        if (method, path) in PUBLIC:
            continue
        url = fill(path, {"slug": "two-sum", "key": "m1l1", "i": 0})
        r = anon.request(method, url, json=BODY if method in ("POST", "PUT", "PATCH", "DELETE") else None)
        assert r.status_code == 401, f"{method} {path} returned {r.status_code} without auth"
        checked += 1
    assert checked > 60


def test_no_cross_user_access_on_any_owned_route(client, llm):
    register(client)
    iv = client.post("/api/interviews", json=CONFIG).json()
    res = client.post("/api/resumes", files={"file": ("cv.docx", _docx_bytes(), "application/octet-stream")}).json()
    course = client.post("/api/learning/courses", json={"topic": "Python"}).json()
    client.post(f"/api/learning/courses/{course['course']['id']}/lessons/m1l1/generate")
    doc = client.post("/api/documents", files={"file": ("n.txt", ("Some research notes. " * 20).encode(), "text/plain")}).json()
    proj = client.post("/api/research/projects", json={"prompt": "A private research question", "use_web": False}).json()
    ids = {"interview_id": iv["id"], "resume_id": res["id"], "course_id": course["course"]["id"], "key": "m1l1", "i": 0,
           "pid": proj["project"]["id"], "doc_id": doc["document"]["id"], "job_id": course["job"]["id"], "sid": 999999}
    client.post("/api/auth/logout")
    register(client, email="mallory@example.com", name="Mallory")

    owned = [(m, p) for m, p in api_routes() if re.search(r"\{(?!slug\})\w+\}", p)]
    assert len(owned) > 30
    for method, path in owned:
        url = fill(path, ids)
        r = client.request(method, url, json=BODY if method in ("POST", "PUT", "PATCH", "DELETE") else None)
        assert r.status_code == 404, f"{method} {path} gave {r.status_code} to another user"


def test_security_headers_and_csrf(client):
    register(client)
    r = client.get("/api/auth/me")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"
    assert r.headers["cache-control"] == "no-store"
    raw = TestClient(app, cookies=client.cookies)
    for method, path in api_routes():
        if method in ("POST", "PUT", "PATCH", "DELETE") and (method, path) not in PUBLIC:
            assert raw.request(method, fill(path, {"slug": "two-sum"}), json={}).status_code == 403, path


def test_session_cookie_flags(client):
    r = client.post("/api/auth/register", json={"email": "c@example.com", "password": "secret123", "full_name": "C"})
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "path=/" in cookie


def test_tampered_or_foreign_tokens_are_rejected(client):
    import jwt
    register(client)
    good = client.cookies.get("skillverse_session")
    payload = jwt.decode(good, options={"verify_signature": False})
    forged = jwt.encode({**payload, "sub": "1"}, "wrong-secret", algorithm="HS256")
    none_alg = jwt.encode({**payload}, key="", algorithm="none")
    anon = TestClient(app)
    for token in (forged, none_alg, good[:-3] + "abc"):
        assert anon.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
