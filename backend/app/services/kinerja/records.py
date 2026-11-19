"""Records for Kinerja performance workflows."""

from collections import defaultdict
from dataclasses import field
from datetime import datetime, timezone
from typing import Any
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.models.performance_kinerja import (
    PerformanceKinerjaRecord,
    PerformanceKinerjaDataset,
    PerformanceKinerjaInsight,
)
from .cache import _PerformanceDashboardCache, _dashboard_cache_lock
from .common import (
    RECORD_EXPORT_COLUMNS,
    RECORD_FILTER_OPTION_FIELDS,
    _NUMERIC_FIELDS,
    _performance_datasets,
    _select_dataset,
)
from .dashboard import _get_dashboard_cache, _make_group
from .record_data import _performance_record_data

def get_insight(db: Session) -> dict[str, Any]:
    insight = db.get(PerformanceKinerjaInsight, 1)
    if insight is None:
        return {"content": "", "updated_at": None, "updated_by_name": None}
    updated_at = insight.updated_at
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    else:
        updated_at = updated_at.astimezone(timezone.utc)
    return {
        "content": insight.content,
        "updated_at": updated_at,
        "updated_by_name": insight.updated_by_name,
    }

def update_insight(
    db: Session,
    content: str,
    *,
    updated_by_user: str,
    updated_by_name: str,
) -> dict[str, Any]:
    try:
        insight = db.get(PerformanceKinerjaInsight, 1)
        if insight is None:
            insight = PerformanceKinerjaInsight(
                id=1,
                content=content,
                updated_at=datetime.now(timezone.utc),
                updated_by_user=updated_by_user,
                updated_by_name=updated_by_name,
            )
            db.add(insight)
        else:
            insight.content = content
            insight.updated_at = datetime.now(timezone.utc)
            insight.updated_by_user = updated_by_user
            insight.updated_by_name = updated_by_name
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise
    return get_insight(db)

def get_analysis(
    db: Session,
    group_by: str,
    period: str | None = None,
) -> dict[str, Any]:
    allowed_groupings = {"overall", "unit_eselon_ii", "eselon_level", "unit_and_eselon"}
    if group_by not in allowed_groupings:
        raise ValueError("Unsupported grouping.")
    dataset = _select_dataset(_performance_datasets(db), period)
    if dataset is None:
        return {"dataset": None, "group_by": group_by, "total_employees": 0, "groups": []}

    cache = _get_dashboard_cache(db, dataset)
    with _dashboard_cache_lock:
        analysis = cache.analyses.get(group_by)
        if analysis is None:
            grouped: dict[str, list[PerformanceKinerjaRecord]] = defaultdict(list)
            for record, unit, eselon, _, _ in cache.resolved_records:
                if group_by == "overall":
                    label = "Semua Pegawai"
                elif group_by == "unit_eselon_ii":
                    label = unit
                elif group_by == "eselon_level":
                    label = eselon
                else:
                    label = f"{unit} · {eselon}"
                grouped[label].append(record)

            analysis = {
                "dataset": cache.dataset,
                "group_by": group_by,
                "total_employees": len(cache.resolved_records),
                "groups": [
                    _make_group(label, grouped[label])
                    for label in sorted(grouped, key=str.casefold)
                ],
            }
            cache.analyses[group_by] = analysis
        return analysis

