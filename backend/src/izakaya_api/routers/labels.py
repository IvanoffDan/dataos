from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from izakaya_api.deps import get_current_user, get_db
from izakaya_api.models.label_rule import LabelRule
from izakaya_api.models.user import User
from izakaya_api.schemas.label_rule import LabelRuleCreate, LabelRuleResponse

router = APIRouter(prefix="/labels", tags=["labels"])


@router.get("/", response_model=list[LabelRuleResponse])
def list_label_rules(
    dataset_id: int | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = db.query(LabelRule)
    if dataset_id is not None:
        query = query.filter(LabelRule.dataset_id == dataset_id)
    return query.order_by(LabelRule.created_at.desc()).all()


@router.post("/", response_model=LabelRuleResponse, status_code=201)
def create_label_rule(
    body: LabelRuleCreate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    rule = LabelRule(**body.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{rule_id}", status_code=204)
def delete_label_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    rule = db.get(LabelRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Label rule not found")
    db.delete(rule)
    db.commit()
