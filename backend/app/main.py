import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .deps import get_current_user, get_llm
from .database import SessionLocal
from .routers import (analytics, auth, coding, dashboard, documents, interviews, jobs, learning, research, resumes,
                      users, voice)
from .services.coding import seed_problems
from .services.jobs import recover_interrupted
from .services.llm import LLMError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

settings = get_settings()
settings.validate_for_runtime()



@asynccontextmanager
async def lifespan(_: FastAPI):
    recover_interrupted()
    with SessionLocal() as db:
        seed_problems(db)
    yield


app = FastAPI(
    title="SkillVerse AI API",
    version="1.0.0",
    description="Backend for SkillVerse AI — Learn. Practice. Evolve.",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-SkillVerse-Client"],
)

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def security_headers_and_csrf(request: Request, call_next):
    # CSRF defence for cookie sessions: state-changing requests must carry a custom header,
    # which a cross-site HTML form cannot send and cross-site scripts cannot send without passing CORS.
    if request.method in UNSAFE and request.url.path.startswith("/api/") and \
            request.cookies.get(settings.cookie_name) and request.headers.get("x-skillverse-client") != "web":
        return JSONResponse({"detail": "Missing client header."}, status_code=403)
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-Frame-Options", "DENY")
    if request.url.path.startswith("/api/") and not request.url.path.startswith(("/api/docs", "/api/redoc")):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


@app.exception_handler(LLMError)
async def llm_error_handler(_: Request, exc: LLMError):
    return JSONResponse({"detail": str(exc), "code": "ai_unavailable"}, status_code=503)


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    errors = [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"].removeprefix("Value error, ")}
              for e in exc.errors()]
    first = errors[0] if errors else {"field": "", "message": "Invalid request."}
    msg = f"{first['field']}: {first['message']}" if first["field"] else first["message"]
    return JSONResponse({"detail": msg, "errors": errors}, status_code=422)


for r in (auth.router, users.router, resumes.router, interviews.router, dashboard.router, jobs.router,
          learning.router, documents.router, research.router, coding.router, voice.router, analytics.router):
    app.include_router(r)


@app.get("/api/health", tags=["system"])
def health():
    return {"status": "ok", "app": settings.app_name}


@app.get("/api/system/ai-status", tags=["system"])
def ai_status(llm=Depends(get_llm), _user=Depends(get_current_user)):
    """Is the configured model reachable? Used by the UI to show a helpful setup banner."""
    return llm.status()
