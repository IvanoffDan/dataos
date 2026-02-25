from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from izakaya_api.dataset_types import get_dataset_type
from izakaya_api.deps import get_current_user, get_db
from izakaya_api.models.data_source import DataSource
from izakaya_api.models.pipeline_run import PipelineRun
from izakaya_api.models.release import Release, ReleaseEntry
from izakaya_api.models.user import User
from izakaya_api.schemas.release import (
    DataSourceDiff,
    ReleaseCompareResponse,
    ReleaseCreate,
    ReleaseEntryResponse,
    ReleaseListItem,
    ReleaseResponse,
)
from izakaya_api.services import bigquery as bq_service

router = APIRouter(prefix="/releases", tags=["releases"])


@router.post("", response_model=ReleaseResponse)
def create_release(
    body: ReleaseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a release: snapshot latest versioned run for each data source."""
    latest_runs = (
        db.query(
            PipelineRun.data_source_id,
            func.max(PipelineRun.version).label("max_version"),
        )
        .filter(PipelineRun.status == "success", PipelineRun.version.isnot(None))
        .group_by(PipelineRun.data_source_id)
        .all()
    )

    if not latest_runs:
        raise HTTPException(status_code=400, detail="No data sources with successful versioned runs")

    max_release_ver = db.query(func.max(Release.version)).scalar() or 0

    release = Release(
        version=max_release_ver + 1,
        name=body.name,
        description=body.description,
        created_by=user.id,
    )
    db.add(release)
    db.flush()

    for data_source_id, max_version in latest_runs:
        run = (
            db.query(PipelineRun)
            .filter(
                PipelineRun.data_source_id == data_source_id,
                PipelineRun.version == max_version,
                PipelineRun.status == "success",
            )
            .first()
        )
        entry = ReleaseEntry(
            release_id=release.id,
            data_source_id=data_source_id,
            pipeline_run_version=max_version,
            rows_processed=run.rows_processed if run else 0,
        )
        db.add(entry)

    db.commit()
    db.refresh(release)

    entries = _build_entry_responses(db, release.entries)
    return ReleaseResponse(
        id=release.id,
        version=release.version,
        name=release.name,
        description=release.description,
        created_by=release.created_by,
        created_at=release.created_at,
        entries=entries,
    )


@router.get("", response_model=list[ReleaseListItem])
def list_releases(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    releases = db.query(Release).order_by(Release.version.desc()).all()
    items = []
    for r in releases:
        data_source_count = len(r.entries)
        total_rows = sum(e.rows_processed for e in r.entries)
        items.append(
            ReleaseListItem(
                id=r.id,
                version=r.version,
                name=r.name,
                description=r.description,
                created_at=r.created_at,
                data_source_count=data_source_count,
                total_rows=total_rows,
            )
        )
    return items


@router.get("/compare")
def compare_releases(
    r1: int = Query(..., description="First release ID"),
    r2: int = Query(..., description="Second release ID"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    release1 = db.get(Release, r1)
    release2 = db.get(Release, r2)
    if not release1 or not release2:
        raise HTTPException(status_code=404, detail="Release not found")

    r1_map = {e.data_source_id: e for e in release1.entries}
    r2_map = {e.data_source_id: e for e in release2.entries}

    all_ds_ids = set(r1_map.keys()) | set(r2_map.keys())
    data_sources = {ds.id: ds for ds in db.query(DataSource).filter(DataSource.id.in_(all_ds_ids)).all()}

    diffs = []
    for dsid in sorted(all_ds_ids):
        ds = data_sources.get(dsid)
        e1 = r1_map.get(dsid)
        e2 = r2_map.get(dsid)
        diffs.append(
            DataSourceDiff(
                data_source_id=dsid,
                data_source_name=ds.name if ds else f"DataSource {dsid}",
                dataset_type=ds.dataset_type if ds else "",
                r1_version=e1.pipeline_run_version if e1 else None,
                r1_rows=e1.rows_processed if e1 else None,
                r2_version=e2.pipeline_run_version if e2 else None,
                r2_rows=e2.rows_processed if e2 else None,
            )
        )

    return ReleaseCompareResponse(
        r1=_release_to_list_item(release1),
        r2=_release_to_list_item(release2),
        diffs=diffs,
    )


@router.get("/{release_id}", response_model=ReleaseResponse)
def get_release(
    release_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    release = db.get(Release, release_id)
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")

    entries = _build_entry_responses(db, release.entries)
    return ReleaseResponse(
        id=release.id,
        version=release.version,
        name=release.name,
        description=release.description,
        created_by=release.created_by,
        created_at=release.created_at,
        entries=entries,
    )


@router.get("/{release_id}/data-sources/{data_source_id}/summary")
def get_release_data_source_summary(
    release_id: int,
    data_source_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    release = db.get(Release, release_id)
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")

    entry = _find_entry(release, data_source_id)
    ds = db.get(DataSource, data_source_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")

    dt = get_dataset_type(ds.dataset_type)
    if not dt:
        raise HTTPException(status_code=400, detail=f"Unknown dataset type: {ds.dataset_type}")

    result = bq_service.get_history_kpi_summary(
        ds.dataset_type, data_source_id, entry.pipeline_run_version, dt.metrics
    )
    if result is None:
        raise HTTPException(status_code=404, detail="No history data found for this version")
    return result


@router.get("/{release_id}/data-sources/{data_source_id}/data")
def get_release_data_source_data(
    release_id: int,
    data_source_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    sort_column: str | None = None,
    sort_dir: str = "desc",
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    release = db.get(Release, release_id)
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")

    entry = _find_entry(release, data_source_id)
    ds = db.get(DataSource, data_source_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")

    return bq_service.get_history_table_data(
        ds.dataset_type,
        data_source_id,
        entry.pipeline_run_version,
        offset=offset,
        limit=limit,
        sort_column=sort_column,
        sort_dir=sort_dir,
    )


# --- helpers ---


def _find_entry(release: Release, data_source_id: int) -> ReleaseEntry:
    for e in release.entries:
        if e.data_source_id == data_source_id:
            return e
    raise HTTPException(status_code=404, detail="Data source not in this release")


def _build_entry_responses(db: Session, entries: list[ReleaseEntry]) -> list[ReleaseEntryResponse]:
    ds_ids = [e.data_source_id for e in entries]
    data_sources = {ds.id: ds for ds in db.query(DataSource).filter(DataSource.id.in_(ds_ids)).all()}
    result = []
    for e in entries:
        ds = data_sources.get(e.data_source_id)
        result.append(
            ReleaseEntryResponse(
                id=e.id,
                data_source_id=e.data_source_id,
                data_source_name=ds.name if ds else None,
                dataset_type=ds.dataset_type if ds else None,
                pipeline_run_version=e.pipeline_run_version,
                rows_processed=e.rows_processed,
            )
        )
    return result


def _release_to_list_item(r: Release) -> ReleaseListItem:
    return ReleaseListItem(
        id=r.id,
        version=r.version,
        name=r.name,
        description=r.description,
        created_at=r.created_at,
        data_source_count=len(r.entries),
        total_rows=sum(e.rows_processed for e in r.entries),
    )
