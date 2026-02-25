from sqlalchemy.orm import Session

from izakaya_api.domains.data_sources.models import (
    DataSource,
    Mapping,
    PipelineRun,
    ValidationError,
)


class DataSourceRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, data_source_id: int) -> DataSource | None:
        return self.db.get(DataSource, data_source_id)

    def list_all(self) -> list[DataSource]:
        return self.db.query(DataSource).order_by(DataSource.created_at.desc()).all()

    def list_by_type_and_status(self, dataset_type: str, status: str) -> list[DataSource]:
        return (
            self.db.query(DataSource)
            .filter(DataSource.dataset_type == dataset_type, DataSource.status == status)
            .all()
        )

    def create(self, ds: DataSource) -> DataSource:
        self.db.add(ds)
        self.db.flush()
        return ds

    def delete(self, ds: DataSource) -> None:
        self.db.delete(ds)
        self.db.flush()


class MappingRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_by_data_source(self, data_source_id: int) -> list[Mapping]:
        return (
            self.db.query(Mapping)
            .filter(Mapping.data_source_id == data_source_id)
            .order_by(Mapping.created_at)
            .all()
        )

    def get_by_target(self, data_source_id: int, target_column: str) -> Mapping | None:
        return (
            self.db.query(Mapping)
            .filter(Mapping.data_source_id == data_source_id, Mapping.target_column == target_column)
            .first()
        )

    def has_mappings(self, data_source_id: int) -> bool:
        return (
            self.db.query(Mapping)
            .filter(Mapping.data_source_id == data_source_id)
            .first()
        ) is not None

    def delete_by_data_source(self, data_source_id: int) -> None:
        self.db.query(Mapping).filter(Mapping.data_source_id == data_source_id).delete()

    def create(self, mapping: Mapping) -> Mapping:
        self.db.add(mapping)
        self.db.flush()
        return mapping


class PipelineRunRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, run_id: int) -> PipelineRun | None:
        return self.db.get(PipelineRun, run_id)

    def list_by_data_source(self, data_source_id: int) -> list[PipelineRun]:
        return (
            self.db.query(PipelineRun)
            .filter(PipelineRun.data_source_id == data_source_id)
            .order_by(PipelineRun.created_at.desc())
            .all()
        )

    def has_pending(self, data_source_id: int) -> bool:
        return (
            self.db.query(PipelineRun)
            .filter(PipelineRun.data_source_id == data_source_id, PipelineRun.status == "pending")
            .first()
        ) is not None

    def create(self, run: PipelineRun) -> PipelineRun:
        self.db.add(run)
        self.db.flush()
        return run

    def get_validation_errors(self, run_id: int, offset: int = 0, limit: int = 100) -> list[ValidationError]:
        return (
            self.db.query(ValidationError)
            .filter(ValidationError.pipeline_run_id == run_id)
            .order_by(ValidationError.id)
            .offset(offset)
            .limit(limit)
            .all()
        )
