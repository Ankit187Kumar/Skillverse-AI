from .conftest import register


def make_course(client):
    r = client.post("/api/learning/courses", json={"topic": "Python", "level": "Beginner", "goal": "automate tasks"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["job"]["status"] == "succeeded"
    return client.get(f"/api/learning/courses/{body['course']['id']}").json()


def test_course_outline_and_lessons(client):
    register(client)
    c = make_course(client)
    assert c["status"] == "ready" and c["title"] == "Python Foundations"
    assert [lesson["key"] for m in c["modules"] for lesson in m["lessons"]] == ["m1l1", "m1l2", "m2l1"]
    assert c["stats"]["total_lessons"] == 3 and c["stats"]["progress"] == 0
    assert c["recommendations"][0]["kind"] == "continue"

    lesson = client.get(f"/api/learning/courses/{c['id']}/lessons/m1l1").json()
    assert lesson["content"] is None and lesson["next_key"] == "m1l2"
    job = client.post(f"/api/learning/courses/{c['id']}/lessons/m1l1/generate").json()
    assert job["status"] == "succeeded"
    lesson = client.get(f"/api/learning/courses/{c['id']}/lessons/m1l1").json()
    content = lesson["content"]
    # answers and unrevealed help never leave the server
    assert all("answer_index" not in q for q in content["quiz"])
    assert content["exercises"][0]["hints"] == [] and content["exercises"][0]["solution"] is None
    assert content["exercises"][0]["hints_total"] == 2
    assert client.post(f"/api/learning/courses/{c['id']}/lessons/m1l1/generate").status_code == 409


def test_hints_before_solution(client):
    register(client)
    c = make_course(client)
    base = f"/api/learning/courses/{c['id']}/lessons/m1l1"
    client.post(f"{base}/generate")
    assert client.post(f"{base}/exercises/0/solution").status_code == 409
    ex = client.post(f"{base}/exercises/0/hint").json()
    assert ex["hints"] == ["Use a tuple"]
    client.post(f"{base}/exercises/0/hint")
    assert client.post(f"{base}/exercises/0/hint").status_code == 409
    assert client.post(f"{base}/exercises/0/solution").json()["solution"] == "a, b = b, a"
    fb = client.post(f"{base}/exercises/0/check", json={"answer": "temp = a; a = b"}).json()
    assert fb["feedback"]["verdict"] == "partially_correct"


def test_quiz_grading_mastery_and_resume(client):
    register(client)
    c = make_course(client)
    base = f"/api/learning/courses/{c['id']}/lessons/m1l1"
    client.post(f"{base}/generate")
    fail = client.post(f"{base}/quiz", json={"answers": [0, 0, 0, 1]}).json()
    assert fail["score"] == 25 and not fail["passed"]
    course = client.get(f"/api/learning/courses/{c['id']}").json()
    assert any(r["kind"] == "review" for r in course["recommendations"])
    assert client.post(f"{base}/simplify").json()["status"] == "succeeded"
    assert "labelled box" in client.get(base).json()["content"]["remedial"]["explanation"]
    ok = client.post(f"{base}/quiz", json={"answers": [1, 1, 1, 0]}).json()
    assert ok["passed"] and ok["status"] == "completed" and ok["best_quiz_score"] == 75
    course = client.get(f"/api/learning/courses/{c['id']}").json()
    assert course["stats"]["completed_lessons"] == 1 and course["stats"]["mastery"] == 75
    assert course["stats"]["resume_lesson_key"] == "m1l2"
    assert client.post(f"{base}/quiz", json={"answers": [1]}).status_code == 422


def test_course_completion_assessment_and_project(client):
    register(client)
    c = make_course(client)
    for key in ("m1l1", "m1l2", "m2l1"):
        client.post(f"/api/learning/courses/{c['id']}/lessons/{key}/complete")
    course = client.get(f"/api/learning/courses/{c['id']}").json()
    assert course["status"] == "completed" and course["stats"]["progress"] == 100
    assert client.post(f"/api/learning/courses/{c['id']}/assessment").json()["status"] == "succeeded"
    a = client.get(f"/api/learning/courses/{c['id']}/assessment").json()
    assert len(a["questions"]) == 6 and "answer_index" not in a["questions"][0]
    res = client.post(f"/api/learning/courses/{c['id']}/assessment/submit",
                      json={"answers": [0, 0, 0, 1, 1, 1]}).json()
    assert res["score"] == 50 and res["weak_modules"] == [1]
    assert client.post(f"/api/learning/courses/{c['id']}/project", json={"submission": "short"}).status_code == 422
    job = client.post(f"/api/learning/courses/{c['id']}/project",
                      json={"submission": "I built a CLI todo app with add/list/done commands and JSON storage."}).json()
    assert job["status"] == "succeeded"
    assert client.get(f"/api/learning/courses/{c['id']}").json()["project_feedback"]["score"] == 81


def test_outline_failure_and_retry(client, llm):
    register(client)
    llm.fail = True
    r = client.post("/api/learning/courses", json={"topic": "Rust"}).json()
    assert r["job"]["status"] == "failed"
    c = client.get(f"/api/learning/courses/{r['course']['id']}").json()
    assert c["status"] == "failed" and "offline" in c["error"]
    llm.fail = False
    r = client.post(f"/api/learning/courses/{c['id']}/retry").json()
    assert r["course"]["status"] == "ready"


def test_courses_are_private(client):
    register(client)
    c = make_course(client)
    client.post("/api/auth/logout")
    register(client, email="ravi@example.com", name="Ravi")
    assert client.get(f"/api/learning/courses/{c['id']}").status_code == 404
    assert client.get(f"/api/learning/courses/{c['id']}/lessons/m1l1").status_code == 404
    assert client.get("/api/learning/courses").json() == []
