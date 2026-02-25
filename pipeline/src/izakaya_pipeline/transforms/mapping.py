"""Pure mapping transform — no IO, fully testable."""
import pandas as pd


def apply_column_mappings(
    df: pd.DataFrame,
    col_mapping: dict[str, str],
    static_mapping: dict[str, str],
    data_source_id: int,
) -> pd.DataFrame:
    """Apply column renames and static values to a dataframe.

    Args:
        df: Source dataframe (already filtered to mapped columns).
        col_mapping: {source_col: target_col} rename mapping.
        static_mapping: {target_col: static_value} columns to add.
        data_source_id: Tracking column value.

    Returns:
        Dataframe with renamed columns, static columns, and __data_source_id.
    """
    if col_mapping:
        df = df.rename(columns=col_mapping)
    for target_col, static_val in static_mapping.items():
        df[target_col] = static_val
    df["__data_source_id"] = data_source_id
    return df
