{{ config(alias='stg_database') }}

{#- Database connector: filters out soft-deleted rows.
    Fivetran adds _fivetran_deleted for rows deleted in the source DB.
    Since the datamart does WRITE_TRUNCATE, filtering here ensures
    deletions propagate on the next pipeline run. -#}

{%- set source_table = var('source_table', 'data') -%}

SELECT * EXCEPT(_fivetran_deleted, _fivetran_synced)
FROM `{{ var('bq_project') }}.{{ var('target_schema') }}.{{ source_table }}`
WHERE _fivetran_deleted = false
