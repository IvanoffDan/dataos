# TODO: These definitions are duplicated from backend/src/izakaya_api/dataset_types/.
#  Extract into a shared package that both backend and pipeline depend on.
from izakaya_pipeline.dataset_types.base import DatasetTypeDef
from izakaya_pipeline.dataset_types.paid_media import paid_media
from izakaya_pipeline.dataset_types.sales import sales

_REGISTRY: dict[str, DatasetTypeDef] = {
    sales.id: sales,
    paid_media.id: paid_media,
}


def get_dataset_type(type_id: str) -> DatasetTypeDef | None:
    return _REGISTRY.get(type_id)
