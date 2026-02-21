from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from izakaya_api.deps import get_current_user, get_db
from izakaya_api.models.mapping import Mapping
from izakaya_api.models.user import User
from izakaya_api.schemas.mapping import MappingCreate, MappingResponse

router = APIRouter(prefix="/mappings", tags=["mappings"])


@router.get("/", response_model=list[MappingResponse])
def list_mappings(
    dataset_id: int | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = db.query(Mapping)
    if dataset_id is not None:
        query = query.filter(Mapping.dataset_id == dataset_id)
    return query.order_by(Mapping.created_at.desc()).all()


@router.post("/", response_model=MappingResponse, status_code=201)
def create_mapping(
    body: MappingCreate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    mapping = Mapping(**body.model_dump())
    db.add(mapping)
    db.commit()
    db.refresh(mapping)
    return mapping


@router.delete("/{mapping_id}", status_code=204)
def delete_mapping(
    mapping_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    mapping = db.get(Mapping, mapping_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    db.delete(mapping)
    db.commit()
