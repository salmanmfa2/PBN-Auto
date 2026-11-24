"""Dashboard for Kinerja performance workflows."""

from collections import defaultdict
from dataclasses import field
from decimal import ROUND_HALF_UP, Decimal
from time import monotonic
from typing import Any
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.performance_kinerja import (
    PerformanceKinerjaRecord,
    PerformanceKinerjaDataset,
)
from .cache import (
    CACHE_TTL_SECONDS,
    MAX_CACHED_DATASETS,
    MAX_CACHED_FILTERS,
    _PerformanceDashboardCache,
    _dashboard_cache,
    _dashboard_cache_lock,
)
from .common import (
    STATUS_LABELS,
    TWO_PLACES,
    UNIDENTIFIED,
    ZERO,
    _dataset_status,
    _format_decimal,
    _performance_datasets,
    _period_sort_key,
    _previous_period,
    _select_dataset,
    get_status,
)
from .record_data import _record_filter_options, _record_numeric_ranges

def _status(nkp_akhir: Decimal | None) -> str:
    return get_status(nkp_akhir)

def _make_histogram(records: list[PerformanceKinerjaRecord]) -> list[dict[str, Any]]:
    minimum = Decimal("80")
    maximum = Decimal("120")
    width = Decimal("2")
    counts = [0] * 20
    for record in records:
        if record.npk is None or not minimum <= record.npk <= maximum:
            continue
        index = min(int((record.npk - minimum) // width), len(counts) - 1)
        counts[index] += 1
    return [
        {
            "start": int(minimum) + index * int(width),
            "end": int(minimum) + (index + 1) * int(width),
            "label": f"{int(minimum) + index * int(width)}–{int(minimum) + (index + 1) * int(width)}",
            "count": count,
        }
        for index, count in enumerate(counts)
    ]

def _make_correction_stats(records: list[PerformanceKinerjaRecord]) -> dict[str, Any]:
    corrections = [
        record.nilai_koreksi
        for record in records
        if record.nilai_koreksi is not None
    ]
    nonzero_corrections = [correction for correction in corrections if correction != ZERO]
    return {
        "count": len(nonzero_corrections),
        "positive_count": sum(1 for correction in nonzero_corrections if correction > ZERO),
        "negative_count": sum(1 for correction in nonzero_corrections if correction < ZERO),
        "average": _format_decimal(sum(corrections, ZERO) / len(corrections)) if corrections else None,
        "minimum": _format_decimal(min(corrections)) if corrections else None,
        "maximum": _format_decimal(max(corrections)) if corrections else None,
    }

def _make_group(label: str, records: list[PerformanceKinerjaRecord]) -> dict[str, Any]:
    return {
        "label": label,
        "employee_count": len(records),
        "hukdis_count": sum(
            1 for record in records
            if record.nilai_hukuman_disiplin is not None and record.nilai_hukuman_disiplin != ZERO
        ),
        "dampak_pelanggaran_count": sum(
            1 for record in records
            if record.nilai_dampak_pelanggaran_disiplin is not None
            and record.nilai_dampak_pelanggaran_disiplin != ZERO
        ),
        "dampak_perilaku_count": sum(
            1 for record in records
            if record.nilai_dampak_perilaku is not None and record.nilai_dampak_perilaku != ZERO
        ),
        "correction": _make_correction_stats(records),
        "histogram": _make_histogram(records),
        "status_counts": {
            status: sum(1 for record in records if _status(record.nkp_akhir) == status)
            for status in STATUS_LABELS
        },
    }

def _average(values: list[Decimal | None]) -> float | None:
    present = [value for value in values if value is not None]
    return _format_decimal(sum(present, ZERO) / len(present)) if present else None

def _percentage(count: int, total: int) -> float:
    if total == 0:
        return 0.0
    return _format_decimal(Decimal(count) * Decimal("100") / Decimal(total)) or 0.0

def _make_unit_metrics(
    label: str,
    records: list[PerformanceKinerjaRecord],
) -> dict[str, Any]:
    unit_kerja_ids = [
        record.unit_kerja_id
        for record in records
        if record.unit_kerja_id is not None
    ]
    nkp_perhitungan_count = sum(
        1 for record in records
        if record.status_nkp_perhitungan == "Sangat Istimewa"
    )
    nkp_akhir_count = sum(
        1 for record in records if _status(record.nkp_akhir) == "Sangat Istimewa"
    )
    correction = _make_correction_stats(records)
    return {
        "label": label,
        "unit_kerja_id": min(unit_kerja_ids) if unit_kerja_ids else None,
        "nkp_awal_status_counts": {
            status: sum(1 for record in records if _status(record.nkp_awal) == status)
            for status in STATUS_LABELS
        },
        "nkp_perhitungan_status_counts": {
            status: sum(
                1 for record in records
                if record.status_nkp_perhitungan == status
            )
            for status in STATUS_LABELS
        },
        "nkp_akhir_status_counts": {
            status: sum(1 for record in records if _status(record.nkp_akhir) == status)
            for status in STATUS_LABELS
        },
        "employee_count": len(records),
        "average_npk": _average([record.npk for record in records]),
        "average_nhk": _average([record.nhk for record in records]),
        "average_nkp_awal": _average([record.nkp_awal for record in records]),
        "nkp_perhitungan_sangat_istimewa_count": nkp_perhitungan_count,
        "nkp_perhitungan_sangat_istimewa_percentage": _percentage(
            nkp_perhitungan_count,
            len(records),
        ),
        "hukdis_count": sum(
            1 for record in records
            if record.nilai_hukuman_disiplin is not None
            and record.nilai_hukuman_disiplin != ZERO
        ),
        "dampak_pelanggaran_count": sum(
            1 for record in records
            if record.nilai_dampak_pelanggaran_disiplin is not None
            and record.nilai_dampak_pelanggaran_disiplin != ZERO
        ),
        "dampak_perilaku_count": sum(
            1 for record in records
            if record.nilai_dampak_perilaku is not None
            and record.nilai_dampak_perilaku != ZERO
        ),
        "correction": correction,
        "correction_percentage": _percentage(correction["count"], len(records)),
        "average_nkp_akhir": _average([record.nkp_akhir for record in records]),
        "nkp_akhir_sangat_istimewa_count": nkp_akhir_count,
        "nkp_akhir_sangat_istimewa_percentage": _percentage(nkp_akhir_count, len(records)),
        "status_gap_count": nkp_akhir_count - nkp_perhitungan_count,
        "comparison": {},
    }

def _unit_comparison_values(
    current: dict[str, Any],
    previous: dict[str, Any] | None,
) -> dict[str, dict[str, float | None]]:
    numeric_paths = [
        "employee_count",
        "average_npk",
        "average_nhk",
        "average_nkp_awal",
        "nkp_perhitungan_sangat_istimewa_count",
        "nkp_perhitungan_sangat_istimewa_percentage",
        "hukdis_count",
        "dampak_pelanggaran_count",
        "dampak_perilaku_count",
        "correction.count",
        "correction_percentage",
        "correction.positive_count",
        "correction.negative_count",
        "correction.average",
        "correction.maximum",
        "correction.minimum",
        "average_nkp_akhir",
        "nkp_akhir_sangat_istimewa_count",
        "nkp_akhir_sangat_istimewa_percentage",
        "status_gap_count",
    ]
    count_paths = {
        "employee_count",
        "nkp_perhitungan_sangat_istimewa_count",
        "hukdis_count",
        "dampak_pelanggaran_count",
        "dampak_perilaku_count",
        "correction.count",
        "correction.positive_count",
        "correction.negative_count",
        "nkp_akhir_sangat_istimewa_count",
        "status_gap_count",
    }
    numeric_paths.extend(
        f"{field}.{status}"
        for field in ("nkp_perhitungan_status_counts", "nkp_akhir_status_counts")
        for status in STATUS_LABELS
    )
    count_paths.update(
        f"{field}.{status}"
        for field in ("nkp_perhitungan_status_counts", "nkp_akhir_status_counts")
        for status in STATUS_LABELS
    )

    def metric_value(metrics: dict[str, Any] | None, path: str) -> float | None:
        value: Any = metrics
        for part in path.split("."):
            if not isinstance(value, dict):
                return None
            value = value.get(part)
        if value is None:
            return None
        return float(value)

    comparisons: dict[str, dict[str, float | None]] = {}
    for path in numeric_paths:
        current_value = metric_value(current, path)
        previous_value = metric_value(previous, path)
        if previous is None and path in count_paths:
            previous_value = 0.0
        if current_value is None or previous_value is None:
            delta = None
            percentage_change = None
        else:
            current_decimal = Decimal(str(current_value))
            previous_decimal = Decimal(str(previous_value))
            delta_decimal = current_decimal - previous_decimal
            delta = float(delta_decimal.quantize(TWO_PLACES, rounding=ROUND_HALF_UP))
            percentage_change = (
                float(
                    (delta_decimal / abs(previous_decimal) * Decimal("100")).quantize(
                        TWO_PLACES,
                        rounding=ROUND_HALF_UP,
                    )
                )
                if previous_decimal != ZERO
                else None
            )
        comparisons[path] = {
            "current": current_value,
            "previous": previous_value,
            "delta": delta,
            "percentage_change": percentage_change,
        }
    return comparisons

def _units_with_comparisons(
    units: list[dict[str, Any]],
    previous_units: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    previous_by_label = {
        unit["label"]: unit
        for unit in previous_units or []
    }

    def add_comparison(
        unit: dict[str, Any],
        previous: dict[str, Any] | None,
    ) -> dict[str, Any]:
        previous_children = {
            child["label"]: child
            for child in (previous or {}).get("children", [])
        }
        return {
            **unit,
            "comparison": _unit_comparison_values(unit, previous),
            "children": [
                add_comparison(child, previous_children.get(child["label"]))
                for child in unit.get("children", [])
            ],
        }

    return [
        add_comparison(unit, previous_by_label.get(unit["label"]))
        for unit in units
    ]

def _dashboard_dataset_signature(dataset: PerformanceKinerjaDataset) -> tuple[Any, ...]:
    return (
        dataset.id,
        dataset.period,
        dataset.row_count,
        dataset.uploaded_at,
    )

def _unit_order_key(
    label: str,
    records: list[PerformanceKinerjaRecord],
) -> tuple[bool, int, str]:
    unit_kerja_ids = [
        record.unit_kerja_id
        for record in records
        if record.unit_kerja_id is not None
    ]
    return (
        not unit_kerja_ids,
        min(unit_kerja_ids) if unit_kerja_ids else 0,
        label.casefold(),
    )

def _build_dashboard_cache(
    db: Session,
    dataset: PerformanceKinerjaDataset,
) -> _PerformanceDashboardCache:
    records = db.scalars(
        select(PerformanceKinerjaRecord)
        .where(PerformanceKinerjaRecord.dataset_id == dataset.id)
        .order_by(PerformanceKinerjaRecord.nama, PerformanceKinerjaRecord.nip)
    ).all()
    resolved_records: list[tuple[PerformanceKinerjaRecord, str, str, str, str]] = []
    for record in records:
        unit = (record.unit_eselon_ii or "").strip() or UNIDENTIFIED
        eselon = (record.eselon or "").strip() or UNIDENTIFIED
        unit_eselon_iii = (record.unit_eselon_iii or "").strip() or UNIDENTIFIED
        unit_eselon_iv = (record.unit_eselon_iv or "").strip() or UNIDENTIFIED
        resolved_records.append((record, unit, eselon, unit_eselon_iii, unit_eselon_iv))

    grouped_units: dict[str, list[PerformanceKinerjaRecord]] = defaultdict(list)
    grouped_unit_iii: dict[str, dict[str, list[PerformanceKinerjaRecord]]] = defaultdict(
        lambda: defaultdict(list)
    )
    grouped_unit_iv: dict[
        str,
        dict[str, dict[str, list[PerformanceKinerjaRecord]]],
    ] = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for record, unit, _, unit_eselon_iii, unit_eselon_iv in resolved_records:
        grouped_units[unit].append(record)
        grouped_unit_iii[unit][unit_eselon_iii].append(record)
        grouped_unit_iv[unit][unit_eselon_iii][unit_eselon_iv].append(record)

    cache = _PerformanceDashboardCache(
        bind=db.get_bind(),
        dataset_signature=_dashboard_dataset_signature(dataset),
        built_at=monotonic(),
        dataset=_dataset_status(dataset),
        resolved_records=resolved_records,
        unit_options=sorted(
            {unit for _, unit, _, _, _ in resolved_records},
            key=str.casefold,
        ),
        unit_eselon_iii_options=sorted(
            {unit for _, _, _, unit, _ in resolved_records},
            key=str.casefold,
        ),
        unit_eselon_iv_options=sorted(
            {unit for _, _, _, _, unit in resolved_records},
            key=str.casefold,
        ),
        eselon_options=sorted(
            {eselon for _, _, eselon, _, _ in resolved_records},
            key=str.casefold,
        ),
        units=[
            {
                **_make_unit_metrics(unit, grouped_units[unit]),
                "children": [
                    {
                        **_make_unit_metrics(child, grouped_unit_iii[unit][child]),
                        "children": [
                            _make_unit_metrics(
                                grandchild,
                                grouped_unit_iv[unit][child][grandchild],
                            )
                            for grandchild in sorted(
                                grouped_unit_iv[unit][child],
                                key=lambda label: _unit_order_key(
                                    label,
                                    grouped_unit_iv[unit][child][label],
                                ),
                            )
                        ],
                    }
                    for child in sorted(
                        grouped_unit_iii[unit],
                        key=lambda label: _unit_order_key(
                            label,
                            grouped_unit_iii[unit][label],
                        ),
                    )
                ],
            }
            for unit in sorted(
                grouped_units,
                key=lambda label: _unit_order_key(label, grouped_units[label]),
            )
        ],
    )
    cache.record_filter_options = _record_filter_options(cache)
    cache.record_numeric_ranges = _record_numeric_ranges(cache)
    return cache

def _get_dashboard_cache(
    db: Session,
    dataset: PerformanceKinerjaDataset,
) -> _PerformanceDashboardCache:
    bind = db.get_bind()
    signature = _dashboard_dataset_signature(dataset)
    cache_key = (bind, dataset.id)
    with _dashboard_cache_lock:
        cache = _dashboard_cache.get(cache_key)
        if (
            cache is not None
            and cache.dataset_signature == signature
            and monotonic() - cache.built_at < CACHE_TTL_SECONDS
        ):
            _dashboard_cache.move_to_end(cache_key)
            return cache
        cache = _build_dashboard_cache(db, dataset)
        _dashboard_cache[cache_key] = cache
        _dashboard_cache.move_to_end(cache_key)
        while len(_dashboard_cache) > MAX_CACHED_DATASETS:
            _dashboard_cache.popitem(last=False)
        return cache

def _dashboard_filtered_records(
    cache: _PerformanceDashboardCache,
    unit_eselon_ii: str | None,
    unit_eselon_iii: str | None,
    unit_eselon_iv: str | None,
    eselons: tuple[str, ...],
) -> list[PerformanceKinerjaRecord]:
    return [
        record
        for record, unit, eselon, unit_iii, unit_iv in cache.resolved_records
        if (unit_eselon_ii is None or unit == unit_eselon_ii)
        and (unit_eselon_iii is None or unit_iii == unit_eselon_iii)
        and (unit_eselon_iv is None or unit_iv == unit_eselon_iv)
        and (not eselons or eselon in eselons)
    ]

def _dashboard_filter_options(
    cache: _PerformanceDashboardCache,
    unit_eselon_ii: str | None,
    unit_eselon_iii: str | None,
    unit_eselon_iv: str | None,
    eselons: tuple[str, ...],
) -> dict[str, list[str]]:
    selected_filters: dict[str, str | tuple[str, ...] | None] = {
        "unit_eselon_ii": unit_eselon_ii,
        "unit_eselon_iii": unit_eselon_iii,
        "unit_eselon_iv": unit_eselon_iv,
        "eselon": eselons,
    }
    option_values = {field: set() for field in selected_filters}
    for _, unit, eselon, unit_iii, unit_iv in cache.resolved_records:
        values = {
            "unit_eselon_ii": unit,
            "unit_eselon_iii": unit_iii,
            "unit_eselon_iv": unit_iv,
            "eselon": eselon,
        }
        for field in selected_filters:
            if any(
                selected_value
                and field != other_field
                and (
                    values[other_field] not in selected_value
                    if isinstance(selected_value, tuple)
                    else values[other_field] != selected_value
                )
                for other_field, selected_value in selected_filters.items()
            ):
                continue
            option_values[field].add(values[field])

    return {
        field: sorted(values, key=str.casefold)
        for field, values in option_values.items()
    }

def _cached_filtered_overview(
    cache: _PerformanceDashboardCache,
    filter_key: tuple[str | None, str | None, str | None, tuple[str, ...]],
    records: list[PerformanceKinerjaRecord],
) -> dict[str, Any]:
    with _dashboard_cache_lock:
        overview = cache.filtered_overviews.get(filter_key)
        if overview is not None:
            cache.filtered_overviews.move_to_end(filter_key)
            return overview

        overview = _make_group("Semua Pegawai", records)
        cache.filtered_overviews[filter_key] = overview
        if len(cache.filtered_overviews) > MAX_CACHED_FILTERS:
            cache.filtered_overviews.popitem(last=False)
        return overview

def get_dashboard(
    db: Session,
    unit_eselon_ii: str | None,
    eselons: list[str],
    period: str | None = None,
    unit_eselon_iii: str | None = None,
    unit_eselon_iv: str | None = None,
) -> dict[str, Any]:
    datasets = sorted(
        _performance_datasets(db),
        key=lambda item: _period_sort_key(item.period),
    )
    dataset = _select_dataset(datasets, period)
    available_periods = [
        {"period": item.period, "row_count": item.row_count}
        for item in datasets
    ]
    if dataset is None:
        return {
            "dataset": None,
            "previous_period": None,
            "available_periods": available_periods,
            "total_employees": 0,
            "unit_eselon_ii_options": [],
            "unit_eselon_iii_options": [],
            "unit_eselon_iv_options": [],
            "eselon_options": [],
            "overview": _make_group("Semua Pegawai", []),
            "overview_previous": None,
            "overview_comparison": {},
            "units": [],
        }

    cache = _get_dashboard_cache(db, dataset)
    previous_period = _previous_period(dataset.period)
    previous_dataset = next(
        (item for item in datasets if item.period == previous_period),
        None,
    )
    previous_cache = (
        _get_dashboard_cache(db, previous_dataset)
        if previous_dataset is not None
        else None
    )
    selected_eselons = tuple(sorted(set(eselons), key=str.casefold))
    filter_options = _dashboard_filter_options(
        cache,
        unit_eselon_ii,
        unit_eselon_iii,
        unit_eselon_iv,
        selected_eselons,
    )
    filter_key = (
        unit_eselon_ii,
        unit_eselon_iii,
        unit_eselon_iv,
        selected_eselons,
    )
    filtered_records = _dashboard_filtered_records(
        cache,
        unit_eselon_ii,
        unit_eselon_iii,
        unit_eselon_iv,
        selected_eselons,
    )
    overview = _cached_filtered_overview(cache, filter_key, filtered_records)
    overview_previous = None
    overview_comparison = {}
    if previous_cache is not None:
        previous_records = _dashboard_filtered_records(
            previous_cache,
            unit_eselon_ii,
            unit_eselon_iii,
            unit_eselon_iv,
            selected_eselons,
        )
        overview_previous = _cached_filtered_overview(
            previous_cache,
            filter_key,
            previous_records,
        )
        overview_comparison = _unit_comparison_values(
            _make_unit_metrics("Overview", filtered_records),
            _make_unit_metrics("Overview", previous_records),
        )

    return {
        "dataset": cache.dataset,
        "previous_period": (
            previous_dataset.period if previous_dataset is not None else None
        ),
        "available_periods": available_periods,
        "total_employees": len(cache.resolved_records),
        "unit_eselon_ii_options": filter_options["unit_eselon_ii"],
        "unit_eselon_iii_options": filter_options["unit_eselon_iii"],
        "unit_eselon_iv_options": filter_options["unit_eselon_iv"],
        "eselon_options": filter_options["eselon"],
        "overview": overview,
        "overview_previous": overview_previous,
        "overview_comparison": overview_comparison,
        "units": (
            _units_with_comparisons(
                cache.units,
                previous_cache.units if previous_cache is not None else None,
            )
            if previous_cache is not None
            else cache.units
        ),
    }
