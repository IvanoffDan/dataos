"""add transform columns (connector_category, raw_table)

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-25
"""

from alembic import op
import sqlalchemy as sa

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add connector_category to connectors
    op.add_column(
        "connectors",
        sa.Column("connector_category", sa.String(50), server_default="passthrough", nullable=False),
    )

    # 2. Add raw_table to data_sources
    op.add_column(
        "data_sources",
        sa.Column("raw_table", sa.String(500), nullable=True),
    )

    # 3. Backfill connector_category from known service types
    for service, category in [
        ("facebook_ads", "api"),
        ("google_ads", "api"),
        ("postgres", "db"),
        ("mysql", "db"),
        ("sftp", "file_system"),
        ("s3", "file_system"),
        ("gcs", "file_system"),
    ]:
        op.execute(
            f"UPDATE connectors SET connector_category = '{category}' WHERE service = '{service}'"
        )

    # 4. For existing data sources on transform connectors: copy bq_table to raw_table
    op.execute("""
        UPDATE data_sources
        SET raw_table = bq_table
        WHERE connector_id IN (
            SELECT id FROM connectors WHERE connector_category != 'passthrough'
        )
    """)


def downgrade() -> None:
    # Restore bq_table from raw_table where it was overwritten
    op.execute("""
        UPDATE data_sources
        SET bq_table = raw_table
        WHERE raw_table IS NOT NULL
    """)
    op.drop_column("data_sources", "raw_table")
    op.drop_column("connectors", "connector_category")
