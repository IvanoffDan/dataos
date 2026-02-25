from sqlalchemy import func
from sqlalchemy.orm import Session

from izakaya_api.domains.data_sources.models import DataSource, PipelineRun
from izakaya_api.domains.releases.models import Release, ReleaseEntry


class ReleaseRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, release_id: int) -> Release | None:
        return self.db.get(Release, release_id)

    def list_all(self) -> list[Release]:
        return self.db.query(Release).order_by(Release.version.desc()).all()

    def get_max_version(self) -> int:
        return self.db.query(func.max(Release.version)).scalar() or 0

    def create(self, release: Release) -> Release:
        self.db.add(release)
        self.db.flush()
        return release

    def create_entry(self, entry: ReleaseEntry) -> ReleaseEntry:
        self.db.add(entry)
        self.db.flush()
        return entry

    def get_latest_successful_runs(self) -> list[tuple[int, int]]:
        """Returns list of (data_source_id, max_version) for successful versioned runs."""
        return (
            self.db.query(
                PipelineRun.data_source_id,
                func.max(PipelineRun.version).label("max_version"),
            )
            .filter(PipelineRun.status == "success", PipelineRun.version.isnot(None))
            .group_by(PipelineRun.data_source_id)
            .all()
        )

    def get_run_by_version(self, data_source_id: int, version: int) -> PipelineRun | None:
        return (
            self.db.query(PipelineRun)
            .filter(
                PipelineRun.data_source_id == data_source_id,
                PipelineRun.version == version,
                PipelineRun.status == "success",
            )
            .first()
        )

    def get_data_sources(self, ids: list[int]) -> dict[int, DataSource]:
        if not ids:
            return {}
        return {
            ds.id: ds
            for ds in self.db.query(DataSource).filter(DataSource.id.in_(ids)).all()
        }
