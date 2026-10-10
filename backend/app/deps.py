from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .models import User
from .security import client_ip, decode_session_token, limiter
from .services.llm import LLMProvider, build_provider


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(get_settings().cookie_name)
    if not token:
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
    user_id = decode_session_token(token) if token else None
    user = db.get(User, user_id) if user_id else None
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please sign in to continue.")
    return user


def get_llm() -> LLMProvider:
    return build_provider(get_settings())


def auth_rate_limit(request: Request) -> None:
    limiter.check(f"auth:{client_ip(request)}", get_settings().rate_limit_auth_per_minute)


def ai_rate_limit(user: User = Depends(get_current_user)) -> None:
    limiter.check(f"ai:{user.id}", get_settings().rate_limit_ai_per_minute)


def upload_rate_limit(user: User = Depends(get_current_user)) -> None:
    limiter.check(f"upload:{user.id}", get_settings().rate_limit_upload_per_minute)
