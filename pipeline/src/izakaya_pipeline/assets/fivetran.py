import logging

from dagster_fivetran import load_fivetran_asset_specs

from izakaya_pipeline.resources import fivetran_workspace

logger = logging.getLogger(__name__)

try:
    fivetran_specs = load_fivetran_asset_specs(workspace=fivetran_workspace)
except Exception:
    logger.warning("Could not load Fivetran specs (credentials may not be configured). Using empty specs.")
    fivetran_specs = []
