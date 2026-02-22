"""add releases and versioning

Revision ID: 7683629f6b9c
Revises: 25c86c44d4f0
Create Date: 2026-02-21 23:36:36.186804

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7683629f6b9c'
down_revision: Union[str, None] = '25c86c44d4f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add version column to pipeline_runs
    op.add_column("pipeline_runs", sa.Column("version", sa.Integer(), nullable=True))

    # Create releases table
    op.create_table(
        "releases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Create release_entries table
    op.create_table(
        "release_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("release_id", sa.Integer(), sa.ForeignKey("releases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("dataset_id", sa.Integer(), sa.ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pipeline_run_version", sa.Integer(), nullable=False),
        sa.Column("rows_processed", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("release_id", "dataset_id", name="uq_release_dataset"),
    )


def downgrade() -> None:
    op.drop_table("release_entries")
    op.drop_table("releases")
    op.drop_column("pipeline_runs", "version")
