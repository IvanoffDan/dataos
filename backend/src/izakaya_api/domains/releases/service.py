from izakaya_api.core.exceptions import NotFoundError, ValidationError
from izakaya_api.dataset_types import get_dataset_type
from izakaya_api.domains.releases.models import Release, ReleaseEntry
from izakaya_api.domains.releases.repository import ReleaseRepository
from izakaya_api.domains.releases.schemas import (
    DataSourceDiff,
    ReleaseCompareResponse,
    ReleaseEntryResponse,
    ReleaseListItem,
    ReleaseResponse,
)
from izakaya_api.infra.bigquery.queries import get_history_kpi_summary, get_history_table_data


class ReleaseService:
    def __init__(self, repo: ReleaseRepository):
        self.repo = repo

    def _build_entry_responses(self, entries: list[ReleaseEntry]) -> list[ReleaseEntryResponse]:
        ds_ids = [e.data_source_id for e in entries]
        data_sources = self.repo.get_data_sources(ds_ids)
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

    def _to_list_item(self, r: Release) -> ReleaseListItem:
        return ReleaseListItem(
            id=r.id,
            version=r.version,
            name=r.name,
            description=r.description,
            created_at=r.created_at,
            data_source_count=len(r.entries),
            total_rows=sum(e.rows_processed for e in r.entries),
        )

    def _to_response(self, release: Release) -> ReleaseResponse:
        entries = self._build_entry_responses(release.entries)
        return ReleaseResponse(
            id=release.id,
            version=release.version,
            name=release.name,
            description=release.description,
            created_by=release.created_by,
            created_at=release.created_at,
            entries=entries,
        )

    def create(self, name: str, description: str | None, user_id: int) -> ReleaseResponse:
        latest_runs = self.repo.get_latest_successful_runs()
        if not latest_runs:
            raise ValidationError("No data sources with successful versioned runs")

        max_version = self.repo.get_max_version()
        release = Release(
            version=max_version + 1,
            name=name,
            description=description,
            created_by=user_id,
        )
        self.repo.create(release)

        for data_source_id, max_ver in latest_runs:
            run = self.repo.get_run_by_version(data_source_id, max_ver)
            entry = ReleaseEntry(
                release_id=release.id,
                data_source_id=data_source_id,
                pipeline_run_version=max_ver,
                rows_processed=run.rows_processed if run else 0,
            )
            self.repo.create_entry(entry)

        return self._to_response(release)

    def list_all(self) -> list[ReleaseListItem]:
        releases = self.repo.list_all()
        return [self._to_list_item(r) for r in releases]

    def get(self, release_id: int) -> ReleaseResponse:
        release = self.repo.get(release_id)
        if not release:
            raise NotFoundError("Release not found")
        return self._to_response(release)

    def compare(self, r1_id: int, r2_id: int) -> ReleaseCompareResponse:
        release1 = self.repo.get(r1_id)
        release2 = self.repo.get(r2_id)
        if not release1 or not release2:
            raise NotFoundError("Release not found")

        r1_map = {e.data_source_id: e for e in release1.entries}
        r2_map = {e.data_source_id: e for e in release2.entries}

        all_ds_ids = set(r1_map.keys()) | set(r2_map.keys())
        data_sources = self.repo.get_data_sources(list(all_ds_ids))

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
            r1=self._to_list_item(release1),
            r2=self._to_list_item(release2),
            diffs=diffs,
        )

    def _find_entry(self, release: Release, data_source_id: int) -> ReleaseEntry:
        for e in release.entries:
            if e.data_source_id == data_source_id:
                return e
        raise NotFoundError("Data source not in this release")

    def get_data_source_summary(self, release_id: int, data_source_id: int) -> dict:
        release = self.repo.get(release_id)
        if not release:
            raise NotFoundError("Release not found")
        entry = self._find_entry(release, data_source_id)
        ds_map = self.repo.get_data_sources([data_source_id])
        ds = ds_map.get(data_source_id)
        if not ds:
            raise NotFoundError("Data source not found")
        dt = get_dataset_type(ds.dataset_type)
        if not dt:
            raise ValidationError(f"Unknown dataset type: {ds.dataset_type}")
        result = get_history_kpi_summary(
            ds.dataset_type, data_source_id, entry.pipeline_run_version, dt.metrics
        )
        if result is None:
            raise NotFoundError("No history data found for this version")
        return result

    def get_data_source_data(
        self, release_id: int, data_source_id: int,
        offset: int = 0, limit: int = 50, sort_column: str | None = None, sort_dir: str = "desc"
    ) -> dict:
        release = self.repo.get(release_id)
        if not release:
            raise NotFoundError("Release not found")
        entry = self._find_entry(release, data_source_id)
        ds_map = self.repo.get_data_sources([data_source_id])
        ds = ds_map.get(data_source_id)
        if not ds:
            raise NotFoundError("Data source not found")
        return get_history_table_data(
            ds.dataset_type, data_source_id, entry.pipeline_run_version,
            offset=offset, limit=limit, sort_column=sort_column, sort_dir=sort_dir,
        )
