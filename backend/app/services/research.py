"""Phase 3: research agent — plan, gather sources, retrieve passages, write a cited report."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import User
from ..models_research import Document, ResearchProject, ResearchSource
from . import web
from .activity import record_activity
from .jobs import JobContext
from .llm import LLMError, LLMProvider, generate_json
from .retrieval import Passage, _KeywordOnly, document_candidates, rank_passages


# ---------- LLM schemas ----------
class SubQuestion(BaseModel):
    question: str = Field(min_length=5, max_length=400)
    search_queries: list[str] = Field(default_factory=list, max_length=4)


class PlanOut(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    objective: str = ""
    scope: str = ""
    sub_questions: list[SubQuestion] = Field(min_length=2, max_length=8)
    key_terms: list[str] = Field(default_factory=list)


def _to_ints(v) -> list[int]:
    out = []
    for x in v or []:
        try:
            out.append(int(str(x).strip("[] ")))
        except ValueError:
            continue
    return out


class Claim(BaseModel):
    text: str
    citations: list[int] = Field(default_factory=list)
    kind: str = "fact"

    @field_validator("kind")
    @classmethod
    def norm(cls, v: str) -> str:
        return "interpretation" if "interp" in v.lower() or "analysis" in v.lower() else "fact"

    @field_validator("citations", mode="before")
    @classmethod
    def ints(cls, v):
        return _to_ints(v)


class Section(BaseModel):
    heading: str
    paragraphs: list[Claim] = Field(min_length=1)


class Viewpoint(BaseModel):
    perspective: str
    summary: str
    citations: list[int] = Field(default_factory=list)

    @field_validator("citations", mode="before")
    @classmethod
    def ints(cls, v):
        return _to_ints(v)


class ReportOut(BaseModel):
    title: str
    executive_summary: list[Claim] = Field(min_length=1)
    sections: list[Section] = Field(min_length=1)
    key_findings: list[Claim] = Field(default_factory=list)
    viewpoints: list[Viewpoint] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)


# ---------- prompts ----------
def plan_messages(p: ResearchProject, user: User, has_docs: bool, has_web: bool) -> list[dict]:
    system = f"""You are a meticulous research planner. Break the research request into a plan.
Field: {p.field}
Request: {p.prompt}
Goals: {p.goals or 'not specified'}
Available sources: {'web search' if has_web else 'no web search'}{', the user uploaded documents' if has_docs else ''}.

Produce 3-6 focused sub-questions that together answer the request, each with 1-3 short web search queries
(keywords, not sentences). Include sub-questions that surface different viewpoints or evidence quality where relevant.
Write in {user.preferred_language or 'English'}.
Reply with JSON only:
{{"title": "short report title", "objective": "one sentence", "scope": "what is in and out of scope",
  "sub_questions": [{{"question": "...", "search_queries": ["...", "..."]}}], "key_terms": ["..."]}}"""
    return [{"role": "system", "content": system}, {"role": "user", "content": "Create the research plan."}]


def report_messages(p: ResearchProject, user: User, sources: list[dict]) -> list[dict]:
    if sources:
        src_text = "\n\n".join(
            f"[{s['number']}] {s['title']} ({s['url'] or 'uploaded document'})\n{s['excerpt']}" for s in sources)
        rules = f"""Use ONLY the numbered sources below for factual claims, and cite them as numbers in "citations".
- A "fact" paragraph must be directly supported by the cited sources. Never cite a number that is not listed.
- Your own synthesis, opinions, comparisons or predictions must be marked "kind": "interpretation".
- If sources disagree, say so in "viewpoints". If the sources don't cover something, say so in "limitations".
- Do not invent statistics, names, dates or quotes that are not in the sources.

SOURCES:
{src_text}"""
    else:
        rules = """No sources are available for this run. Every paragraph MUST be "kind": "interpretation" with no
citations, and "limitations" must state that the report is based on the model's general knowledge and is unverified."""
    plan = json.dumps((p.plan or {}).get("sub_questions", []), ensure_ascii=False)
    system = f"""You are a careful research analyst writing a structured report.
Request: {p.prompt}
Goals: {p.goals or 'not specified'}
Plan (sub-questions to cover): {plan}

{rules}

Write in {user.preferred_language or 'English'}. Use plain text in paragraphs (no Markdown headings inside).
Reply with JSON only:
{{"title": "...",
  "executive_summary": [{{"text": "...", "citations": [1], "kind": "fact"}}],
  "sections": [{{"heading": "...", "paragraphs": [{{"text": "...", "citations": [1, 2], "kind": "fact" | "interpretation"}}]}}],
  "key_findings": [{{"text": "...", "citations": [2], "kind": "fact"}}],
  "viewpoints": [{{"perspective": "...", "summary": "...", "citations": [3]}}],
  "limitations": ["..."], "open_questions": ["..."]}}"""
    return [{"role": "system", "content": system}, {"role": "user", "content": "Write the report now."}]


