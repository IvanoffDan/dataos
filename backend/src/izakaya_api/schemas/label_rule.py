from datetime import datetime

from pydantic import BaseModel


class LabelRuleCreate(BaseModel):
    dataset_id: int
    column_name: str
    match_value: str
    replace_value: str


class LabelRuleResponse(BaseModel):
    id: int
    dataset_id: int
    column_name: str
    match_value: str
    replace_value: str
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Bulk save ---


class LabelRuleItem(BaseModel):
    match_value: str
    replace_value: str


class LabelRuleBulkSave(BaseModel):
    rules: list[LabelRuleItem]


# --- Dashboard summary ---


class DatasetLabelSummary(BaseModel):
    dataset_id: int
    dataset_name: str
    dataset_type: str
    total_rules: int
    columns_with_rules: int
    total_string_columns: int


# --- Column stats ---


class ColumnStats(BaseModel):
    column_name: str
    description: str
    distinct_count: int | None = None
    rule_count: int
    non_null_count: int | None = None
    total_rows: int | None = None


class ColumnStatsResponse(BaseModel):
    dataset_id: int
    dataset_name: str
    dataset_type: str
    total_rows: int | None = None
    columns: list[ColumnStats]


# --- Column values ---


class DistinctValue(BaseModel):
    value: str
    row_count: int
    percentage: float
    replacement: str | None = None


class ColumnValuesResponse(BaseModel):
    dataset_id: int
    column_name: str
    column_description: str
    total_rows: int | None = None
    distinct_count: int
    rule_count: int
    covered_row_count: int
    values: list[DistinctValue]
    stale_rules: list[LabelRuleResponse]
