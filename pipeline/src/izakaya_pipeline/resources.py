import os

from dagster_fivetran import FivetranWorkspace


fivetran_workspace = FivetranWorkspace(
    account_id=os.getenv("FIVETRAN_ACCOUNT_ID", ""),
    api_key=os.getenv("FIVETRAN_API_KEY", ""),
    api_secret=os.getenv("FIVETRAN_API_SECRET", ""),
)
