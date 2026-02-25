"""label_rules queries consolidated."""
from sqlalchemy import text
from sqlalchemy.orm import Session


def get_rules_by_type(db: Session, dataset_type: str) -> dict[str, dict[str, str]]:
    """Returns {column_name: {lower_match: replace_value}}."""
    rows = db.execute(
        text("""
            SELECT column_name, match_value, replace_value
            FROM label_rules WHERE dataset_type = :dtype
        """),
        {"dtype": dataset_type},
    ).fetchall()
    rules_by_col: dict[str, dict[str, str]] = {}
    for col_name, match_val, replace_val in rows:
        rules_by_col.setdefault(col_name, {})[match_val.lower().strip()] = replace_val
    return rules_by_col