def get_records(
    db: Session,
    page: int,
    page_size: int,
    search: str,
    filters: dict[str, str] | None = None,
    sort_by: str = "nama",
    sort_order: str = "asc",
    period: str | None = None,
) -> dict[str, Any]:
    dataset = _select_dataset(_performance_datasets(db), period)
    if dataset is None:
        _validate_record_query(filters, sort_by, sort_order)
        return {
            "period": None,
            "page": page,
            "page_size": page_size,
            "total": 0,
            "records": [],
            "filter_options": {},
            "numeric_ranges": {},
        }

    cache = _get_dashboard_cache(db, dataset)
    normalized_filters, _ = _validate_record_query(filters, sort_by, sort_order)
    result_records = _query_performance_records(
        db,
        dataset,
        search=search,
        filters=normalized_filters,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return {
        "period": dataset.period,
        "page": page,
        "page_size": page_size,
        "total": len(result_records),
        "records": result_records[(page - 1) * page_size : page * page_size],
        "filter_options": _filtered_record_filter_options(
            cache,
            normalized_filters,
            search,
        ),
        "numeric_ranges": cache.record_numeric_ranges,
    }

def _filtered_record_filter_options(
    cache: _PerformanceDashboardCache,
    filters: dict[str, str],
    search: str,
) -> dict[str, list[str]]:
    normalized_search = search.strip().casefold()
    if not filters and not normalized_search:
        return cache.record_filter_options

    option_values = {field: set() for field in RECORD_FILTER_OPTION_FIELDS}
    for record, unit, eselon, unit_eselon_iii, unit_eselon_iv in cache.resolved_records:
        values = _performance_record_data(
            record,
            {
                "unit_eselon_ii": unit,
                "unit_eselon_iii": unit_eselon_iii,
                "unit_eselon_iv": unit_eselon_iv,
                "eselon": eselon,
            },
        )
        if not _matches_record_search(values, normalized_search):
            continue
        for field in RECORD_FILTER_OPTION_FIELDS:
            if not _matches_record_filters(values, filters, excluded_field=field):
                continue
            value = values[field]
            if value is not None and str(value).strip():
                option_values[field].add(str(value))

    return {
        field: sorted(values, key=str.casefold)
        for field, values in option_values.items()
    }

def _query_performance_records(
    db: Session,
    dataset: PerformanceKinerjaDataset,
    *,
    search: str,
    filters: dict[str, str] | None,
    sort_by: str,
    sort_order: str,
) -> list[dict[str, Any]]:
    normalized_filters, normalized_sort_order = _validate_record_query(
        filters,
        sort_by,
        sort_order,
    )
    cache = _get_dashboard_cache(db, dataset)
    normalized_search = search.strip().casefold()
    result_records = []
    for record, unit, eselon, unit_eselon_iii, unit_eselon_iv in cache.resolved_records:
        values = _performance_record_data(
            record,
            {
                "unit_eselon_ii": unit,
                "unit_eselon_iii": unit_eselon_iii,
                "unit_eselon_iv": unit_eselon_iv,
                "eselon": eselon,
            },
        )
        if not _matches_record_search(values, normalized_search):
            continue
        if not _matches_record_filters(values, normalized_filters):
            continue
        result_records.append(values)

    present_records = [record for record in result_records if record[sort_by] is not None]
    missing_records = [record for record in result_records if record[sort_by] is None]
    present_records.sort(
        key=lambda record: (
            record[sort_by].casefold()
            if isinstance(record[sort_by], str)
            else record[sort_by]
        ),
        reverse=normalized_sort_order == "desc",
    )
    return present_records + missing_records

def _matches_record_search(
    values: dict[str, Any],
    normalized_search: str,
) -> bool:
    return not normalized_search or (
        normalized_search in values["nama"].casefold()
        or normalized_search in values["nip"].casefold()
    )

def _matches_record_filters(
    values: dict[str, Any],
    filters: dict[str, str],
    *,
    excluded_field: str | None = None,
) -> bool:
    for key, expected in filters.items():
        if key == excluded_field:
            continue
        if key.endswith("__min") or key.endswith("__max"):
            field, bound = key.rsplit("__", maxsplit=1)
            value = values[field]
            if value is None:
                return False
            numeric_value = float(value)
            numeric_bound = float(expected)
            if (bound == "min" and numeric_value < numeric_bound) or (
                bound == "max" and numeric_value > numeric_bound
            ):
                return False
        elif values[key] is None:
            return False
        elif key in RECORD_FILTER_OPTION_FIELDS:
            if str(values[key]).casefold() != expected:
                return False
        elif expected not in str(values[key]).casefold():
            return False
    return True

def _validate_record_query(
    filters: dict[str, str] | None,
    sort_by: str,
    sort_order: str,
) -> tuple[dict[str, str], str]:
    allowed_fields = {key for key, _ in RECORD_EXPORT_COLUMNS}
    if sort_by not in allowed_fields:
        raise ValueError("Unsupported sort column.")
    normalized_sort_order = sort_order.lower()
    if normalized_sort_order not in {"asc", "desc"}:
        raise ValueError("Sort order must be 'asc' or 'desc'.")

    normalized_filters = {
        key: value.strip().casefold()
        for key, value in (filters or {}).items()
        if value.strip()
    }
    allowed_filter_fields = allowed_fields | {
        f"{field}__{bound}"
        for field in (*_NUMERIC_FIELDS.values(), "nkp_perhitungan")
        for bound in ("min", "max")
    }
    if unknown_fields := normalized_filters.keys() - allowed_filter_fields:
        raise ValueError(f"Unsupported filter column: {sorted(unknown_fields)[0]}.")
    for key, value in normalized_filters.items():
        if key.endswith("__min") or key.endswith("__max"):
            try:
                float(value)
            except ValueError as exc:
                raise ValueError("Numeric range filters must contain valid numbers.") from exc
    return normalized_filters, normalized_sort_order
