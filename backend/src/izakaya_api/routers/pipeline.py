from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from izakaya_api.deps import get_current_user, get_db
from izakaya_api.models.pipeline_run import PipelineRun
from izakaya_api.models.user import User
from izakaya_api.models.validation_error import ValidationError
from izakaya_api.schemas.pipeline_run import ValidationErrorResponse

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


@router.get("/runs/{run_id}/errors", response_model=list[ValidationErrorResponse])
def get_run_errors(
    run_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    run = db.get(PipelineRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Pipeline run not found")
    return (
        db.query(ValidationError)
        .filter(ValidationError.pipeline_run_id == run_id)
        .order_by(ValidationError.id)
        .offset(offset)
        .limit(limit)
        .all()
    )
