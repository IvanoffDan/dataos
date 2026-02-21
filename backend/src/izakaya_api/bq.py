from google.cloud import bigquery

from izakaya_api.config import settings

_client: bigquery.Client | None = None


def get_bq_client() -> bigquery.Client:
    global _client
    if _client is None:
        _client = bigquery.Client(project=settings.bq_project_id)
    return _client
