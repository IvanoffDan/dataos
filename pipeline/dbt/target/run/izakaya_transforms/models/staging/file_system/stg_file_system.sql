
  
    

    create or replace table `izakaya-488118`.`sales_us_7845253c`.`stg_file_system`
      
    
    

    
    OPTIONS()
    as (
      WITH latest_sync AS (
    SELECT MAX(_fivetran_synced) AS max_synced
    FROM `izakaya-488118.sales_us_7845253c.data`
),

active_files AS (
    SELECT DISTINCT _file
    FROM `izakaya-488118.sales_us_7845253c.data` t
    CROSS JOIN latest_sync ls
    WHERE t._fivetran_synced >= TIMESTAMP_SUB(ls.max_synced, INTERVAL 1 HOUR)
)

SELECT t.* EXCEPT(_fivetran_synced, _file)
FROM `izakaya-488118.sales_us_7845253c.data` t
INNER JOIN active_files af ON t._file = af._file
    );
  