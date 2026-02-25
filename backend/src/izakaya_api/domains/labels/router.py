from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from izakaya_api.core.dependencies import get_current_user, get_db
from izakaya_api.domains.auth.models import User
from izakaya_api.domains.labels.repository import LabelRuleRepository
from izakaya_api.domains.labels.schemas import (
    AutoLabelAllResponse,
    AutoLabelResponse,
    ColumnStatsResponse,
    ColumnValuesResponse,
    DatasetLabelSummary,
    LabelRuleBulkSave,
    LabelRuleCreate,
    LabelRuleResponse,
)
from izakaya_api.domains.labels.service import LabelService

router = APIRouter(prefix="/labels", tags=["labels"])


def _get_service(db: Session = Depends(get_db)) -> LabelService:
    return LabelService(LabelRuleRepository(db), db)


@router.get("", response_model=list[LabelRuleResponse])
def list_label_rules(
    dataset_type: str | None = None,
    _user: User = Depends(get_current_user),
    svc: LabelService = Depends(_get_service),
):
    return svc.list_rules(dataset_type)


@router.post("", response_model=LabelRuleResponse, status_code=201)
def create_label_rule(
    body: LabelRuleCreate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: LabelService = Depends(_get_service),
):
    rule = svc.create_rule(body.model_dump())
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{rule_id}", status_code=204)
def delete_label_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: LabelService = Depends(_get_service),
):
    svc.delete_rule(rule_id)
    db.commit()


@router.get("/summary", response_model=list[DatasetLabelSummary])
def label_summary(
    _user: User = Depends(get_current_user),
    svc: LabelService = Depends(_get_service),
):
    return svc.get_summary()


@router.get("/types/{dataset_type}/columns", response_model=ColumnStatsResponse)
def dataset_column_stats(
    dataset_type: str,
    _user: User = Depends(get_current_user),
    svc: LabelService = Depends(_get_service),
):
    return svc.get_column_stats(dataset_type)


@router.get("/types/{dataset_type}/columns/{column_name}/values", response_model=ColumnValuesResponse)
def column_values(
    dataset_type: str,
    column_name: str,
    search: str | None = None,
    limit: int = 1000,
    _user: User = Depends(get_current_user),
    svc: LabelService = Depends(_get_service),
):
    return svc.get_column_values(dataset_type, column_name, search, limit)


@router.put("/types/{dataset_type}/columns/{column_name}/rules")
def bulk_save_rules(
    dataset_type: str,
    column_name: str,
    body: LabelRuleBulkSave,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: LabelService = Depends(_get_service),
):
    count = svc.bulk_save_rules(dataset_type, column_name, [r.model_dump() for r in body.rules])
    db.commit()
    return {"saved": count}


@router.post(
    "/types/{dataset_type}/columns/{column_name}/auto-label",
    response_model=AutoLabelResponse,
)
def auto_label(
    dataset_type: str,
    column_name: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: LabelService = Depends(_get_service),
):
    result = svc.auto_label_column(dataset_type, column_name)
    db.commit()
    return result


@router.delete("/types/{dataset_type}/columns/{column_name}/auto-label")
def undo_auto_label(
    dataset_type: str,
    column_name: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: LabelService = Depends(_get_service),
):
    count = svc.undo_auto_label_column(dataset_type, column_name)
    db.commit()
    return {"deleted": count}


@router.post("/types/{dataset_type}/auto-label", response_model=AutoLabelAllResponse)
def auto_label_all(
    dataset_type: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: LabelService = Depends(_get_service),
):
    result = svc.auto_label_all(dataset_type)
    db.commit()
    return result


@router.delete("/types/{dataset_type}/auto-label")
def undo_auto_label_all(
    dataset_type: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    svc: LabelService = Depends(_get_service),
):
    count = svc.undo_auto_label_all(dataset_type)
    db.commit()
    return {"deleted": count}
