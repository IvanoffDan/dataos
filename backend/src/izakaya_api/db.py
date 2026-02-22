from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from izakaya_api.config import settings

engine = create_engine(settings.database_url, pool_size=5, max_overflow=5)
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass
