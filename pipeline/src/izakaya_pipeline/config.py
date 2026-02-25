"""Centralized pipeline configuration via environment variables."""
import os


class PipelineSettings:
    """Simple settings object that reads from environment variables."""

    @property
    def database_url(self) -> str:
        return os.getenv("DATABASE_URL", "postgresql://izakaya:izakaya@localhost:55432/izakaya")

    @property
    def bq_project_id(self) -> str:
        return os.getenv("BQ_PROJECT_ID", "")

    @property
    def bq_dataset(self) -> str:
        return os.getenv("BQ_DATASET", "izakaya_warehouse")

    @property
    def anthropic_api_key(self) -> str:
        return os.getenv("ANTHROPIC_API_KEY", "")

    @property
    def anthropic_model(self) -> str:
        return os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")

    @property
    def google_credentials_json(self) -> str | None:
        return os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")


settings = PipelineSettings()
