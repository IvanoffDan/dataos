from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, String, func
from sqlalchemy.orm import Mapped, mapped_column

from izakaya_api.core.database import Base


class LabelRule(Base):
    __tablename__ = "label_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_type: Mapped[str] = mapped_column(String(50))
    column_name: Mapped[str] = mapped_column(String(255))
    match_value: Mapped[str] = mapped_column(String(500))
    replace_value: Mapped[str] = mapped_column(String(500))
    ai_suggested: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
