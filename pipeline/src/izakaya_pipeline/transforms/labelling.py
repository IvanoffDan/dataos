"""Pure labelling transform — no IO, fully testable."""
import pandas as pd


def apply_label_rules(
    df: pd.DataFrame,
    rules_by_col: dict[str, dict[str, str]],
) -> tuple[pd.DataFrame, dict]:
    """Apply case-insensitive label rules and compute coverage.

    Args:
        df: Input dataframe.
        rules_by_col: {column_name: {lower_match: replace_value}}.

    Returns:
        (labelled_df, stats) where stats has keys:
            fully_labelled_count, coverage_pct, row_count.
    """
    # Compute __fully_labelled before applying rules
    fully_labelled = pd.Series(True, index=df.index)
    for col_name, lower_map in rules_by_col.items():
        if col_name in df.columns:
            temp = df[col_name].astype(str).str.lower().str.strip()
            fully_labelled &= temp.isin(lower_map.keys())

    # Apply label rules (case-insensitive replacement)
    for col_name, lower_map in rules_by_col.items():
        if col_name in df.columns:
            temp = df[col_name].astype(str).str.lower().str.strip()
            mapped = temp.map(lower_map)
            mask = mapped.notna()
            df.loc[mask, col_name] = mapped[mask]

    df["__fully_labelled"] = fully_labelled

    fully_labelled_count = int(fully_labelled.sum())
    row_count = len(df)
    coverage_pct = round(fully_labelled_count / row_count * 100, 1) if row_count > 0 else 0.0

    stats = {
        "fully_labelled_count": fully_labelled_count,
        "coverage_pct": coverage_pct,
        "row_count": row_count,
    }

    return df, stats
