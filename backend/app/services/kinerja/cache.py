"""Cache for Kinerja performance workflows."""

from collections import OrderedDict
from dataclasses import dataclass, field
from threading import RLock
from typing import Any
from app.models.performance_kinerja import PerformanceKinerjaRecord

CACHE_TTL_SECONDS = 300

MAX_CACHED_FILTERS = 64

MAX_CACHED_DATASETS = 12

@dataclass
class _PerformanceDashboardCache:
    bind: object
    dataset_signature: tuple[Any, ...]
    built_at: float
    dataset: dict[str, Any]
    resolved_records: list[tuple[PerformanceKinerjaRecord, str, str, str, str]]
    unit_options: list[str]
    unit_eselon_iii_options: list[str]
    unit_eselon_iv_options: list[str]
    eselon_options: list[str]
    units: list[dict[str, Any]]
    record_filter_options: dict[str, list[str]] = field(default_factory=dict)
    record_numeric_ranges: dict[str, tuple[float | None, float | None]] = field(
        default_factory=dict
    )
    filtered_overviews: OrderedDict[
        tuple[str | None, str | None, str | None, tuple[str, ...]],
        dict[str, Any],
    ] = field(default_factory=OrderedDict)
    analyses: dict[str, dict[str, Any]] = field(default_factory=dict)

_dashboard_cache: OrderedDict[
    tuple[object, int],
    _PerformanceDashboardCache,
] = OrderedDict()

_dashboard_cache_lock = RLock()

def invalidate_dashboard_cache() -> None:
    with _dashboard_cache_lock:
        _dashboard_cache.clear()
