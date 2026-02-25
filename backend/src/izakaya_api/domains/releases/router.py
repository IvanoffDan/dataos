from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from izakaya_api.core.dependencies import get_current_user, get_db
from izakaya_api.domains.auth.models import User
from izakaya_api.domains.releases.repository import ReleaseRepository
from izakaya_api.domains.releases.schemas import (
    ReleaseCompareResponse,
    ReleaseCreate,
    ReleaseListItem,
    ReleaseResponse,
)
from izakaya_api.domains.releases.service import ReleaseService

router = APIRouter(prefix="/releases", tags=["releases"])


def _get_service(db: Session = Depends(get_db)) -> ReleaseService:
    return ReleaseService(ReleaseRepository(db))


@router.post("", response_model=ReleaseResponse)
def create_release(
    body: ReleaseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    svc: ReleaseService = Depends(_get_service),
):
    result = svc.create(body.name, body.description, user.id)
    db.commit()
    return result


@router.get("", response_model=list[ReleaseListItem])
def list_releases(
    _user: User = Depends(get_current_user),
    svc: ReleaseService = Depends(_get_service),
):
    return svc.list_all()


@router.get("/compare")
def compare_releases(
    r1: int = Query(..., description="First release ID"),
    r2: int = Query(..., description="Second release ID"),
    _user: User = Depends(get_current_user),
    svc: ReleaseService = Depends(_get_service),
):
    return svc.compare(r1, r2)


@router.get("/{release_id}", response_model=ReleaseResponse)
def get_release(
    release_id: int,
    _user: User = Depends(get_current_user),
    svc: ReleaseService = Depends(_get_service),
):
    return svc.get(release_id)


@router.get("/{release_id}/data-sources/{data_source_id}/summary")
def get_release_data_source_summary(
    release_id: int,
    data_source_id: int,
    _user: User = Depends(get_current_user),
    svc: ReleaseService = Depends(_get_service),
):
    return svc.get_data_source_summary(release_id, data_source_id)


@router.get("/{release_id}/data-sources/{data_source_id}/data")
def get_release_data_source_data(
    release_id: int,
    data_source_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    sort_column: str | None = None,
    sort_dir: str = "desc",
    _user: User = Depends(get_current_user),
    svc: ReleaseService = Depends(_get_service),
):
    return svc.get_data_source_data(
        release_id, data_source_id, offset, limit, sort_column, sort_dir
    )
