"""Model provider interface.

Every AI feature talks to an `LLMProvider`. Two implementations ship with the MVP:

* `OllamaProvider` – local open-source models via Ollama's /api/chat endpoint.
* `OpenAICompatibleProvider` – any hosted or self-hosted server that speaks the
  OpenAI chat-completions protocol (OpenAI, Groq, Together, OpenRouter, vLLM, LM Studio...).

`generate_json` adds structured-output handling on top: it asks for JSON, extracts the
object from the reply, validates it with a Pydantic model, and retries once with the
validation error if the model got the shape wrong.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Protocol, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from ..config import Settings

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)


class LLMError(Exception):
    """Raised when the model cannot be reached or returns unusable output."""


class LLMProvider(Protocol):
    name: str
    model: str

    def chat(self, messages: list[dict], *, json_mode: bool = False, temperature: float | None = None) -> str: ...

    def status(self) -> dict: ...

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class OllamaProvider:
    name = "ollama"

    def __init__(self, base_url: str, model: str, timeout: float, temperature: float, num_ctx: int = 8192,
                 embedding_model: str = "nomic-embed-text"):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.temperature = temperature
        self.num_ctx = num_ctx
        self.embedding_model = embedding_model

    def embed(self, texts):
        try:
            r = httpx.post(f"{self.base_url}/api/embed", json={"model": self.embedding_model, "input": texts},
                           timeout=self.timeout)
        except httpx.HTTPError as e:
            raise LLMError("Could not reach Ollama for embeddings.") from e
        if r.status_code >= 400:
            raise LLMError(f"Embedding model '{self.embedding_model}' unavailable. Run: ollama pull {self.embedding_model}")
        try:
            return r.json()["embeddings"]
        except (KeyError, ValueError) as e:
            raise LLMError("Unexpected embedding response from Ollama.") from e

    def chat(self, messages, *, json_mode=False, temperature=None):
        body = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": self.temperature if temperature is None else temperature,
                "num_ctx": self.num_ctx,
            },
        }
        if json_mode:
            body["format"] = "json"
        try:
            r = httpx.post(f"{self.base_url}/api/chat", json=body, timeout=self.timeout)
        except httpx.HTTPError as e:
            raise LLMError(f"Could not reach Ollama at {self.base_url}. Is `ollama serve` running? ({e.__class__.__name__})") from e
        if r.status_code == 404:
            raise LLMError(f"Model '{self.model}' is not available in Ollama. Run: ollama pull {self.model}")
        if r.status_code >= 400:
            raise LLMError(f"Ollama returned HTTP {r.status_code}: {r.text[:200]}")
        try:
            return r.json()["message"]["content"]
        except (KeyError, ValueError) as e:
            raise LLMError("Unexpected response format from Ollama.") from e

    def status(self):
        try:
            r = httpx.get(f"{self.base_url}/api/tags", timeout=5)
            r.raise_for_status()
            names = [m.get("name", "") for m in r.json().get("models", [])]
        except (httpx.HTTPError, ValueError):
            return {"provider": self.name, "model": self.model, "reachable": False, "model_available": False,
                    "message": f"Ollama is not reachable at {self.base_url}."}
        wanted = self.model if ":" in self.model else f"{self.model}:latest"
        available = wanted in names or self.model in names
        return {
            "provider": self.name, "model": self.model, "reachable": True, "model_available": available,
            "message": "Ready." if available else f"Model not pulled yet. Run: ollama pull {self.model}",
        }


class OpenAICompatibleProvider:
    name = "openai_compatible"

    def __init__(self, base_url: str, api_key: str, model: str, timeout: float, temperature: float,
                 embedding_model: str = "text-embedding-3-small"):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        self.temperature = temperature
        self.embedding_model = embedding_model

    def embed(self, texts):
        try:
            r = httpx.post(f"{self.base_url}/embeddings", json={"model": self.embedding_model, "input": texts},
                           headers=self._headers(), timeout=self.timeout)
        except httpx.HTTPError as e:
            raise LLMError("Could not reach the embedding provider.") from e
        if r.status_code >= 400:
            raise LLMError(f"Embedding request failed (HTTP {r.status_code}).")
        try:
            return [d["embedding"] for d in sorted(r.json()["data"], key=lambda d: d["index"])]
        except (KeyError, ValueError) as e:
            raise LLMError("Unexpected embedding response.") from e

    def _headers(self):
        return {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}

    def chat(self, messages, *, json_mode=False, temperature=None):
        body = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature if temperature is None else temperature,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        try:
            r = httpx.post(f"{self.base_url}/chat/completions", json=body, headers=self._headers(), timeout=self.timeout)
        except httpx.HTTPError as e:
            raise LLMError(f"Could not reach the model provider at {self.base_url}.") from e
        if r.status_code in (401, 403):
            raise LLMError("The model provider rejected the API key. Check OPENAI_API_KEY.")
        if r.status_code >= 400:
            raise LLMError(f"Model provider returned HTTP {r.status_code}: {r.text[:200]}")
        try:
            return r.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError, ValueError) as e:
            raise LLMError("Unexpected response format from the model provider.") from e

    def status(self):
        if not self.api_key and "localhost" not in self.base_url and "127.0.0.1" not in self.base_url:
            return {"provider": self.name, "model": self.model, "reachable": False, "model_available": False,
                    "message": "OPENAI_API_KEY is not set."}
        try:
            r = httpx.get(f"{self.base_url}/models", headers=self._headers(), timeout=8)
            ok = r.status_code < 400
        except httpx.HTTPError:
            ok = False
        return {"provider": self.name, "model": self.model, "reachable": ok, "model_available": ok,
                "message": "Ready." if ok else "Model provider is not reachable or rejected the key."}


def build_provider(settings: Settings) -> LLMProvider:
    if settings.llm_provider == "openai_compatible":
        return OpenAICompatibleProvider(settings.openai_base_url, settings.openai_api_key, settings.openai_model,
                                        settings.llm_timeout_seconds, settings.llm_temperature,
                                        settings.embedding_model)
    return OllamaProvider(settings.ollama_base_url, settings.ollama_model, settings.llm_timeout_seconds,
                          settings.llm_temperature, settings.ollama_num_ctx, settings.embedding_model)


_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def extract_json(text: str) -> dict:
    """Pull the first JSON object out of a model reply (handles code fences and chatter)."""
    text = text.strip()
    candidates = [text]
    m = _FENCE.search(text)
    if m:
        candidates.insert(0, m.group(1).strip())
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        candidates.append(text[start : end + 1])
    for c in candidates:
        try:
            value = json.loads(c)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    raise ValueError("No JSON object found in model output.")


def generate_json(provider: LLMProvider, messages: list[dict], schema: type[T], *, temperature: float | None = None,
                  retries: int = 1) -> T:
    convo = list(messages)
    last_error = ""
    for attempt in range(retries + 1):
        raw = provider.chat(convo, json_mode=True, temperature=temperature)
        try:
            return schema.model_validate(extract_json(raw))
        except (ValueError, ValidationError) as e:
            last_error = str(e)[:800]
            log.warning("LLM JSON validation failed (attempt %s): %s", attempt + 1, last_error)
            convo = convo + [
                {"role": "assistant", "content": raw[:4000]},
                {"role": "user", "content": "Your reply was not valid for the required JSON schema. "
                                            f"Error: {last_error}\nReply again with ONLY the corrected JSON object."},
            ]
    raise LLMError(f"The model returned output that did not match the expected format. ({last_error[:200]})")