# ---------- validation ----------
def validate_report(report: ReportOut, valid_numbers: set[int]) -> tuple[dict, set[int], int]:
    """Drop citations to sources that don't exist; demote uncited 'facts' to flagged interpretations."""
    used: set[int] = set()
    removed = 0

    def fix(claim: dict) -> dict:
        nonlocal removed
        good = [n for n in dict.fromkeys(claim.get("citations", [])) if n in valid_numbers]
        removed += len(claim.get("citations", [])) - len(good)
        used.update(good)
        claim["citations"] = good
        if claim.get("kind") == "fact" and not good:
            claim["kind"] = "interpretation"
            claim["unsupported"] = True  # the model presented it as fact but gave no valid source
        return claim

    data = report.model_dump()
    data["executive_summary"] = [fix(c) for c in data["executive_summary"]]
    data["key_findings"] = [fix(c) for c in data["key_findings"]]
    for s in data["sections"]:
        s["paragraphs"] = [fix(c) for c in s["paragraphs"]]
    for v in data["viewpoints"]:
        good = [n for n in dict.fromkeys(v["citations"]) if n in valid_numbers]
        removed += len(v["citations"]) - len(good)
        used.update(good)
        v["citations"] = good
    return data, used, removed


# ---------- jobs ----------
def build_plan_job(project_id: int):
    def run(db: Session, ctx: JobContext, llm: LLMProvider):
        p = db.get(ResearchProject, project_id)
        user = db.get(User, p.user_id)
        ctx.progress(15, "Breaking the topic into sub-questions")
        has_web = p.use_web and get_settings().search_provider != "none"
        out = generate_json(llm, plan_messages(p, user, bool(p.document_ids), has_web), PlanOut, temperature=0.4)
        p.plan = out.model_dump()
        p.title = out.title
        p.status, p.error = "planned", None
        db.commit()
    return run


