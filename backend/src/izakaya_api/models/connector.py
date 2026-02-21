from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from izakaya_api.db import Base


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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
