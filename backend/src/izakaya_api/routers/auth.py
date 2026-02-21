from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from izakaya_api.config import settings
from izakaya_api.deps import get_current_user, get_db
from izakaya_api.models.user import User
from izakaya_api.schemas.user import LoginRequest, UserResponse
from izakaya_api.services.auth import verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.execute(select(User).where(User.username == body.username)).scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    secure = settings.frontend_url.startswith("https")
    response.set_cookie(
        "session_user_id", str(user.id), httponly=True, samesite="lax", secure=secure
    )
    return UserResponse.model_validate(user)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("session_user_id")
    return {"detail": "Logged out"}


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)):
    return user
