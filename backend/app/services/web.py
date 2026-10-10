"""Web search providers and SSRF-safe page fetching for the research agent."""

from __future__ import annotations

import ipaddress
import logging
import re
import socket
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from ..config import Settings

log = logging.getLogger(__name__)
USER_AGENT = "SkillVerseResearchBot/1.0 (+https://github.com/; educational research assistant)"


class SearchError(Exception):
    pass


class FetchError(Exception):
    pass


@dataclass
class SearchResult:
    title: str
    url: str
    snippet: str


# ---------- search ----------
def search(settings: Settings, query: str, limit: int = 5) -> list[SearchResult]:
    p = settings.search_provider
    if p == "none":
        return []
    try:
        if p == "searxng":
            r = httpx.get(f"{settings.searxng_url.rstrip('/')}/search", params={"q": query, "format": "json"},
                          timeout=15, headers={"User-Agent": USER_AGENT})
            r.raise_for_status()
            items = [(x.get("title", ""), x.get("url", ""), x.get("content", "")) for x in r.json().get("results", [])]
        elif p == "brave":
            if not settings.brave_api_key:
                raise SearchError("BRAVE_API_KEY is not set.")
            r = httpx.get("https://api.search.brave.com/res/v1/web/search", params={"q": query, "count": limit},
                          headers={"X-Subscription-Token": settings.brave_api_key, "Accept": "application/json"},
                          timeout=15)
            r.raise_for_status()
            items = [(x.get("title", ""), x.get("url", ""), x.get("description", ""))
                     for x in r.json().get("web", {}).get("results", [])]
        elif p == "tavily":
            if not settings.tavily_api_key:
                raise SearchError("TAVILY_API_KEY is not set.")
            r = httpx.post("https://api.tavily.com/search", json={"query": query, "max_results": limit},
                           headers={"Authorization": f"Bearer {settings.tavily_api_key}"}, timeout=20)
            r.raise_for_status()
            items = [(x.get("title", ""), x.get("url", ""), x.get("content", "")) for x in r.json().get("results", [])]
        else:
            raise SearchError(f"Unknown search provider {p}.")
    except httpx.HTTPError as e:
        raise SearchError(f"Web search ({p}) failed: {e.__class__.__name__}") from e
    except ValueError as e:
        raise SearchError(f"Web search ({p}) returned an unexpected response.") from e
    out, seen = [], set()
    for title, url, snippet in items:
        if not url.startswith(("http://", "https://")) or url in seen:
            continue
        seen.add(url)
        out.append(SearchResult(clean(title)[:300] or url, url, clean(BeautifulSoup(snippet or "", "html.parser").get_text())[:600]))
        if len(out) >= limit:
            break
    return out


# ---------- SSRF-safe fetch ----------
def _assert_public(url: str, allow_private: bool) -> None:
    u = urlparse(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        raise FetchError("Only http(s) URLs can be fetched.")
    if u.username or u.password:
        raise FetchError("URLs with credentials are not allowed.")
    if allow_private:
        return
    try:
        infos = socket.getaddrinfo(u.hostname, u.port or (443 if u.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise FetchError("Host could not be resolved.") from e
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global or ip.is_multicast:
            raise FetchError("Refusing to fetch a private or internal address.")


def fetch_page(url: str, settings: Settings) -> tuple[str, str]:
    """Download a public web page and return (title, readable text). Follows up to 4 redirects, re-checking each hop."""
    current = url
    with httpx.Client(timeout=settings.fetch_timeout_seconds, follow_redirects=False,
                      headers={"User-Agent": USER_AGENT, "Accept": "text/html,text/plain;q=0.9,*/*;q=0.1"}) as client:
        for _ in range(5):
            _assert_public(current, settings.allow_private_fetch)
            try:
                with client.stream("GET", current) as r:
                    if r.is_redirect:
                        loc = r.headers.get("location")
                        if not loc:
                            raise FetchError("Redirect without a location.")
                        current = urljoin(current, loc)
                        continue
                    if r.status_code >= 400:
                        raise FetchError(f"HTTP {r.status_code}")
                    ctype = r.headers.get("content-type", "").lower()
                    if not any(t in ctype for t in ("text/html", "text/plain", "application/xhtml")):
                        raise FetchError(f"Unsupported content type ({ctype.split(';')[0] or 'unknown'}).")
                    body = b""
                    for chunk in r.iter_bytes():
                        body += chunk
                        if len(body) > settings.fetch_max_bytes:
                            break
                    encoding = r.encoding or "utf-8"
            except httpx.HTTPError as e:
                raise FetchError(f"Download failed ({e.__class__.__name__}).") from e
            text = body.decode(encoding, errors="replace")
            if "text/plain" in ctype:
                return "", clean_block(text)
            return html_to_text(text)
    raise FetchError("Too many redirects.")


# ---------- text helpers ----------
_WS = re.compile(r"[ \t ]+")


def clean(s: str) -> str:
    return _WS.sub(" ", s or "").strip()


def clean_block(s: str) -> str:
    lines = [clean(line) for line in (s or "").splitlines()]
    out, blank = [], False
    for line in lines:
        if line:
            out.append(line)
            blank = False
        elif not blank:
            out.append("")
            blank = True
    return "\n".join(out).strip()


def html_to_text(html: str) -> tuple[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    title = clean(soup.title.get_text()) if soup.title else ""
    for tag in soup(["script", "style", "noscript", "svg", "nav", "footer", "header", "aside", "form", "iframe",
                     "button", "template"]):
        tag.decompose()
    root = soup.find("article") or soup.find("main") or soup.body or soup
    parts = []
    for el in root.find_all(["h1", "h2", "h3", "h4", "p", "li", "pre", "blockquote", "td"]):
        t = clean(el.get_text(" "))
        if len(t) >= 25 or el.name in ("h1", "h2", "h3"):
            parts.append(t)
    text = "\n\n".join(dict.fromkeys(parts))  # de-duplicate while keeping order
    if len(text) < 200:
        text = clean_block(root.get_text("\n"))
    return title[:300], text


def chunk_text(text: str, size: int = 900, overlap: int = 150) -> list[str]:
    """Split text into overlapping chunks on paragraph/sentence boundaries."""
    text = text.strip()
    if not text:
        return []
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    pieces: list[str] = []
    for p in paras:
        if len(p) <= size:
            pieces.append(p)
        else:
            sentences = re.split(r"(?<=[.!?])\s+", p)
            buf = ""
            for s in sentences:
                while len(s) > size:  # extremely long "sentence"
                    pieces.append(s[:size])
                    s = s[size - overlap:]
                if len(buf) + len(s) + 1 > size and buf:
                    pieces.append(buf)
                    buf = buf[-overlap:] + " " + s
                else:
                    buf = f"{buf} {s}".strip()
            if buf:
                pieces.append(buf)
    chunks, buf = [], ""
    for piece in pieces:
        if len(buf) + len(piece) + 2 > size and buf:
            chunks.append(buf)
            buf = piece
        else:
            buf = f"{buf}\n\n{piece}".strip()
    if buf:
        chunks.append(buf)
    return chunks
