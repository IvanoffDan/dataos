from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from izakaya_api.db import Base


class LabelRule(Base):
    __tablename__ = "label_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"))
    column_name: Mapped[str] = mapped_column(String(255))
    match_value: Mapped[str] = mapped_column(String(500))
    replace_value: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
