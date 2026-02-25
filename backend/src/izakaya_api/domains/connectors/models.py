from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from izakaya_api.core.database import Base


class Connector(Base):
    __tablename__ = "connectors"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    fivetran_connector_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    service: Mapped[str] = mapped_column(String(100), default="")
    status: Mapped[str] = mapped_column(String(50), default="setup_incomplete")
    setup_state: Mapped[str] = mapped_column(String(50), default="incomplete")
    sync_state: Mapped[str | None] = mapped_column(String(50), nullable=True)
    schema_name: Mapped[str] = mapped_column(String(255), default="", server_default="")
    connector_category: Mapped[str] = mapped_column(
        String(50), default="passthrough", server_default="passthrough"
    )

    succeeded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sync_frequency: Mapped[int | None] = mapped_column(Integer, nullable=True)
    schedule_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    paused: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    daily_sync_time: Mapped[str | None] = mapped_column(String(10), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
