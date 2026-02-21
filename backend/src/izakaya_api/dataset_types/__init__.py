from izakaya_api.dataset_types.base import DatasetTypeDef
from izakaya_api.dataset_types.paid_media import paid_media
from izakaya_api.dataset_types.sales import sales

_REGISTRY: dict[str, DatasetTypeDef] = {
    sales.id: sales,
    paid_media.id: paid_media,
}


def get_dataset_type(type_id: str) -> DatasetTypeDef | None:
    return _REGISTRY.get(type_id)


def list_dataset_types() -> list[DatasetTypeDef]:
    return list(_REGISTRY.values())
