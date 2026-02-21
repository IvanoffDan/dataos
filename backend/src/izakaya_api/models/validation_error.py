from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from izakaya_api.db import Base


class ValidationError(Base):
    __tablename__ = "validation_errors"

    id: Mapped[int] = mapped_column(primary_key=True)
    pipeline_run_id: Mapped[int] = mapped_column(
        ForeignKey("pipeline_runs.id", ondelete="CASCADE")
    )
    data_source_id: Mapped[int] = mapped_column(
        ForeignKey("data_sources.id", ondelete="CASCADE")
    )
    row_number: Mapped[int] = mapped_column(Integer)
    column_name: Mapped[str] = mapped_column(String(255))
    error_type: Mapped[str] = mapped_column(String(50))
    error_message: Mapped[str] = mapped_column(String(1000))
    source_value: Mapped[str | None] = mapped_column(String(500), nullable=True)
