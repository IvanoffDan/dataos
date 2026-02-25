{# Parse a column to DATE, handling common formats. Returns NULL on failure. #}

{% macro normalize_date(column_name) -%}
    SAFE_CAST({{ column_name }} AS DATE)
{%- endmacro %}

{% macro normalize_timestamp_to_date(column_name) -%}
    SAFE_CAST(TIMESTAMP_TRUNC(SAFE_CAST({{ column_name }} AS TIMESTAMP), DAY) AS DATE)
{%- endmacro %}
