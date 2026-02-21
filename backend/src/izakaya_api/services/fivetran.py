import re
import uuid

import httpx
from fastapi import HTTPException

from izakaya_api.config import settings

BASE_URL = "https://api.fivetran.com/v1"


def _auth() -> httpx.BasicAuth:
    return httpx.BasicAuth(settings.fivetran_api_key, settings.fivetran_api_secret)


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
            raise HTTPException(
                status_code=502,
                detail=f"Fivetran metadata error: {resp.status_code} {resp.text}",
            )
        body = resp.json()["data"]
        for item in body.get("items", []):
            items.append({"id": item["id"], "name": item["name"]})
        cursor = body.get("next_cursor")
        if not cursor:
            break
    items.sort(key=lambda x: x["name"])
    return items


def _slugify(name: str) -> str:
    """Turn a connector name into a valid BQ schema name."""
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return slug or "connector"


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
        raise HTTPException(
            status_code=502,
            detail=f"Fivetran create-connection error: {resp.status_code} {resp.text}",
        )
    data = resp.json()["data"]
    return {
        "fivetran_connector_id": data["id"],
        "connect_card_url": data["connect_card"]["uri"],
        "service": data.get("service", service),
    }


def delete_connection(fivetran_connector_id: str) -> None:
    """Delete a connection from Fivetran."""
    resp = httpx.delete(
        f"{BASE_URL}/connections/{fivetran_connector_id}",
        auth=_auth(),
    )
    if resp.status_code not in (200, 204, 404):
        raise HTTPException(
            status_code=502,
            detail=f"Fivetran delete-connection error: {resp.status_code} {resp.text}",
        )


def trigger_sync(fivetran_connector_id: str) -> None:
    """Trigger an immediate sync for a connection."""
    httpx.post(
        f"{BASE_URL}/connections/{fivetran_connector_id}/sync",
        auth=_auth(),
        json={"force": True},
    )


def get_connection(fivetran_connector_id: str) -> dict:
    """Fetch connector details from Fivetran API."""
    resp = httpx.get(
        f"{BASE_URL}/connections/{fivetran_connector_id}",
        auth=_auth(),
    )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Fivetran get-connection error: {resp.status_code} {resp.text}",
        )
    data = resp.json()["data"]
    status_data = data.get("status", {})
    return {
        "service": data.get("service", ""),
        "setup_state": status_data.get("setup_state", "incomplete"),
        "sync_state": status_data.get("sync_state"),
        "status": (
            "connected"
            if status_data.get("setup_state") == "connected"
            else "setup_incomplete"
        ),
    }
