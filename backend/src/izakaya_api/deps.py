from collections.abc import Generator

from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.orm import Session

from izakaya_api.db import SessionLocal
from izakaya_api.models.user import User


def get_db() -> Generator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    session_user_id: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not session_user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.get(User, int(session_user_id))
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user
