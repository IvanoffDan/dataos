{# Safe type casts that return NULL on failure instead of raising. #}

{% macro safe_cast_float(column_name) -%}
    SAFE_CAST({{ column_name }} AS FLOAT64)
{%- endmacro %}

{% macro safe_cast_int(column_name) -%}
    SAFE_CAST({{ column_name }} AS INT64)
{%- endmacro %}

{% macro safe_cast_string(column_name, max_length=none) -%}
    {%- if max_length -%}
        LEFT(SAFE_CAST({{ column_name }} AS STRING), {{ max_length }})
    {%- else -%}
        SAFE_CAST({{ column_name }} AS STRING)
    {%- endif -%}
{%- endmacro %}
