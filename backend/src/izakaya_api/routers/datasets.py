from fastapi import APIRouter, Depends, HTTPException

from izakaya_api.dataset_types import get_dataset_type, list_dataset_types
from izakaya_api.deps import get_current_user
from izakaya_api.models.user import User
from izakaya_api.schemas.dataset import (
    ColumnDefResponse,
    DatasetTypeResponse,
)

router = APIRouter(prefix="/dataset-types", tags=["dataset-types"])


@router.get("", response_model=list[DatasetTypeResponse])
def get_dataset_types(_user: User = Depends(get_current_user)):
    types = list_dataset_types()
    return [
        DatasetTypeResponse(
            id=t.id.value,
            name=t.name,
            description=t.description,
            grain=t.grain,
            duration=t.duration,
            columns=[
                ColumnDefResponse(
                    name=c.name,
                    description=c.description,
                    data_type=c.data_type.value,
                    required=c.required,
                    max_length=c.max_length,
                    min_value=c.min_value,
                    format=c.format,
                    notes=c.notes,
                )
                for c in t.columns
            ],
        )
        for t in types
    ]


@router.get("/{type_id}/columns", response_model=list[ColumnDefResponse])
def get_dataset_type_columns(type_id: str):
    dt = get_dataset_type(type_id)
    if not dt:
        raise HTTPException(status_code=404, detail="Dataset type not found")
    return [
        ColumnDefResponse(
            name=c.name,
            description=c.description,
            data_type=c.data_type.value,
            required=c.required,
            max_length=c.max_length,
            min_value=c.min_value,
            format=c.format,
            notes=c.notes,
        )
        for c in dt.columns
    ]
