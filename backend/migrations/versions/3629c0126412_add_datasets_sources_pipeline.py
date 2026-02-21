"""add datasets sources pipeline

Revision ID: 3629c0126412
Revises: 9e200617814a
Create Date: 2026-02-21 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3629c0126412'
down_revision: Union[str, None] = '9e200617814a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add schema_name to connectors
    op.add_column(
        'connectors',
        sa.Column('schema_name', sa.String(length=255), nullable=False, server_default=''),
    )

    # Add type to datasets
    op.add_column(
        'datasets',
        sa.Column('type', sa.String(length=50), nullable=False, server_default=''),
    )

    # Create data_sources table
    op.create_table(
        'data_sources',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('dataset_id', sa.Integer(), nullable=False),
        sa.Column('connector_id', sa.Integer(), nullable=False),
        sa.Column('bq_table', sa.String(length=500), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='pending_mapping'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['dataset_id'], ['datasets.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['connector_id'], ['connectors.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    # Create pipeline_runs table
    op.create_table(
        'pipeline_runs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('dataset_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='pending'),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error_summary', sa.Text(), nullable=True),
        sa.Column('rows_processed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('rows_failed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['dataset_id'], ['datasets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    # Recreate mappings table with new schema (data_source_id instead of dataset_id/source_table)
    op.drop_table('mappings')
    op.create_table(
        'mappings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('data_source_id', sa.Integer(), nullable=False),
        sa.Column('source_column', sa.String(length=255), nullable=False),
        sa.Column('target_column', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['data_source_id'], ['data_sources.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    # Create validation_errors table
    op.create_table(
        'validation_errors',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('pipeline_run_id', sa.Integer(), nullable=False),
        sa.Column('data_source_id', sa.Integer(), nullable=False),
        sa.Column('row_number', sa.Integer(), nullable=False),
        sa.Column('column_name', sa.String(length=255), nullable=False),
        sa.Column('error_type', sa.String(length=50), nullable=False),
        sa.Column('error_message', sa.String(length=1000), nullable=False),
        sa.Column('source_value', sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(['pipeline_run_id'], ['pipeline_runs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['data_source_id'], ['data_sources.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('validation_errors')
    op.drop_table('pipeline_runs')
    op.drop_table('data_sources')

    # Recreate original mappings table
    op.drop_table('mappings')
    op.create_table(
        'mappings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('dataset_id', sa.Integer(), nullable=False),
        sa.Column('source_table', sa.String(length=500), nullable=False),
        sa.Column('source_column', sa.String(length=255), nullable=False),
        sa.Column('target_column', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['dataset_id'], ['datasets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.drop_column('datasets', 'type')
    op.drop_column('connectors', 'schema_name')
