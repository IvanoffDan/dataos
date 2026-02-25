"""Re-export shim for backward compatibility."""
from izakaya_pipeline.assets.datamart import datamart
from izakaya_pipeline.assets.labelled_dataset import labelled_dataset
from izakaya_pipeline.assets.mapped_dataset import mapped_dataset
from izakaya_pipeline.assets.partitions import dataset_partitions

__all__ = ["mapped_dataset", "labelled_dataset", "datamart", "dataset_partitions"]
