import pytest

from app.config import get_settings
from app.services import web
from app.services.retrieval import bm25_rank

from .conftest import register

DOC = ("Rooftop solar adoption in India grew because of net metering policies and capital subsidies. "
       "Net metering lets households sell surplus power to the grid, lowering the payback time.\n\n"
       "Barriers include upfront cost, limited financing options and rooftop ownership in apartments. ") * 3


@pytest.mark.parametrize("url", ["http://127.0.0.1/admin", "http://localhost:8000/api", "http://10.0.0.5/",
                                 "http://169.254.169.254/latest/meta-data", "file:///etc/passwd", "ftp://example.com",
                                 "http://user:pw@example.com/"])
def test_fetch_blocks_internal_and_odd_urls(url):
    with pytest.raises(web.FetchError):
        web._assert_public(url, allow_private=False)


def test_html_extraction_and_chunking():
    title, text = web.html_to_text("<html><title>T</title><body><nav>menu menu</nav><script>evil()</script>"
                                   "<article><h1>Heading</h1><p>" + "Useful paragraph text here. " * 5 + "</p></article></body></html>")
    assert title == "T" and "Useful paragraph" in text and "evil" not in text and "menu" not in text
    chunks = web.chunk_text(DOC * 3, size=300, overlap=50)
    assert len(chunks) > 3 and all(len(c) <= 360 for c in chunks)


def test_bm25_prefers_relevant_text():
    scores = bm25_rank("net metering payback", ["cats and dogs", "net metering lowers payback", "solar panels"])
    assert scores.index(max(scores)) == 1


def upload(client, name="solar.txt", text=DOC):
    r = client.post("/api/documents", files={"file": (name, text.encode(), "text/plain")})
    assert r.status_code == 201, r.text
    return r.json()


def test_document_library_semantic_and_keyword(client, llm):
    register(client)
    d = upload(client)
    assert d["job"]["status"] == "succeeded"
    docs = client.get("/api/documents").json()
    assert docs[0]["embedded"] is True and docs[0]["chunk_count"] >= 1
    res = client.get("/api/documents/search", params={"q": "net metering payback"}).json()
    assert res["mode"] == "semantic" and "net metering" in res["results"][0]["text"].lower()
    llm.fail = True
    upload(client, "notes.md", "# Notes\n\nFinancing barriers for apartment owners are significant in big cities." * 2)
    assert client.get("/api/documents").json()[0]["embedded"] is False
    res = client.get("/api/documents/search", params={"q": "financing apartment"}).json()
    assert res["mode"] == "keyword" and res["results"]
    assert client.post("/api/documents", files={"file": ("x.exe", b"MZ" * 50, "application/octet-stream")}).status_code == 422


def test_research_with_documents_validates_citations(client):
    register(client)
    d = upload(client)["document"]
    r = client.post("/api/research/projects", json={"prompt": "Why is rooftop solar adoption growing in India?",
                                                    "use_web": False, "document_ids": [d["id"]]}).json()
    p = client.get(f"/api/research/projects/{r['project']['id']}").json()
    assert p["status"] == "planned" and len(p["plan"]["sub_questions"]) == 2
    p = client.put(f"/api/research/projects/{p['id']}/plan", json={"sub_questions": [
        {"question": "What drives rooftop solar adoption?", "search_queries": []}]}).json()
    assert len(p["plan"]["sub_questions"]) == 1
    assert client.post(f"/api/research/projects/{p['id']}/run").json()["status"] == "succeeded"
    p = client.get(f"/api/research/projects/{p['id']}").json()
    assert p["status"] == "ready" and len(p["sources"]) == 1 and p["sources"][0]["kind"] == "document"
    rep = p["report"]
    para = rep["sections"][0]["paragraphs"]
    assert para[0]["citations"] == [1]  # [99] did not exist and was removed
    assert para[1]["kind"] == "interpretation" and para[1]["unsupported"] is True
    assert rep["viewpoints"][0]["citations"] == []
    assert p["notes"]["invalid_citations_removed"] == 3
    assert p["sources"][0]["cited"] is True
    md = client.get(f"/api/research/projects/{p['id']}/export.md")
    assert md.status_code == 200 and "## Sources" in md.text and "interpretation" in md.text


def test_research_web_flow_marks_unread_sources(client, monkeypatch):
    register(client)
    s = get_settings()
    monkeypatch.setattr(s, "search_provider", "searxng")
    monkeypatch.setattr(web, "search", lambda settings, q, limit=4: [
        web.SearchResult("Solar policy", "https://example.org/policy", "Net metering policy summary snippet"),
        web.SearchResult("Blocked page", "https://example.org/blocked", "Barriers include financing snippet")])

    def fake_fetch(url, settings):
        if "blocked" in url:
            raise web.FetchError("HTTP 403")
        return "Solar policy explained", DOC

    monkeypatch.setattr(web, "fetch_page", fake_fetch)
    r = client.post("/api/research/projects", json={"prompt": "Why is rooftop solar adoption growing in India?",
                                                    "auto_run": True}).json()
    assert r["job"]["status"] == "succeeded"
    p = client.get(f"/api/research/projects/{r['project']['id']}").json()
    by_url = {x["url"]: x for x in p["sources"]}
    assert by_url["https://example.org/policy"]["fetched"] is True
    if "https://example.org/blocked" in by_url:
        assert by_url["https://example.org/blocked"]["fetched"] is False
    assert p["notes"]["fetch_failures"][0]["reason"] == "HTTP 403"
    assert p["notes"]["retrieval_mode"] == "semantic"


def test_research_without_sources_is_labelled_unverified(client):
    register(client)
    r = client.post("/api/research/projects", json={"prompt": "Explain the history of the printing press.",
                                                    "use_web": False, "auto_run": True}).json()
    p = client.get(f"/api/research/projects/{r['project']['id']}").json()
    assert p["sources"] == []
    rep = p["report"]
    assert all(c["kind"] == "interpretation" for c in rep["executive_summary"])
    assert "general knowledge" in rep["limitations"][0]


def test_research_privacy(client):
    register(client)
    d = upload(client)["document"]
    r = client.post("/api/research/projects", json={"prompt": "A private research question here", "use_web": False}).json()
    client.post("/api/auth/logout")
    register(client, email="ravi@example.com", name="Ravi")
    assert client.get(f"/api/research/projects/{r['project']['id']}").status_code == 404
    assert client.delete(f"/api/documents/{d['id']}").status_code == 404
    bad = client.post("/api/research/projects", json={"prompt": "Use someone else's document please",
                                                      "document_ids": [d["id"]]})
    assert bad.status_code == 400
    assert client.get("/api/documents/search", params={"q": "solar"}).json()["results"] == []
