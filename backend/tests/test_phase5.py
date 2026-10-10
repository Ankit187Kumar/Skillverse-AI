import httpx

from app.config import get_settings
from app.routers import voice as voice_mod

from .conftest import register
from .test_api import CONFIG


def finish_interview(client):
    iv = client.post("/api/interviews", json=CONFIG).json()
    for i in range(3):
        client.post(f"/api/interviews/{iv['id']}/answer", json={"answer": f"answer {i}", "elapsed_seconds": 60})
    client.post(f"/api/interviews/{iv['id']}/end", json={"elapsed_seconds": 240})
    return iv


def test_analytics_overview_goals_badges_and_recommendations(client):
    register(client)
    finish_interview(client)
    c = client.post("/api/learning/courses", json={"topic": "Python"}).json()["course"]
    client.post(f"/api/learning/courses/{c['id']}/lessons/m1l1/complete")
    ov = client.get("/api/analytics/overview", params={"tz": 330}).json()
    assert ov["interviews"]["completed"] == 1 and ov["interviews"]["average"] == 72.5
    assert ov["learning"]["lessons_completed"] == 1 and ov["learning"]["progress"] == 33
    assert ov["coding"]["total"] >= 20 and ov["coding"]["solved"] == 0
    assert ov["streak"]["current"] == 1 and len(ov["streak"]["heatmap"]) == 84
    assert any(b["id"] == "first_step" and b["earned"] for b in ov["badges"])
    assert any(b["id"] == "lifelong_learner" and b["earned"] for b in ov["badges"])
    kinds = {r["kind"] for r in ov["recommendations"]}
    assert {"learn", "coding"} <= kinds
    assert all(r["href"].startswith("/") for r in ov["recommendations"])
    lessons = next(g for g in ov["goals"]["weekly"] if g["key"] == "lessons")
    assert lessons["done"] == 1 and lessons["target"] == 5
    assert any(s["source"] == "interviews" for s in ov["skills"])

    g = client.put("/api/analytics/goals", json={"weekly": {"interviews": 3, "lessons": 1, "problems": 0, "research": 0},
                                                 "daily": 4}).json()
    assert g["daily"]["target"] == 4 and next(x for x in g["weekly"] if x["key"] == "lessons")["target"] == 1
    assert client.put("/api/analytics/goals", json={"weekly": {"interviews": -1, "lessons": 1, "problems": 0, "research": 0},
                                                    "daily": 1}).status_code == 422

    dash = client.get("/api/dashboard", params={"tz": 330}).json()
    assert dash["stats"]["lessons_completed"] == 1 and dash["courses"][0]["title"] == "Python Foundations"


def test_ai_roadmap(client):
    register(client)
    assert client.get("/api/analytics/roadmap").json()["roadmap"] is None
    job = client.post("/api/analytics/roadmap").json()
    assert job["status"] == "succeeded"
    r = client.get("/api/analytics/roadmap").json()
    assert r["roadmap"]["focus_areas"][0]["title"] == "Communication" and r["model_name"] == "fake-model"


def test_voice_config_and_transcription(client, monkeypatch):
    register(client)
    assert client.get("/api/voice/config").json()["stt"] == "browser"
    audio = {"audio": ("a.webm", b"\x1aE\xdf\xa3" + b"0" * 4000, "audio/webm")}
    assert client.post("/api/voice/transcribe", files=audio).status_code == 409  # browser mode: server STT is off

    s = get_settings()
    monkeypatch.setattr(s, "stt_provider", "openai_compatible")
    sent = {}

    def fake_post(url, data=None, files=None, headers=None, timeout=None, json=None):
        sent.update(url=url, data=data, name=files["file"][0])
        return httpx.Response(200, json={"text": " I would use a hash map. "}, request=httpx.Request("POST", url))

    monkeypatch.setattr(voice_mod.httpx, "post", fake_post)
    r = client.post("/api/voice/transcribe", files=audio, data={"language": "Hindi"})
    assert r.status_code == 200 and r.json()["text"] == "I would use a hash map."
    assert sent["url"].endswith("/audio/transcriptions") and sent["data"]["language"] == "hi"
    assert client.post("/api/voice/transcribe", files={"audio": ("a.txt", b"x" * 2000, "text/plain")}).status_code == 415
    assert client.post("/api/voice/transcribe", files={"audio": ("a.webm", b"x" * 10, "audio/webm")}).status_code == 400
    monkeypatch.setattr(s, "max_audio_mb", 0)
    assert client.post("/api/voice/transcribe", files=audio).status_code == 413


def test_tts_proxy(client, monkeypatch):
    register(client)
    assert client.post("/api/voice/speak", json={"text": "Hello"}).status_code == 409
    monkeypatch.setattr(get_settings(), "tts_provider", "openai_compatible")
    monkeypatch.setattr(voice_mod.httpx, "post", lambda url, **kw: httpx.Response(
        200, content=b"ID3fake", headers={"content-type": "audio/mpeg"}, request=httpx.Request("POST", url)))
    r = client.post("/api/voice/speak", json={"text": "Hello"})
    assert r.status_code == 200 and r.content == b"ID3fake" and r.headers["content-type"] == "audio/mpeg"
