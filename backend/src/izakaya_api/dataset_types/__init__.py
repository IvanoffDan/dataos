from izakaya_api.dataset_types.base import DatasetType, DatasetTypeDef
from izakaya_api.dataset_types.paid_media import paid_media
from izakaya_api.dataset_types.sales import sales

_REGISTRY: dict[DatasetType, DatasetTypeDef] = {
    sales.id: sales,
    paid_media.id: paid_media,
}


def get_dataset_type(type_id: DatasetType | str) -> DatasetTypeDef | None:
    if isinstance(type_id, str):
        try:
            type_id = DatasetType(type_id)
        except ValueError:
            return None
    return _REGISTRY.get(type_id)


def list_dataset_types() -> list[DatasetTypeDef]:
    return list(_REGISTRY.values())
