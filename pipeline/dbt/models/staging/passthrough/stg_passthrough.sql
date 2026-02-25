{{ config(alias='stg_passthrough') }}

{#- Passthrough: no connector-specific logic.
    Creates a staging table for consistency so all connectors
    follow the same {schema}.stg_{service} pattern. -#}

{%- set source_table = var('source_table', 'data') -%}

SELECT *
FROM `{{ var('bq_project') }}.{{ var('target_schema') }}.{{ source_table }}`
