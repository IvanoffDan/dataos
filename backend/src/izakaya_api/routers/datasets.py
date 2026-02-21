from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from izakaya_api.deps import get_current_user, get_db
from izakaya_api.models.dataset import Dataset
from izakaya_api.models.user import User
from izakaya_api.schemas.dataset import DatasetCreate, DatasetResponse, DatasetUpdate

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.get("/", response_model=list[DatasetResponse])
def list_datasets(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return db.query(Dataset).order_by(Dataset.created_at.desc()).all()


@router.post("/", response_model=DatasetResponse, status_code=201)
def create_dataset(
    body: DatasetCreate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    dataset = Dataset(**body.model_dump())
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return dataset


@router.get("/{dataset_id}", response_model=DatasetResponse)
def get_dataset(
    dataset_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.patch("/{dataset_id}", response_model=DatasetResponse)
def update_dataset(
    dataset_id: int,
    body: DatasetUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(dataset, key, value)
    db.commit()
    db.refresh(dataset)
    return dataset


@router.delete("/{dataset_id}", status_code=204)
def delete_dataset(
    dataset_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    db.delete(dataset)
    db.commit()
