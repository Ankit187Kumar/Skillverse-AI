"""Application settings, loaded from environment variables (and an optional .env file)."""

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

INSECURE_DEV_SECRET = "dev-only-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "SkillVerse AI"
    environment: Literal["development", "production", "test"] = "development"

    # Database: SQLite for the MVP; any SQLAlchemy URL works (e.g. postgresql+psycopg://...)
    database_url: str = "sqlite:///./skillverse.db"

    # Auth
    jwt_secret: str = INSECURE_DEV_SECRET
    jwt_algorithm: str = "HS256"
    session_minutes: int = 60 * 24 * 7
    cookie_name: str = "skillverse_session"
    cookie_secure: bool = False  # set true behind HTTPS in production

    # CORS (only needed if the frontend calls the API directly instead of via the Next.js proxy)
    cors_origins: str = "http://localhost:3000"  # comma-separated

    # AI provider
    llm_provider: Literal["ollama", "openai_compatible"] = "ollama"
    llm_timeout_seconds: float = 180.0
    llm_temperature: float = 0.4
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2:3b"
    ollama_num_ctx: int = 8192  # Ollama's default context window is small; transcripts need more
    openai_base_url: str = "https://api.openai.com/v1"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # Embeddings (research document search). Falls back to keyword search if unavailable.
    embedding_model: str = "nomic-embed-text"

    # Background jobs (course/lesson generation, research runs, AI roadmaps)
    job_workers: int = 2
    jobs_inline: bool = False  # run jobs synchronously (tests only)

    # Web search for the research agent: none | searxng | brave | tavily
    search_provider: Literal["none", "searxng", "brave", "tavily"] = "none"
    searxng_url: str = "http://localhost:8888"
    brave_api_key: str = ""
    tavily_api_key: str = ""
    research_max_sources: int = 8
    research_context_chars: int = 12000  # passages sent to the model; raise for large-context models
    fetch_timeout_seconds: float = 12.0
    fetch_max_bytes: int = 2_000_000
    allow_private_fetch: bool = False  # never enable in production (SSRF protection)

    # Code execution sandbox: none | piston | judge0. Code never runs on the app server.
    code_runner: Literal["none", "piston", "judge0"] = "none"
    piston_url: str = "http://localhost:2000"
    judge0_url: str = "http://localhost:2358"
    judge0_api_key: str = ""
    code_run_timeout_ms: int = 3000
    code_memory_limit_mb: int = 256

    # Voice. STT: none | browser | openai_compatible. TTS: browser | openai_compatible
    stt_provider: Literal["none", "browser", "openai_compatible"] = "browser"
    stt_base_url: str = "http://localhost:8001/v1"
    stt_api_key: str = ""
    stt_model: str = "Systran/faster-whisper-small"
    tts_provider: Literal["browser", "openai_compatible"] = "browser"
    tts_base_url: str = "http://localhost:8001/v1"
    tts_api_key: str = ""
    tts_model: str = "tts-1"
    tts_voice: str = "alloy"
    max_audio_mb: int = 10

    # Uploads
    max_upload_mb: int = 5
    max_document_mb: int = 15

    # Rate limits (requests per minute)
    rate_limit_auth_per_minute: int = 10
    rate_limit_ai_per_minute: int = 30
    rate_limit_upload_per_minute: int = 10

    @field_validator("database_url")
    @classmethod
    def _use_psycopg_driver(cls, url: str) -> str:
        # Hosts such as Render hand out postgres:// or postgresql:// URLs; SQLAlchemy needs the driver named.
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix):]
        return url

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def active_model(self) -> str:
        return self.ollama_model if self.llm_provider == "ollama" else self.openai_model

    def validate_for_runtime(self) -> None:
        if self.environment == "production":
            if self.jwt_secret == INSECURE_DEV_SECRET or len(self.jwt_secret) < 32:
                raise RuntimeError("JWT_SECRET must be set to a random value of at least 32 characters in production.")
            if not self.cookie_secure:
                raise RuntimeError("COOKIE_SECURE must be true in production (serve over HTTPS).")


@lru_cache
def get_settings() -> Settings:
    return Settings()
