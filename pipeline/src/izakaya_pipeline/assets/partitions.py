from dagster import DynamicPartitionsDefinition

dataset_partitions = DynamicPartitionsDefinition(name="data_source_id")
