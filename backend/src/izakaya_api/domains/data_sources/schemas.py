from datetime import datetime

from pydantic import BaseModel


class DataSourceCreate(BaseModel):
    name: str
    description: str = ""
    dataset_type: str
    connector_id: int
    bq_table: str | None = None


class DataSourceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class DataSourceResponse(BaseModel):
    id: int
    name: str
    description: str
    dataset_type: str
    connector_id: int
    bq_table: str
    raw_table: str | None = None
    status: str
    mappings_accepted: bool = False
    created_at: datetime
    updated_at: datetime
    connector_name: str = ""
    connector_category: str = "passthrough"

    model_config = {"from_attributes": True}


class MappingItem(BaseModel):
    source_column: str = ""
    target_column: str
    static_value: str | None = None
    confidence: float | None = None
    reasoning: str | None = None
    ai_suggested: bool | None = None


class MappingBulkSave(BaseModel):
    mappings: list[MappingItem]


class MappingResponse(BaseModel):
    id: int
    data_source_id: int
    source_column: str | None
    target_column: str
    static_value: str | None
    confidence: float | None = None
    reasoning: str | None = None
    ai_suggested: bool | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AutoMapSuggestion(BaseModel):
    target_column: str
    source_column: str | None = None
    static_value: str | None = None
    confidence: float
    reasoning: str


class AutoMapResponse(BaseModel):
    suggestions: list[AutoMapSuggestion]
    skipped_count: int


class PipelineRunResponse(BaseModel):
    id: int
    data_source_id: int
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    error_summary: str | None
    rows_processed: int
    rows_failed: int
    version: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ValidationErrorResponse(BaseModel):
    id: int
    pipeline_run_id: int
    data_source_id: int
    row_number: int
    column_name: str
    error_type: str
    error_message: str
    source_value: str | None

    model_config = {"from_attributes": True}


# --- Review Context ---


class MappingPatch(BaseModel):
    source_column: str | None = None
    static_value: str | None = None


class AcceptMappingsRequest(BaseModel):
    reprocess: bool = False


class ReviewMapping(BaseModel):
    target_column: str
    target_type: str
    target_description: str
    target_required: bool
    source_column: str | None = None
    static_value: str | None = None
    confidence: float | None = None
    reasoning: str | None = None
    ai_suggested: bool | None = None
    sample_values: list[str] = []


class ReviewLabelRule(BaseModel):
    id: int
    match_value: str
    replace_value: str
    row_count: int
    percentage: float
    ai_suggested: bool | None = None
    confidence: float | None = None


class ReviewLabelColumn(BaseModel):
    column_name: str
    description: str
    distinct_count: int
    rule_count: int
    ai_rule_count: int
    coverage_pct: float
    row_coverage_pct: float
    rules: list[ReviewLabelRule] = []


class ReviewSummary(BaseModel):
    total_target_columns: int
    mapped_count: int
    unmapped_required_count: int
    high_confidence_count: int
    needs_review_count: int
    total_label_rules: int
    label_columns_count: int
    row_coverage_pct: float


class ReviewContextResponse(BaseModel):
    data_source: DataSourceResponse
    summary: ReviewSummary
    mappings: list[ReviewMapping]
    label_columns: list[ReviewLabelColumn]
