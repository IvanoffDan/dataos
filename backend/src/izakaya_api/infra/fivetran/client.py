import re
import uuid

import httpx

from izakaya_api.config import settings
from izakaya_api.core.exceptions import ExternalServiceError

BASE_URL = "https://api.fivetran.com/v1"


def _auth() -> httpx.BasicAuth:
    return httpx.BasicAuth(settings.fivetran_api_key, settings.fivetran_api_secret)


def _slugify(name: str) -> str:
    """Turn a connector name into a valid BQ schema name."""
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return slug or "connector"


def list_connector_types() -> list[dict]:
    """Fetch all available connector types from Fivetran metadata API."""
    items: list[dict] = []
    cursor = None
    while True:
        params: dict[str, str | int] = {"limit": 1000}
        if cursor:
            params["cursor"] = cursor
        resp = httpx.get(f"{BASE_URL}/metadata/connector-types", auth=_auth(), params=params)
        if resp.status_code != 200:
            raise ExternalServiceError(
                f"Fivetran metadata error: {resp.status_code} {resp.text}"
            )
        body = resp.json()["data"]
        for item in body.get("items", []):
            items.append({"id": item["id"], "name": item["name"]})
        cursor = body.get("next_cursor")
        if not cursor:
            break
    items.sort(key=lambda x: x["name"])
    return items


def create_connection(service: str, name: str) -> dict:
    """Create a Fivetran connection and return its ID + Connect Card URI."""
    schema = f"{_slugify(name)}_{uuid.uuid4().hex[:8]}"
    resp = httpx.post(
        f"{BASE_URL}/connections",
        auth=_auth(),
        json={
            "group_id": settings.fivetran_group_id,
            "service": service,
            "run_setup_tests": False,
            "paused": False,
            "config": {
                "schema": schema,
                "table": "data",
            },
            "connect_card_config": {
                "redirect_uri": f"{settings.frontend_url}/connectors",
            },
        },
    )
    if resp.status_code != 201:
        raise ExternalServiceError(
            f"Fivetran create-connection error: {resp.status_code} {resp.text}"
        )
    data = resp.json()["data"]
    return {
        "fivetran_connector_id": data["id"],
        "connect_card_url": data["connect_card"]["uri"],
        "service": data.get("service", service),
        "schema_name": schema,
    }


def delete_connection(fivetran_connector_id: str) -> None:
    """Delete a connection from Fivetran."""
    resp = httpx.delete(
        f"{BASE_URL}/connections/{fivetran_connector_id}",
        auth=_auth(),
    )
    if resp.status_code not in (200, 204, 404):
        raise ExternalServiceError(
            f"Fivetran delete-connection error: {resp.status_code} {resp.text}"
        )


def trigger_sync(fivetran_connector_id: str) -> None:
    """Trigger an immediate sync for a connection."""
    resp = httpx.post(
        f"{BASE_URL}/connections/{fivetran_connector_id}/sync",
        auth=_auth(),
        json={"force": True},
    )
    if resp.status_code not in (200, 201):
        raise ExternalServiceError(
            f"Fivetran trigger-sync error: {resp.status_code} {resp.text}"
        )


def get_connection(fivetran_connector_id: str) -> dict:
    """Fetch connector details from Fivetran API."""
    resp = httpx.get(
        f"{BASE_URL}/connections/{fivetran_connector_id}",
        auth=_auth(),
    )
    if resp.status_code != 200:
        raise ExternalServiceError(
            f"Fivetran get-connection error: {resp.status_code} {resp.text}"
        )
    data = resp.json()["data"]
    status_data = data.get("status", {})
    raw_schema = data.get("schema", "")
    schema_name = raw_schema.split(".")[0] if raw_schema else ""
    return {
        "service": data.get("service", ""),
        "setup_state": status_data.get("setup_state", "incomplete"),
        "sync_state": status_data.get("sync_state"),
        "status": (
            "connected"
            if status_data.get("setup_state") == "connected"
            else "setup_incomplete"
        ),
        "schema_name": schema_name,
        "succeeded_at": status_data.get("succeeded_at"),
        "failed_at": status_data.get("failed_at"),
        "sync_frequency": data.get("sync_frequency"),
        "schedule_type": data.get("schedule_type"),
        "paused": data.get("paused", False),
        "daily_sync_time": data.get("daily_sync_time"),
    }
