from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import auth_rate_limit, get_current_user
from ..models import User
from ..schemas import LoginIn, RegisterIn, UserOut
from ..security import create_session_token, hash_password, verify_password
from ..services.activity import current_streak, record_activity

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Used to keep login timing similar whether or not the email exists.
_DUMMY_HASH = hash_password("timing-equaliser-1")


def _set_session(response: Response, user_id: int) -> None:
    s = get_settings()
    response.set_cookie(
        s.cookie_name, create_session_token(user_id), max_age=s.session_minutes * 60,
        httponly=True, secure=s.cookie_secure, samesite="lax", path="/",
    )


def user_out(user: User) -> UserOut:
    out = UserOut.model_validate(user)
    out.streak_count = current_streak(user)
    return out


@router.post("/register", response_model=UserOut, status_code=201, dependencies=[Depends(auth_rate_limit)])
def register(body: RegisterIn, response: Response, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")
    user = User(email=email, password_hash=hash_password(body.password), full_name=body.full_name.strip(),
                skills=[], target_roles=[], learning_goals=[])
    db.add(user)
    db.commit()
    db.refresh(user)
    record_activity(db, user, "joined", "Joined SkillVerse AI")
    _set_session(response, user.id)
    return user_out(user)


@router.post("/login", response_model=UserOut, dependencies=[Depends(auth_rate_limit)])
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password.")
    _set_session(response, user.id)
    return user_out(user)


@router.post("/logout", status_code=204)
def logout(response: Response):
    s = get_settings()
    response.delete_cookie(s.cookie_name, path="/", httponly=True, secure=s.cookie_secure, samesite="lax")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user_out(user)
