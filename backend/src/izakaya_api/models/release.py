from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from izakaya_api.db import Base


class Release(Base):
    __tablename__ = "releases"

    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    entries: Mapped[list["ReleaseEntry"]] = relationship(back_populates="release", cascade="all, delete-orphan")


class ReleaseEntry(Base):
    __tablename__ = "release_entries"
    __table_args__ = (UniqueConstraint("release_id", "dataset_id", name="uq_release_dataset"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    release_id: Mapped[int] = mapped_column(ForeignKey("releases.id", ondelete="CASCADE"), nullable=False)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    pipeline_run_version: Mapped[int] = mapped_column(Integer, nullable=False)
    rows_processed: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    release: Mapped["Release"] = relationship(back_populates="entries")
