{{ config(alias='stg_file_system') }}

{#- File System connector: handles orphaned rows from deleted source files.
    Fivetran keeps old data in BQ even when source files are removed.
    We identify active files by checking which _file values appear in the
    latest sync window, then keep only rows from those files. -#}

{%- set source_table = var('source_table', 'data') -%}

WITH latest_sync AS (
    SELECT MAX(_fivetran_synced) AS max_synced
    FROM `{{ var('bq_project') }}.{{ var('target_schema') }}.{{ source_table }}`
),

active_files AS (
    SELECT DISTINCT _file
    FROM `{{ var('bq_project') }}.{{ var('target_schema') }}.{{ source_table }}` t
    CROSS JOIN latest_sync ls
    WHERE t._fivetran_synced >= TIMESTAMP_SUB(ls.max_synced, INTERVAL 1 HOUR)
)

SELECT t.* EXCEPT(_fivetran_synced, _file)
FROM `{{ var('bq_project') }}.{{ var('target_schema') }}.{{ source_table }}` t
INNER JOIN active_files af ON t._file = af._file
