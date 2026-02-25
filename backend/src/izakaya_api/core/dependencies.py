from collections.abc import Generator
from functools import lru_cache

from fastapi import Cookie, Depends
from google.cloud import bigquery
from sqlalchemy.orm import Session

from izakaya_api.config import settings
from izakaya_api.core.database import SessionLocal
from izakaya_api.core.exceptions import AuthenticationError


def get_db() -> Generator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    session_user_id: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
):
    from izakaya_api.domains.auth.models import User

    if not session_user_id:
        raise AuthenticationError()
    user = db.get(User, int(session_user_id))
    if not user:
        raise AuthenticationError()
    return user


@lru_cache
def get_bq_client() -> bigquery.Client:
    return bigquery.Client(project=settings.bq_project_id)
