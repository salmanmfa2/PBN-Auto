"""
In-memory storage for datasets.
Maps dataset_id -> dict of sheet name to DataFrame.
"""

import uuid
from typing import Dict, Optional
import pandas as pd


class DatasetStore:
    _store: Dict[str, Dict[str, pd.DataFrame]] = {}

    @classmethod
    def save(cls, sheets: Dict[str, pd.DataFrame]) -> str:
        dataset_id = str(uuid.uuid4())
        cls._store[dataset_id] = {name: df.copy() for name, df in sheets.items()}
        return dataset_id

    @classmethod
    def get(cls, dataset_id: str) -> Optional[Dict[str, pd.DataFrame]]:
        return cls._store.get(dataset_id)

    @classmethod
    def update(cls, dataset_id: str, sheets: Dict[str, pd.DataFrame]) -> None:
        cls._store[dataset_id] = {name: df.copy() for name, df in sheets.items()}

    @classmethod
    def delete(cls, dataset_id: str) -> None:
        cls._store.pop(dataset_id, None)

    @classmethod
    def exists(cls, dataset_id: str) -> bool:
        return dataset_id in cls._store
