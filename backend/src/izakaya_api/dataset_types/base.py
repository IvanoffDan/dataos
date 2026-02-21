from dataclasses import dataclass, field
from enum import Enum


class DataType(str, Enum):
    STRING = "string"
    INTEGER = "integer"
    FLOAT = "float"
    DATE = "date"


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
class DatasetTypeDef:
    id: str
    name: str
    description: str
    columns: list[ColumnDef] = field(default_factory=list)
    grain: str = ""
    duration: str = ""
