from dataclasses import dataclass, field
from enum import Enum


class DataType(str, Enum):
    STRING = "string"
    INTEGER = "integer"
    FLOAT = "float"
    DATE = "date"


class DatasetType(str, Enum):
    PAID_MEDIA = "paid_media"
    SALES = "sales"


@dataclass
class ColumnDef:
    name: str
    description: str
    data_type: DataType
    required: bool = True
    max_length: int | None = None
    min_value: float | None = None
    format: str | None = None
    notes: str = ""


@dataclass
class MetricDef:
    id: str
    name: str
    sql_expression: str
    format_type: str  # "currency", "number", "percent"
    default: bool = False
    description: str = ""


@dataclass
class DatasetTypeDef:
    id: DatasetType
    name: str
    description: str
    columns: list[ColumnDef] = field(default_factory=list)
    metrics: list[MetricDef] = field(default_factory=list)
    grain: str = ""
    duration: str = ""
