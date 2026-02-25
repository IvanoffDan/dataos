"""promote data_source, drop dataset

Revision ID: a1b2c3d4e5f6
Revises: 7683629f6b9c
Create Date: 2026-02-25
"""

from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "7683629f6b9c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add columns to data_sources (nullable initially)
    op.add_column("data_sources", sa.Column("name", sa.String(255), nullable=True))
    op.add_column("data_sources", sa.Column("description", sa.String(1000), server_default="", nullable=False))
    op.add_column("data_sources", sa.Column("dataset_type", sa.String(50), nullable=True))

    # 2. Populate from datasets
    op.execute("""
        UPDATE data_sources
        SET name = d.name || ' — ' || c.name,
            description = d.description,
            dataset_type = d.type
        FROM datasets d, connectors c
        WHERE data_sources.dataset_id = d.id
          AND data_sources.connector_id = c.id
    """)

    # 3. Make name and dataset_type NOT NULL (set defaults for any orphans)
    op.execute("UPDATE data_sources SET name = 'Unknown' WHERE name IS NULL")
    op.execute("UPDATE data_sources SET dataset_type = '' WHERE dataset_type IS NULL")
    op.alter_column("data_sources", "name", nullable=False)
    op.alter_column("data_sources", "dataset_type", nullable=False)

    # 4. Add dataset_type to label_rules
    op.add_column("label_rules", sa.Column("dataset_type", sa.String(50), nullable=True))
    op.execute("""
        UPDATE label_rules
        SET dataset_type = d.type
        FROM datasets d
        WHERE label_rules.dataset_id = d.id
    """)
    op.execute("UPDATE label_rules SET dataset_type = '' WHERE dataset_type IS NULL")
    op.alter_column("label_rules", "dataset_type", nullable=False)

    # 5. Add data_source_id to pipeline_runs
    op.add_column("pipeline_runs", sa.Column("data_source_id", sa.Integer(), nullable=True))
    # Populate: pick the first data source per dataset
    op.execute("""
        UPDATE pipeline_runs
        SET data_source_id = sub.ds_id
        FROM (
            SELECT DISTINCT ON (dataset_id) dataset_id, id AS ds_id
            FROM data_sources
            ORDER BY dataset_id, id
        ) sub
        WHERE pipeline_runs.dataset_id = sub.dataset_id
    """)
    # For any runs with no matching data source, set to 0 (will be cleaned up)
    op.execute("DELETE FROM pipeline_runs WHERE data_source_id IS NULL")
    op.alter_column("pipeline_runs", "data_source_id", nullable=False)
    op.create_foreign_key(
        "fk_pipeline_runs_data_source_id",
        "pipeline_runs", "data_sources",
        ["data_source_id"], ["id"],
        ondelete="CASCADE",
    )

    # 6. Add data_source_id to release_entries
    op.add_column("release_entries", sa.Column("data_source_id", sa.Integer(), nullable=True))
    op.execute("""
        UPDATE release_entries
        SET data_source_id = sub.ds_id
        FROM (
            SELECT DISTINCT ON (dataset_id) dataset_id, id AS ds_id
            FROM data_sources
            ORDER BY dataset_id, id
        ) sub
        WHERE release_entries.dataset_id = sub.dataset_id
    """)
    op.execute("DELETE FROM release_entries WHERE data_source_id IS NULL")
    op.alter_column("release_entries", "data_source_id", nullable=False)
    op.create_foreign_key(
        "fk_release_entries_data_source_id",
        "release_entries", "data_sources",
        ["data_source_id"], ["id"],
        ondelete="CASCADE",
    )

    # 7. Drop old FK columns
    op.drop_constraint("data_sources_dataset_id_fkey", "data_sources", type_="foreignkey")
    op.drop_column("data_sources", "dataset_id")

    op.drop_constraint("label_rules_dataset_id_fkey", "label_rules", type_="foreignkey")
    op.drop_column("label_rules", "dataset_id")

    op.drop_constraint("pipeline_runs_dataset_id_fkey", "pipeline_runs", type_="foreignkey")
    op.drop_column("pipeline_runs", "dataset_id")

    op.drop_constraint("uq_release_dataset", "release_entries", type_="unique")
    op.drop_constraint("release_entries_dataset_id_fkey", "release_entries", type_="foreignkey")
    op.drop_column("release_entries", "dataset_id")

    # 8. Add new unique constraint
    op.create_unique_constraint("uq_release_data_source", "release_entries", ["release_id", "data_source_id"])

    # 9. Drop datasets table
    op.drop_table("datasets")


def downgrade() -> None:
    # Re-create datasets table
    op.create_table(
        "datasets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), unique=True, nullable=False),
        sa.Column("type", sa.String(50), server_default="", nullable=False),
        sa.Column("description", sa.String(1000), server_default="", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Re-add dataset_id columns (cannot fully restore data)
    op.add_column("data_sources", sa.Column("dataset_id", sa.Integer(), nullable=True))
    op.add_column("label_rules", sa.Column("dataset_id", sa.Integer(), nullable=True))
    op.add_column("pipeline_runs", sa.Column("dataset_id", sa.Integer(), nullable=True))

    op.drop_constraint("uq_release_data_source", "release_entries", type_="unique")
    op.add_column("release_entries", sa.Column("dataset_id", sa.Integer(), nullable=True))

    # Drop new columns
    op.drop_constraint("fk_pipeline_runs_data_source_id", "pipeline_runs", type_="foreignkey")
    op.drop_column("pipeline_runs", "data_source_id")
    op.drop_constraint("fk_release_entries_data_source_id", "release_entries", type_="foreignkey")
    op.drop_column("release_entries", "data_source_id")
    op.drop_column("data_sources", "name")
    op.drop_column("data_sources", "description")
    op.drop_column("data_sources", "dataset_type")
    op.drop_column("label_rules", "dataset_type")