def build_run_job(project_id: int):
    def run(db: Session, ctx: JobContext, llm: LLMProvider):
        settings = get_settings()
        p = db.get(ResearchProject, project_id)
        user = db.get(User, p.user_id)
        subqs = (p.plan or {}).get("sub_questions") or [{"question": p.prompt, "search_queries": [p.prompt[:120]]}]
        notes: dict = {"search_provider": settings.search_provider if p.use_web else "disabled", "search_errors": [],
                       "fetch_failures": [], "retrieval_mode": "none", "started_at": datetime.now(timezone.utc).isoformat()}
        for s in list(p.sources):
            p.sources.remove(s)
        db.flush()

        # 1) Web: search each query and read the pages.
        pages: dict[str, dict] = {}
        if p.use_web and settings.search_provider != "none":
            queries = [q for sq in subqs for q in (sq.get("search_queries") or [sq["question"]])][:12]
            for i, q in enumerate(queries):
                ctx.progress(5 + int(30 * i / max(1, len(queries))), f"Searching: {q[:80]}")
                try:
                    for res in web.search(settings, q, limit=4):
                        pages.setdefault(res.url, {"title": res.title, "snippet": res.snippet, "query": q})
                except web.SearchError as e:
                    notes["search_errors"].append(str(e))
                if len(pages) >= settings.research_max_sources * 2:
                    break
            for i, (url, info) in enumerate(list(pages.items())[: settings.research_max_sources * 2]):
                ctx.progress(35 + int(25 * i / max(1, len(pages))), f"Reading {url[:70]}")
                try:
                    title, text = web.fetch_page(url, settings)
                    info["title"] = title or info["title"]
                    info["text"], info["fetched"] = text[:60000], True
                except web.FetchError as e:
                    info["text"], info["fetched"] = info["snippet"], False
                    notes["fetch_failures"].append({"url": url, "reason": str(e)})

        # 2) Candidate passages from pages and documents.
        candidates: list[Passage] = []
        for url, info in pages.items():
            for chunk in web.chunk_text(info.get("text", ""))[:40]:
                candidates.append(Passage(chunk, 0.0, f"web:{url}", {"title": info["title"], "url": url,
                                                                    "query": info["query"], "fetched": info["fetched"]}))
        precomputed = {}
        if p.document_ids:
            doc_passages, doc_pre = document_candidates(db, p.user_id, p.document_ids)
            offset = len(candidates)
            candidates.extend(doc_passages)
            if len(doc_pre) == len(doc_passages):
                precomputed = {offset + i: v for i, v in doc_pre.items()}

        # 3) Embed every candidate once, then rank passages per sub-question.
        ctx.progress(60, f"Indexing {len(candidates)} passages")
        ranker: LLMProvider = llm
        missing = [i for i in range(len(candidates)) if i not in precomputed]
        try:
            for start in range(0, len(missing), 64):
                batch = missing[start:start + 64]
                for i, v in zip(batch, llm.embed([candidates[i].text for i in batch])):
                    precomputed[i] = v
        except LLMError:
            precomputed, ranker = {}, _KeywordOnly()
        ctx.progress(65, "Selecting the most relevant passages")
        chosen: dict[str, list[str]] = {}
        meta: dict[str, dict] = {}
        modes = set()
        for sq in subqs:
            if not candidates:
                break
            pool = [Passage(c.text, 0.0, c.source_key, c.meta) for c in candidates]
            top, mode = rank_passages(ranker, sq["question"], pool, precomputed or None, top_k=4)
            modes.add(mode)
            for t in top:
                chosen.setdefault(t.source_key, [])
                if t.text not in chosen[t.source_key]:
                    chosen[t.source_key].append(t.text)
                meta[t.source_key] = t.meta
        notes["retrieval_mode"] = "semantic" if modes == {"semantic"} else ("keyword" if modes else "none")

        budget = settings.research_context_chars
        per_source = max(800, budget // max(1, len(chosen)))
        sources_for_prompt = []
        for n, (key, passages) in enumerate(list(chosen.items())[: settings.research_max_sources + 4], start=1):
            excerpt = "\n…\n".join(passages)[:per_source]
            m = meta[key]
            is_doc = key.startswith("doc:")
            src = ResearchSource(number=n, kind="document" if is_doc else "web", title=m["title"][:400],
                                 url=None if is_doc else m["url"], document_id=m.get("document_id"),
                                 query=m.get("query", "")[:400], excerpt=excerpt, fetched=True if is_doc else m["fetched"])
            p.sources.append(src)
            sources_for_prompt.append({"number": n, "title": src.title, "url": src.url, "excerpt": excerpt})
        db.flush()

        # 4) Write and validate the report.
        ctx.progress(70, f"Writing the report from {len(sources_for_prompt)} sources")
        out = generate_json(llm, report_messages(p, user, sources_for_prompt), ReportOut, temperature=0.3)
        data, used, removed = validate_report(out, {s["number"] for s in sources_for_prompt})
        if not sources_for_prompt and not any("general knowledge" in x.lower() for x in data["limitations"]):
            data["limitations"].insert(0, "No sources were retrieved for this run, so the report is based on the "
                                          "model's general knowledge and has not been checked against any source.")
        for s in p.sources:
            s.cited = s.number in used
        notes["invalid_citations_removed"] = removed
        notes["finished_at"] = datetime.now(timezone.utc).isoformat()
        p.report, p.notes = data, notes
        p.status, p.error, p.model_name = "ready", None, llm.model
        db.commit()
        record_activity(db, user, "research_completed", f"Finished research: {p.title}", f"/research/{p.id}")
    return run


# ---------- export ----------
def to_markdown(p: ResearchProject) -> str:
    r = p.report or {}

    def cite(c: dict) -> str:
        tag = "" if c.get("kind") == "fact" else (" *(interpretation — no supporting source)*" if c.get("unsupported")
                                                   else " *(interpretation)*")
        refs = "".join(f"[{n}]" for n in c.get("citations", []))
        return f"{c['text']}{(' ' + refs) if refs else ''}{tag}"

    lines = [f"# {r.get('title', p.title)}", "", f"_Research request:_ {p.prompt}", ""]
    lines += ["## Executive summary", ""] + [cite(c) for c in r.get("executive_summary", [])] + [""]
    if r.get("key_findings"):
        lines += ["## Key findings", ""] + [f"- {cite(c)}" for c in r["key_findings"]] + [""]
    for s in r.get("sections", []):
        lines += [f"## {s['heading']}", ""]
        for para in s["paragraphs"]:
            lines += [cite(para), ""]
    if r.get("viewpoints"):
        lines += ["## Viewpoints", ""]
        for v in r["viewpoints"]:
            refs = "".join(f"[{n}]" for n in v["citations"])
            lines.append(f"- **{v['perspective']}:** {v['summary']} {refs}".rstrip())
        lines.append("")
    if r.get("limitations"):
        lines += ["## Limitations", ""] + [f"- {x}" for x in r["limitations"]] + [""]
    if r.get("open_questions"):
        lines += ["## Open questions", ""] + [f"- {x}" for x in r["open_questions"]] + [""]
    lines += ["## Sources", ""]
    for s in p.sources:
        status = "read by the agent" if s.fetched else "search snippet only — page could not be read"
        where = s.url or f"uploaded document: {s.title}"
        lines.append(f"{s.number}. {s.title} — {where} ({status}{'' if s.cited else ', not cited'})")
    lines += ["", f"_Generated by SkillVerse AI ({p.model_name}). Paragraphs marked as interpretation are AI analysis, "
                  "not source-backed facts. Verify important claims against the sources._"]
    return "\n".join(lines)


def document_label(db: Session, ids: list[int]) -> list[dict]:
    rows = db.query(Document).filter(Document.id.in_(ids or [-1])).all()
    return [{"id": d.id, "filename": d.filename} for d in rows]
