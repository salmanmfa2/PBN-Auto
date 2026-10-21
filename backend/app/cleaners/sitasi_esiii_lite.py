from typing import Dict

from app.cleaners.sitasi_esiii import get_rules as get_esiii_rules


def get_rules() -> Dict:
    rules = get_esiii_rules()
    rules["delete_rows_null_columns"] = []
    return rules
