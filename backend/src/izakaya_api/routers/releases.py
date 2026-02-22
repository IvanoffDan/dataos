from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from izakaya_api.dataset_types import get_dataset_type
from izakaya_api.deps import get_current_user, get_db
from izakaya_api.models.dataset import Dataset
from izakaya_api.models.pipeline_run import PipelineRun
from izakaya_api.models.release import Release, ReleaseEntry
from izakaya_api.models.user import User
from izakaya_api.schemas.release import (
    DatasetDiff,
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
    """Create a release: snapshot latest versioned run for each dataset."""
    # Find latest successful versioned run per dataset
    latest_runs = (
        db.query(
            PipelineRun.dataset_id,
            func.max(PipelineRun.version).label("max_version"),
        )
        .filter(PipelineRun.status == "success", PipelineRun.version.isnot(None))
        .group_by(PipelineRun.dataset_id)
        .all()
    )

    if not latest_runs:
        raise HTTPException(status_code=400, detail="No datasets with successful versioned runs")

    # Compute next release version
    max_release_ver = db.query(func.max(Release.version)).scalar() or 0

    release = Release(
        version=max_release_ver + 1,
        name=body.name,
        description=body.description,
        created_by=user.id,
    )
    db.add(release)
    db.flush()

    # Create entries
    for dataset_id, max_version in latest_runs:
        # Get rows_processed from that run
        run = (
            db.query(PipelineRun)
            .filter(
                PipelineRun.dataset_id == dataset_id,
                PipelineRun.version == max_version,
                PipelineRun.status == "success",
            )
            .first()
        )
        entry = ReleaseEntry(
            release_id=release.id,
            dataset_id=dataset_id,
            pipeline_run_version=max_version,
            rows_processed=run.rows_processed if run else 0,
        )
        db.add(entry)

    db.commit()
    db.refresh(release)

    # Build response with dataset info
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
    """List all releases, newest first."""
    releases = db.query(Release).order_by(Release.version.desc()).all()
    items = []
    for r in releases:
        dataset_count = len(r.entries)
        total_rows = sum(e.rows_processed for e in r.entries)
        items.append(
            ReleaseListItem(
                id=r.id,
                version=r.version,
                name=r.name,
                description=r.description,
                created_at=r.created_at,
                dataset_count=dataset_count,
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
    """Compare two releases: per-dataset version/row diff."""
    release1 = db.get(Release, r1)
    release2 = db.get(Release, r2)
    if not release1 or not release2:
        raise HTTPException(status_code=404, detail="Release not found")

    # Build lookup of entries by dataset_id
    r1_map = {e.dataset_id: e for e in release1.entries}
    r2_map = {e.dataset_id: e for e in release2.entries}

    all_dataset_ids = set(r1_map.keys()) | set(r2_map.keys())
    datasets = {d.id: d for d in db.query(Dataset).filter(Dataset.id.in_(all_dataset_ids)).all()}

    diffs = []
    for did in sorted(all_dataset_ids):
        ds = datasets.get(did)
        e1 = r1_map.get(did)
        e2 = r2_map.get(did)
        diffs.append(
            DatasetDiff(
                dataset_id=did,
                dataset_name=ds.name if ds else f"Dataset {did}",
                dataset_type=ds.type if ds else "",
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


@router.get("/{release_id}/datasets/{dataset_id}/summary")
def get_release_dataset_summary(
    release_id: int,
    dataset_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """KPI summary for a dataset at its release version."""
    release = db.get(Release, release_id)
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")

    entry = _find_entry(release, dataset_id)
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    dt = get_dataset_type(dataset.type)
    if not dt:
        raise HTTPException(status_code=400, detail=f"Unknown dataset type: {dataset.type}")

    result = bq_service.get_history_kpi_summary(
        dataset.type, dataset_id, entry.pipeline_run_version, dt.metrics
    )
    if result is None:
        raise HTTPException(status_code=404, detail="No history data found for this version")
    return result


@router.get("/{release_id}/datasets/{dataset_id}/data")
def get_release_dataset_data(
    release_id: int,
    dataset_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    sort_column: str | None = None,
    sort_dir: str = "desc",
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Paginated data from history table for a dataset at its release version."""
    release = db.get(Release, release_id)
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")

    entry = _find_entry(release, dataset_id)
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    return bq_service.get_history_table_data(
        dataset.type,
        dataset_id,
        entry.pipeline_run_version,
        offset=offset,
        limit=limit,
        sort_column=sort_column,
        sort_dir=sort_dir,
    )


# --- helpers ---


def _find_entry(release: Release, dataset_id: int) -> ReleaseEntry:
    for e in release.entries:
        if e.dataset_id == dataset_id:
            return e
    raise HTTPException(status_code=404, detail="Dataset not in this release")


def _build_entry_responses(db: Session, entries: list[ReleaseEntry]) -> list[ReleaseEntryResponse]:
    dataset_ids = [e.dataset_id for e in entries]
    datasets = {d.id: d for d in db.query(Dataset).filter(Dataset.id.in_(dataset_ids)).all()}
    result = []
    for e in entries:
        ds = datasets.get(e.dataset_id)
        result.append(
            ReleaseEntryResponse(
                id=e.id,
                dataset_id=e.dataset_id,
                dataset_name=ds.name if ds else None,
                dataset_type=ds.type if ds else None,
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
        dataset_count=len(r.entries),
        total_rows=sum(e.rows_processed for e in r.entries),
    )
