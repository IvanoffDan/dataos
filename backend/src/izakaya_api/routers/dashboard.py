from fastapi import APIRouter, Depends
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from izakaya_api.deps import get_current_user, get_db
from izakaya_api.models.connector import Connector
from izakaya_api.models.data_source import DataSource
from izakaya_api.models.label_rule import LabelRule
from izakaya_api.models.pipeline_run import PipelineRun
from izakaya_api.schemas.dashboard import (
    ConnectorSummary,
    DashboardResponse,
    DataSourceSummary,
    RecentRunItem,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardResponse)
def get_dashboard(
    db: Session = Depends(get_db),
    _: None = Depends(get_current_user),
):
    # --- Connector stats ---
    connectors = db.query(Connector).order_by(Connector.created_at.desc()).all()
    connector_count = len(connectors)
    connectors_healthy = 0
    connectors_failing = 0
    connectors_syncing = 0
    latest_sync = None

    for c in connectors:
        if c.sync_state == "syncing":
            connectors_syncing += 1
        elif c.failed_at and (not c.succeeded_at or c.failed_at > c.succeeded_at):
            connectors_failing += 1
        elif c.succeeded_at and not c.paused:
            connectors_healthy += 1

        if c.succeeded_at:
            if latest_sync is None or c.succeeded_at > latest_sync:
                latest_sync = c.succeeded_at

    connector_summaries = [ConnectorSummary.model_validate(c) for c in connectors]

    # --- Data source stats with latest run ---
    data_sources = db.query(DataSource).order_by(DataSource.created_at.desc()).all()
    ds_ids = [ds.id for ds in data_sources]
    connector_map = {c.id: c for c in connectors}

    # Latest run per data source
    latest_runs: dict[int, tuple[str, object]] = {}
    if ds_ids:
        subq = (
            db.query(
                PipelineRun.data_source_id,
                func.max(PipelineRun.id).label("max_id"),
            )
            .filter(PipelineRun.data_source_id.in_(ds_ids))
            .group_by(PipelineRun.data_source_id)
            .subquery()
        )
        rows = (
            db.query(PipelineRun.data_source_id, PipelineRun.status, PipelineRun.completed_at)
            .join(subq, PipelineRun.id == subq.c.max_id)
            .all()
        )
        latest_runs = {r[0]: (r[1], r[2]) for r in rows}

    # Rule counts per dataset_type
    rule_counts_by_type: dict[str, int] = {}
    if data_sources:
        rows = (
            db.query(LabelRule.dataset_type, func.count(LabelRule.id))
            .group_by(LabelRule.dataset_type)
            .all()
        )
        rule_counts_by_type = {r[0]: r[1] for r in rows}

    ds_summaries = []
    for ds in data_sources:
        lr = latest_runs.get(ds.id)
        conn = connector_map.get(ds.connector_id)
        ds_summaries.append(
            DataSourceSummary(
                id=ds.id,
                name=ds.name,
                dataset_type=ds.dataset_type,
                connector_name=conn.name if conn else "",
                latest_run_status=lr[0] if lr else None,
                latest_run_at=lr[1] if lr else None,
                rule_count=rule_counts_by_type.get(ds.dataset_type, 0),
            )
        )

    # --- Pipeline run stats ---
    run_stats = db.query(
        func.count(PipelineRun.id),
        func.coalesce(
            func.sum(case((PipelineRun.status == "success", 1), else_=0)), 0
        ),
        func.coalesce(
            func.sum(case((PipelineRun.status == "failed", 1), else_=0)), 0
        ),
        func.coalesce(func.sum(PipelineRun.rows_processed), 0),
    ).one()

    # --- Label stats ---
    total_label_rules = db.query(func.count(LabelRule.id)).scalar() or 0
    types_with_rules = (
        db.query(func.count(func.distinct(LabelRule.dataset_type))).scalar() or 0
    )

    # --- Recent runs ---
    recent_run_rows = (
        db.query(PipelineRun, DataSource.name)
        .join(DataSource, PipelineRun.data_source_id == DataSource.id)
        .order_by(PipelineRun.created_at.desc())
        .limit(10)
        .all()
    )
    recent_runs = [
        RecentRunItem(
            id=run.id,
            data_source_id=run.data_source_id,
            data_source_name=ds_name,
            status=run.status,
            rows_processed=run.rows_processed,
            completed_at=run.completed_at,
            created_at=run.created_at,
        )
        for run, ds_name in recent_run_rows
    ]

    return DashboardResponse(
        connector_count=connector_count,
        connectors_healthy=connectors_healthy,
        connectors_failing=connectors_failing,
        connectors_syncing=connectors_syncing,
        latest_sync=latest_sync,
        data_source_count=len(data_sources),
        total_runs=run_stats[0],
        runs_succeeded=run_stats[1],
        runs_failed=run_stats[2],
        total_rows_processed=run_stats[3],
        total_label_rules=total_label_rules,
        types_with_rules=types_with_rules,
        connectors=connector_summaries,
        data_sources=ds_summaries,
        recent_runs=recent_runs,
    )
