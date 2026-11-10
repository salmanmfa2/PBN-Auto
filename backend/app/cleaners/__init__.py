"""Cleaner registry.

Each cleaner module should expose a `get_rules()` function that returns a dict with keys:
 - `skiprows`: int
 - `delete_positions`: List[int] (1-based positions)
 - `delete_rows_null_columns`: List[int] (1-based positions)
 - `delete_rows_contains`: List[Dict[str, object]] (column-based contains conditions)
 - `rename_columns`: Dict[int, str]

The service will prefer these programmatic cleaners over the legacy text parser.
"""
from importlib import import_module
from pathlib import Path
from typing import Dict, Optional

PACKAGE = __package__

# Map friendly mode name -> module name (module located under this package)
CLEANER_MODULES = {
    "PBN Open": "pbn",
    "PBN Open + Edu": "pbn_edu",
    "PBN Open + Edu + HB": "pbn_edu_hb",
    "Sitasi Es.IV": "sitasi_esiv",
    "Sitasi Es.III": "sitasi_esiii",
}


def get_rules_for_mode(mode: str) -> Optional[Dict]:
    module_name = CLEANER_MODULES.get(mode)
    if not module_name:
        return None

    try:
        mod = import_module(f"{PACKAGE}.{module_name}")
    except Exception:
        return None

    return getattr(mod, "get_rules", lambda: None)()
