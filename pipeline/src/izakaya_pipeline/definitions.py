from dagster import Definitions

from izakaya_pipeline.assets.fivetran import fivetran_specs
from izakaya_pipeline.resources import fivetran_workspace

defs = Definitions(
    assets=fivetran_specs,
    resources={"fivetran": fivetran_workspace},
)
