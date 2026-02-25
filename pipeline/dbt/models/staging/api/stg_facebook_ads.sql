{{ config(alias='stg_facebook_ads') }}

{#- Meta Ads: join ads_insights_platform_and_device with ads_insights_region.
    Regional metrics are fanned out proportionally by spend share per region. -#}

WITH insights AS (
    SELECT
        {{ normalize_date('date_start') }} AS date,
        ad_id,
        ad_name,
        campaign_name,
        adset_name,
        publisher_platform,
        platform_position,
        COALESCE(device_platform, 'Unknown') AS device_platform,
        {{ safe_cast_float('spend') }} AS spend,
        {{ safe_cast_int('impressions') }} AS impressions,
        {{ safe_cast_int('reach') }} AS reach,
        _fivetran_synced
    FROM `{{ var('bq_project') }}.{{ var('target_schema') }}.ads_insights_platform_and_device`
),

regions AS (
    SELECT
        {{ normalize_date('date_start') }} AS date,
        ad_id,
        COALESCE(region, 'Unknown') AS region,
        {{ safe_cast_float('spend') }} AS spend,
        {{ safe_cast_int('impressions') }} AS impressions,
        {{ safe_cast_int('reach') }} AS reach
    FROM `{{ var('bq_project') }}.{{ var('target_schema') }}.ads_insights_region`
),

region_pcts AS (
    SELECT
        date,
        ad_id,
        region,
        SAFE_DIVIDE(spend, SUM(spend) OVER (PARTITION BY date, ad_id)) AS spend_pct
    FROM regions
)

SELECT
    i.date,
    i.ad_id,
    i.ad_name,
    i.campaign_name,
    i.adset_name,
    i.publisher_platform,
    i.platform_position,
    i.device_platform,
    COALESCE(r.region, 'Unknown') AS geography,
    i.spend * COALESCE(r.spend_pct, 1.0) AS spend,
    {{ safe_cast_int('i.impressions * COALESCE(r.spend_pct, 1.0)') }} AS impressions,
    {# Reach is not additive across regions — this is an approximation #}
    {{ safe_cast_int('i.reach * COALESCE(r.spend_pct, 1.0)') }} AS reach,
    i._fivetran_synced
FROM insights i
LEFT JOIN region_pcts r
    ON i.date = r.date AND i.ad_id = r.ad_id
WHERE COALESCE(i.spend, 0) >= 0
