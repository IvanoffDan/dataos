"""GCP credential resolution for Dagster Cloud deployments."""
import json
import os
import tempfile


def resolve_gcp_credentials() -> None:
    """Write SA key JSON to a temp file so google-cloud libraries can find it.

    Dagster Cloud passes credentials as a JSON string in
    GOOGLE_APPLICATION_CREDENTIALS_JSON. This function writes it to a temp file
    and sets GOOGLE_APPLICATION_CREDENTIALS for the google-cloud SDK.
    """
    creds_json = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if creds_json and not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
        creds = json.loads(creds_json)
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        json.dump(creds, tmp)
        tmp.flush()
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = tmp.name
