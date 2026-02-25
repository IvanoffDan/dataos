"""Re-export shim for backward compatibility."""
from izakaya_api.infra.bigquery.queries import (
    get_column_stats,
    get_column_value_frequencies,
    get_dimension_breakdown,
    get_history_kpi_summary,
    get_history_table_data,
    get_kpi_summary,
    get_mapped_table_preview,
    get_source_table_preview,
    get_table_data,
    get_time_series,
    get_total_row_count,
)
from izakaya_api.infra.bigquery.table_service import (
    get_sample_values,
    get_table_columns,
    list_tables,
)

__all__ = [
    "get_column_stats",
    "get_column_value_frequencies",
    "get_dimension_breakdown",
    "get_history_kpi_summary",
    "get_history_table_data",
    "get_kpi_summary",
    "get_mapped_table_preview",
    "get_sample_values",
    "get_source_table_preview",
    "get_table_columns",
    "get_table_data",
    "get_time_series",
    "get_total_row_count",
    "list_tables",
]
