from izakaya_api.dataset_types.base import ColumnDef, DatasetType, DatasetTypeDef, DataType, MetricDef

paid_media = DatasetTypeDef(
    id=DatasetType.PAID_MEDIA,
    name="Paid Media",
    description=(
        "Paid media activity in market for a specific channel, showing what is "
        "and isn't happening in market. Used as an input to measure how marketing "
        "activity lifts sales. Spend should be tied to the time the ad ran."
    ),
    grain="One row per media buy at reporting grain per week",
    duration="Weekly, minimum 2 years (3-4 years recommended)",
    metrics=[
        MetricDef(
            id="total_spend",
            name="Total Spend",
            sql_expression="SUM(spend)",
            format_type="currency",
            default=True,
        ),
        MetricDef(
            id="total_impressions",
            name="Total Impressions",
            sql_expression="SUM(impressions)",
            format_type="number",
        ),
        MetricDef(
            id="total_reach",
            name="Total Reach",
            sql_expression="SUM(reach)",
            format_type="number",
        ),
        MetricDef(
            id="cpm",
            name="CPM",
            sql_expression="SAFE_DIVIDE(SUM(spend), SUM(impressions)) * 1000",
            format_type="currency",
        ),
        MetricDef(
            id="row_count",
            name="Row Count",
            sql_expression="COUNT(*)",
            format_type="number",
        ),
    ],
    columns=[
        # ── Required ──
        ColumnDef(
            name="date",
            description="The date the media was live (not invoiced)",
            data_type=DataType.DATE,
            required=True,
            format="yyyy-MM-dd",
            notes="Daily or weekly level. Week start date of Sunday or Monday. ISO format.",
        ),
        ColumnDef(
            name="media_channel",
            description="Media channel (e.g. BVOD, Search, Display)",
            data_type=DataType.STRING,
            required=True,
            max_length=50,
        ),
        ColumnDef(
            name="funnel_stage",
            description="Marketing funnel stage: Awareness, Consideration, or Conversion",
            data_type=DataType.STRING,
            required=True,
            max_length=50,
            notes="Certain channels are automatically categorised as awareness or conversion.",
        ),
        ColumnDef(
            name="spend",
            description="Spend for that row, apportioned to reflect the weeks and volume of activity",
            data_type=DataType.FLOAT,
            required=True,
            min_value=0,
            notes=(
                "Should reflect actual cost to customer rather than internal agency cost. "
                "All fees like production and IP must be excluded."
            ),
        ),
        # ── Recommended ──
        ColumnDef(
            name="format",
            description="Format, size, or length of the ad (e.g. 30 second video)",
            data_type=DataType.STRING,
            required=False,
            max_length=50,
        ),
        ColumnDef(
            name="publisher",
            description="Media distributor the activity is running across (e.g. YouTube, X)",
            data_type=DataType.STRING,
            required=False,
            max_length=50,
        ),
        ColumnDef(
            name="creative_campaign",
            description="Specific creative or campaign running for that activity",
            data_type=DataType.STRING,
            required=False,
            max_length=255,
        ),
        ColumnDef(
            name="geography_breakdown",
            description="Region-specific activity breakdown for geo-targeted channels",
            data_type=DataType.STRING,
            required=False,
            max_length=50,
        ),
        ColumnDef(
            name="brand",
            description="Brand the activity is sitting against (top level of GrowthOS structure)",
            data_type=DataType.STRING,
            required=False,
            max_length=50,
        ),
        ColumnDef(
            name="category",
            description="Level underneath Brand (e.g. division, consumer vs business)",
            data_type=DataType.STRING,
            required=False,
            max_length=50,
        ),
        ColumnDef(
            name="product",
            description="Individual metric being measured (e.g. body type for automotive)",
            data_type=DataType.STRING,
            required=False,
            max_length=50,
            notes="Not the SKU.",
        ),
        ColumnDef(
            name="geography",
            description="Maps paid activity with sales activity at the same granularity",
            data_type=DataType.STRING,
            required=False,
            max_length=50,
            notes="Values should be recognisable geographic areas (e.g. NSW, VIC).",
        ),
        ColumnDef(
            name="currency_code",
            description="ISO 4217 currency code applicable to spend and fees",
            data_type=DataType.STRING,
            required=False,
            max_length=3,
            notes="Defaults to AUD unless specified.",
        ),
        ColumnDef(
            name="tarp",
            description="Target audience rating point, mainly used for TV",
            data_type=DataType.FLOAT,
            required=False,
            notes="Can be aggregated.",
        ),
        ColumnDef(
            name="reach",
            description="Number of people or audience reached (clicks, impressions, etc.)",
            data_type=DataType.INTEGER,
            required=False,
            min_value=0,
        ),
        ColumnDef(
            name="agency_fees",
            description="Agency fees broken out from spend to more accurately reflect total spend",
            data_type=DataType.FLOAT,
            required=False,
            min_value=0,
        ),
        ColumnDef(
            name="impressions",
            description="Number of times content is displayed or shown to users online",
            data_type=DataType.INTEGER,
            required=False,
            min_value=0,
        ),
    ],
)
