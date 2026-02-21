from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://izakaya:izakaya@localhost:55432/izakaya"
    secret_key: str = "change-me-in-production"
    bq_project_id: str = ""
    bq_dataset: str = "izakaya_warehouse"
    fivetran_api_key: str = ""
    fivetran_api_secret: str = ""
    fivetran_group_id: str = ""
    frontend_url: str = "http://localhost:3000"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-5-20250929"

    model_config = {"env_file": "../.env", "extra": "ignore"}


settings = Settings()
