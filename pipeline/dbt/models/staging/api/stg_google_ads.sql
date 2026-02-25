{{ config(alias='stg_google_ads') }}

{#- Google Ads: join campaign_stats with geo_performance.
    Geo metrics are fanned out proportionally by cost share per geo target. -#}

WITH campaign_stats AS (
    SELECT
        {{ normalize_date('segments_date') }} AS date,
        campaign_id,
        campaign_name,
        ad_group_id,
        ad_group_name,
        {{ safe_cast_float('metrics_cost_micros') }} / 1000000.0 AS cost,
        {{ safe_cast_int('metrics_impressions') }} AS impressions,
        {{ safe_cast_int('metrics_clicks') }} AS clicks,
        {{ safe_cast_int('metrics_conversions') }} AS conversions,
        _fivetran_synced
    FROM `{{ var('bq_project') }}.{{ var('target_schema') }}.campaign_stats`
),

geo AS (
    SELECT
        {{ normalize_date('segments_date') }} AS date,
        campaign_id,
        COALESCE(geographic_view_country_criterion_id, 'Unknown') AS geo_target,
        {{ safe_cast_float('metrics_cost_micros') }} / 1000000.0 AS cost,
        {{ safe_cast_int('metrics_impressions') }} AS impressions,
        {{ safe_cast_int('metrics_clicks') }} AS clicks
    FROM `{{ var('bq_project') }}.{{ var('target_schema') }}.geo_performance`
),

geo_pcts AS (
    SELECT
        date,
        campaign_id,
        geo_target,
        SAFE_DIVIDE(cost, SUM(cost) OVER (PARTITION BY date, campaign_id)) AS cost_pct
    FROM geo
)

SELECT
    cs.date,
    cs.campaign_id,
    cs.campaign_name,
    cs.ad_group_id,
    cs.ad_group_name,
    COALESCE(g.geo_target, 'Unknown') AS geography,
    cs.cost * COALESCE(g.cost_pct, 1.0) AS cost,
    {{ safe_cast_int('cs.impressions * COALESCE(g.cost_pct, 1.0)') }} AS impressions,
    {{ safe_cast_int('cs.clicks * COALESCE(g.cost_pct, 1.0)') }} AS clicks,
    {{ safe_cast_int('cs.conversions * COALESCE(g.cost_pct, 1.0)') }} AS conversions,
    cs._fivetran_synced
FROM campaign_stats cs
LEFT JOIN geo_pcts g
    ON cs.date = g.date AND cs.campaign_id = g.campaign_id
WHERE COALESCE(cs.cost, 0) >= 0
