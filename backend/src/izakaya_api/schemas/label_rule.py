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
