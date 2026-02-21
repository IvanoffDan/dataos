import os
from datetime import datetime

import httpx
import pandas as pd


def get_column_defs(dataset_type: str) -> list[dict]:
    """Fetch column definitions from the backend API."""
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
    resp = httpx.get(f"{backend_url}/datasets/types/{dataset_type}/columns")
    resp.raise_for_status()
    return resp.json()


def validate_row(
    row: dict,
    row_num: int,
    column_defs: list[dict],
    data_source_id: int,
) -> tuple[dict | None, list[dict]]:
    """Validate a single row. Returns (clean_row_or_None, list_of_errors)."""
    errors = []
    clean = {}

    for col_def in column_defs:
        name = col_def["name"]
        value = row.get(name)
        data_type = col_def["data_type"]
        required = col_def["required"]

        # Handle None / empty
        is_empty = value is None or (isinstance(value, str) and value.strip() == "")
        if pd.isna(value) if not isinstance(value, str) else False:
            is_empty = True

        if is_empty:
            if required:
                errors.append({
                    "data_source_id": data_source_id,
                    "row_number": row_num,
                    "column_name": name,
                    "error_type": "missing_required",
                    "error_message": f"Required column '{name}' is missing or empty",
                    "source_value": str(value) if value is not None else None,
                })
            clean[name] = None
            continue

        # Type coercion and validation
        str_val = str(value).strip()

        if data_type == "string":
            max_length = col_def.get("max_length")
            if max_length and len(str_val) > max_length:
                errors.append({
                    "data_source_id": data_source_id,
                    "row_number": row_num,
                    "column_name": name,
                    "error_type": "too_long",
                    "error_message": (
                        f"Column '{name}': exceeds max length {max_length} "
                        f"(got {len(str_val)} characters)"
                    ),
                    "source_value": str_val[:100],
                })
            clean[name] = str_val

        elif data_type == "integer":
            try:
                int_val = int(float(str_val))
                min_value = col_def.get("min_value")
                if min_value is not None and int_val < min_value:
                    errors.append({
                        "data_source_id": data_source_id,
                        "row_number": row_num,
                        "column_name": name,
                        "error_type": "out_of_range",
                        "error_message": (
                            f"Column '{name}': expected integer >= {int(min_value)}, got '{int_val}'"
                        ),
                        "source_value": str_val,
                    })
                clean[name] = int_val
            except (ValueError, TypeError):
                errors.append({
                    "data_source_id": data_source_id,
                    "row_number": row_num,
                    "column_name": name,
                    "error_type": "invalid_type",
                    "error_message": f"Column '{name}': expected integer, got '{str_val}'",
                    "source_value": str_val[:100],
                })
                clean[name] = None

        elif data_type == "float":
            try:
                float_val = float(str_val)
                min_value = col_def.get("min_value")
                if min_value is not None and float_val < min_value:
                    errors.append({
                        "data_source_id": data_source_id,
                        "row_number": row_num,
                        "column_name": name,
                        "error_type": "out_of_range",
                        "error_message": (
                            f"Column '{name}': expected numeric >= {min_value}, got '{float_val}'"
                        ),
                        "source_value": str_val,
                    })
                clean[name] = float_val
            except (ValueError, TypeError):
                errors.append({
                    "data_source_id": data_source_id,
                    "row_number": row_num,
                    "column_name": name,
                    "error_type": "invalid_type",
                    "error_message": f"Column '{name}': expected numeric, got '{str_val}'",
                    "source_value": str_val[:100],
                })
                clean[name] = None

        elif data_type == "date":
            fmt = col_def.get("format", "yyyy-MM-dd")
            py_fmt = fmt.replace("yyyy", "%Y").replace("MM", "%m").replace("dd", "%d")
            try:
                parsed = datetime.strptime(str_val, py_fmt)
                clean[name] = parsed.strftime("%Y-%m-%d")
            except ValueError:
                # Try ISO format as fallback
                try:
                    parsed = datetime.fromisoformat(str_val[:10])
                    clean[name] = parsed.strftime("%Y-%m-%d")
                except ValueError:
                    errors.append({
                        "data_source_id": data_source_id,
                        "row_number": row_num,
                        "column_name": name,
                        "error_type": "invalid_format",
                        "error_message": (
                            f"Column '{name}': expected format '{fmt}', got '{str_val}'"
                        ),
                        "source_value": str_val[:100],
                    })
                    clean[name] = None
        else:
            clean[name] = str_val

    return clean, errors
