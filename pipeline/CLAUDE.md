# Pipeline — Dagster

## Structure

```
src/izakaya_pipeline/    # Dagster definitions, assets, resources
```

## Conventions

- Uses `src/` layout like the backend
- dagster-fivetran integration for orchestrating Fivetran syncs

## Running

```bash
# From repo root:
make pipeline-dev    # dagster dev on :3001
```
