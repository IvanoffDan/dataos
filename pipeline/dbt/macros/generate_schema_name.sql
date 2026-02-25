{# Override default schema generation to write into the Fivetran connector's schema.
   When target_schema var is provided, use it as an absolute BQ dataset name.
   This lets dbt output land alongside raw Fivetran tables. #}

{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if var('target_schema', none) is not none -%}
        {{ var('target_schema') }}
    {%- elif custom_schema_name is not none -%}
        {{ custom_schema_name }}
    {%- else -%}
        {{ target.dataset }}
    {%- endif -%}
{%- endmacro %}
