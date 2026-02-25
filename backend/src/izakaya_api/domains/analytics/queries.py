from sqlalchemy import case, func
from sqlalchemy.orm import Session

from izakaya_api.dataset_types import get_dataset_type
from izakaya_api.domains.connectors.models import Connector
from izakaya_api.domains.data_sources.models import DataSource, PipelineRun
from izakaya_api.domains.labels.models import LabelRule
from izakaya_api.domains.analytics.schemas import (
    ConnectorSummary,
    DashboardResponse,
    DataSourceSummary,
    RecentRunItem,
)
from izakaya_api.infra.bigquery import queries as bq_queries


class DashboardQueryService:
    def __init__(self, db: Session):
        self.db = db

    def get_dashboard(self) -> DashboardResponse:
        # Connector stats
        connectors = self.db.query(Connector).order_by(Connector.created_at.desc()).all()
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

        # Data source stats with latest run
        data_sources = self.db.query(DataSource).order_by(DataSource.created_at.desc()).all()
        ds_ids = [ds.id for ds in data_sources]
        connector_map = {c.id: c for c in connectors}

        latest_runs: dict[int, tuple[str, object]] = {}
        if ds_ids:
            subq = (
                self.db.query(
                    PipelineRun.data_source_id,
                    func.max(PipelineRun.id).label("max_id"),
                )
                .filter(PipelineRun.data_source_id.in_(ds_ids))
                .group_by(PipelineRun.data_source_id)
                .subquery()
            )
            rows = (
                self.db.query(PipelineRun.data_source_id, PipelineRun.status, PipelineRun.completed_at)
                .join(subq, PipelineRun.id == subq.c.max_id)
                .all()
            )
            latest_runs = {r[0]: (r[1], r[2]) for r in rows}

        rule_counts_by_type: dict[str, int] = {}
        if data_sources:
            rows = (
                self.db.query(LabelRule.dataset_type, func.count(LabelRule.id))
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

        # Pipeline run stats
        run_stats = self.db.query(
            func.count(PipelineRun.id),
            func.coalesce(
                func.sum(case((PipelineRun.status == "success", 1), else_=0)), 0
            ),
            func.coalesce(
                func.sum(case((PipelineRun.status == "failed", 1), else_=0)), 0
            ),
            func.coalesce(func.sum(PipelineRun.rows_processed), 0),
        ).one()

        # Label stats
        total_label_rules = self.db.query(func.count(LabelRule.id)).scalar() or 0
        types_with_rules = (
            self.db.query(func.count(func.distinct(LabelRule.dataset_type))).scalar() or 0
        )

        # Recent runs
        recent_run_rows = (
            self.db.query(PipelineRun, DataSource.name)
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


class ExploreQueryService:
    def __init__(self, db: Session):
        self.db = db

    def _get_data_source_and_type(self, data_source_id: int):
        from izakaya_api.core.exceptions import NotFoundError, ValidationError as DomainValidationError
        ds = self.db.get(DataSource, data_source_id)
        if not ds:
            raise NotFoundError("Data source not found")
        dt = get_dataset_type(ds.dataset_type)
        if not dt:
            raise DomainValidationError(f"Unknown dataset type: {ds.dataset_type}")
        return ds, dt

    def _find_metric(self, dt, metric_id: str):
        from izakaya_api.core.exceptions import ValidationError as DomainValidationError
        for m in dt.metrics:
            if m.id == metric_id:
                return m
        raise DomainValidationError(f"Unknown metric: {metric_id}")

    def get_summary(self, data_source_id: int):
        ds, dt = self._get_data_source_and_type(data_source_id)
        result = bq_queries.get_kpi_summary(ds.dataset_type, dt.metrics)
        if result is None:
            return {"total_rows": 0, "min_date": None, "max_date": None, "metrics": {}}
        return result

    def get_metrics(self, data_source_id: int):
        _, dt = self._get_data_source_and_type(data_source_id)
        return [
            {"id": m.id, "name": m.name, "format_type": m.format_type, "default": m.default}
            for m in dt.metrics
        ]

    def get_time_series(self, data_source_id: int, body):
        ds, dt = self._get_data_source_and_type(data_source_id)
        metric = self._find_metric(dt, body.metric_id)
        return bq_queries.get_time_series(
            dataset_type=ds.dataset_type,
            metric_sql=metric.sql_expression,
            granularity=body.granularity,
            group_by=body.group_by,
            date_from=body.date_from,
            date_to=body.date_to,
        )

    def get_breakdown(self, data_source_id: int, body):
        ds, dt = self._get_data_source_and_type(data_source_id)
        metric = self._find_metric(dt, body.metric_id)
        return bq_queries.get_dimension_breakdown(
            dataset_type=ds.dataset_type,
            metric_sql=metric.sql_expression,
            group_by=body.group_by,
            date_from=body.date_from,
            date_to=body.date_to,
            limit=body.limit,
        )

    def get_data(self, data_source_id: int, offset: int, limit: int, sort_column: str | None, sort_dir: str):
        ds, _ = self._get_data_source_and_type(data_source_id)
        return bq_queries.get_table_data(
            dataset_type=ds.dataset_type,
            offset=offset,
            limit=limit,
            sort_column=sort_column,
            sort_dir=sort_dir,
        )

    def get_raw_preview(self, data_source_id: int, offset: int, limit: int):
        from izakaya_api.core.exceptions import NotFoundError
        from izakaya_api.domains.connectors.models import Connector
        source = self.db.get(DataSource, data_source_id)
        if not source:
            raise NotFoundError("Data source not found")
        connector = self.db.get(Connector, source.connector_id)
        if not connector:
            raise NotFoundError("Connector not found")
        return bq_queries.get_source_table_preview(
            schema_name=connector.schema_name,
            table_name=source.bq_table,
            offset=offset,
            limit=limit,
        )

    def get_mapped_preview(self, data_source_id: int, offset: int, limit: int):
        from izakaya_api.core.exceptions import NotFoundError
        source = self.db.get(DataSource, data_source_id)
        if not source:
            raise NotFoundError("Data source not found")
        return bq_queries.get_mapped_table_preview(
            dataset_type=source.dataset_type,
            data_source_id=data_source_id,
            offset=offset,
            limit=limit,
        )
