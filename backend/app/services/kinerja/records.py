"""Records for Kinerja performance workflows."""

import csv
from collections import defaultdict
from dataclasses import field
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from io import StringIO
from typing import Any
from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.models.performance_kinerja import (
    PerformanceKinerjaRecord,
    PerformanceKinerjaDataset,
    PerformanceKinerjaInsight,
)
from .cache import _PerformanceDashboardCache, _dashboard_cache_lock
from .common import (
    FULL_DATA_HEADERS,
    RECORD_EXPORT_COLUMNS,
    RECORD_FILTER_OPTION_FIELDS,
    _NUMERIC_FIELDS,
    _performance_datasets,
    _select_dataset,
    get_status,
    normalize_nip,
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
    result_records, total = _query_performance_records(
        db,
        dataset,
        page=page,
        page_size=page_size,
        search=search,
        filters=normalized_filters,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return {
        "period": dataset.period,
        "page": page,
        "page_size": page_size,
        "total": total,
        "records": result_records,
        "filter_options": _filtered_record_filter_options(
            cache,
            normalized_filters,
            search,
        ),
        "numeric_ranges": cache.record_numeric_ranges,
    }


WILDCARD_COMPARE_FIELDS = (
    ("nhk", "NHK"),
    ("npk", "NPK"),
    ("nkp_awal", "NKP Awal"),
    ("nilai_hukuman_disiplin", "Nilai Hukuman Disiplin"),
    ("nilai_dampak_pelanggaran_disiplin", "Nilai Dampak Pelanggaran Disiplin"),
    ("nilai_dampak_perilaku", "Nilai Dampak Perilaku"),
    ("nilai_koreksi", "Nilai Koreksi"),
    ("nko", "NKO"),
    ("nkp_akhir", "NKP Akhir"),
)


def _parse_wildcard_decimal(value: object) -> Decimal | None:
    if value is None:
        return None
    text_value = str(value).strip().replace("%", "").replace(" ", "")
    if not text_value:
        return None
    if "," in text_value and "." not in text_value:
        text_value = text_value.replace(",", ".")
    try:
        return Decimal(text_value)
    except (InvalidOperation, ValueError):
        return None


def _wildcard_csv_rows(content: bytes) -> tuple[list[dict[str, str]], list[str]]:
    try:
        text_content = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("The uploaded file must be a valid UTF-8 CSV.") from exc

    first_line = text_content.splitlines()[0] if text_content else ""
    delimiter = ";" if ";" in first_line else ","
    reader = csv.reader(StringIO(text_content), delimiter=delimiter)
    try:
        rows = list(reader)
    except csv.Error as exc:
        raise ValueError("The uploaded file must be a valid CSV.") from exc
    if not rows or not rows[0]:
        raise ValueError("The CSV must contain a header row.")

    headers = [header.strip() for header in rows[0]]
    if len(headers) != len(set(headers)):
        raise ValueError("The CSV contains duplicate column names.")
    if "NIP" not in headers:
        raise ValueError("The CSV must contain a NIP column.")

    missing = [header for header in FULL_DATA_HEADERS if header not in headers]
    if missing:
        raise ValueError(
            "The CSV must use the full Kinerja format. Missing columns: "
            + ", ".join(missing)
            + "."
        )

    parsed: list[dict[str, str]] = []
    errors: list[str] = []
    seen: set[str] = set()
    duplicates: set[str] = set()
    for row_number, cells in enumerate(rows[1:], start=2):
        if not any(cell.strip() for cell in cells):
            continue
        if len(cells) != len(headers):
            errors.append(f"row {row_number}: expected {len(headers)} columns.")
            continue
        raw = dict(zip(headers, cells, strict=True))
        nip = normalize_nip(raw["NIP"])
        if nip is None:
            errors.append(f"row {row_number}: NIP must contain 16 or 18 digits.")
            continue
        if nip in seen:
            duplicates.add(nip)
        seen.add(nip)
        parsed.append(raw)

    if duplicates:
        errors.append("Duplicate NIPs: " + ", ".join(sorted(duplicates)) + ".")
    if errors:
        raise ValueError("Wildcard CSV validation failed. " + " ".join(errors[:30]))
    if not parsed:
        raise ValueError("The CSV must contain at least one data row.")
    return parsed, []


def _display_wildcard_value(field: str, value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:.8f}".rstrip("0").rstrip(".")
    return str(value)


def compare_wildcard_csv(
    db: Session,
    content: bytes,
    *,
    period: str | None,
    search: str,
    filters: dict[str, str] | None,
    sort_by: str,
    sort_order: str,
) -> dict[str, Any]:
    dataset = _select_dataset(_performance_datasets(db), period)
    if dataset is None:
        raise ValueError("No performance dataset is available for the selected period.")

    uploaded_rows, _ = _wildcard_csv_rows(content)
    uploaded_by_nip = {
        normalize_nip(row["NIP"]): row
        for row in uploaded_rows
        if normalize_nip(row["NIP"]) is not None
    }
    current_records, _ = _query_performance_records(
        db,
        dataset,
        search=search,
        filters=filters,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    differences: list[dict[str, Any]] = []
    matched_count = 0
    for current in current_records:
        nip = normalize_nip(current["nip"])
        uploaded = uploaded_by_nip.get(nip)
        if uploaded is None:
            continue
        matched_count += 1
        changed_fields: list[dict[str, str]] = []

        for field, label in WILDCARD_COMPARE_FIELDS:
            if label == "Status":
                continue
            uploaded_raw = uploaded.get(label)
            uploaded_value = _parse_wildcard_decimal(uploaded_raw)
            current_value = current.get(field)
            current_decimal = (
                Decimal(str(current_value))
                if current_value is not None
                else None
            )
            if uploaded_value != current_decimal:
                changed_fields.append({
                    "field": field,
                    "label": label,
                    "current": _display_wildcard_value(field, current_value),
                    "uploaded": _display_wildcard_value(field, uploaded_raw),
                })

        uploaded_nkp_akhir = _parse_wildcard_decimal(uploaded.get("NKP Akhir"))
        uploaded_status = get_status(uploaded_nkp_akhir)
        current_status = current.get("status")
        if uploaded_status != current_status:
            changed_fields.append({
                "field": "status",
                "label": "Status",
                "current": str(current_status or ""),
                "uploaded": uploaded_status,
            })

        if changed_fields:
            differences.append({
                "nip": nip,
                "nama": current.get("nama") or uploaded.get("Nama") or "",
                "differences": changed_fields,
            })

    return {
        "period": dataset.period,
        "matched_count": matched_count,
        "difference_count": len(differences),
        "differences": differences,
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
    page: int | None = None,
    page_size: int | None = None,
) -> tuple[list[dict[str, Any]], int]:
    normalized_filters, normalized_sort_order = _validate_record_query(
        filters,
        sort_by,
        sort_order,
    )
    normalized_search = search.strip().casefold()
    statement = select(PerformanceKinerjaRecord).where(
        PerformanceKinerjaRecord.dataset_id == dataset.id
    )

    if normalized_search:
        statement = statement.where(
            or_(
                func.lower(PerformanceKinerjaRecord.nama).contains(normalized_search),
                func.lower(PerformanceKinerjaRecord.nip).contains(normalized_search),
            )
        )

    status_expression = case(
        (PerformanceKinerjaRecord.nkp_akhir.is_(None), "Tidak tersedia"),
        (PerformanceKinerjaRecord.nkp_akhir >= Decimal("115"), "Sangat Istimewa"),
        (PerformanceKinerjaRecord.nkp_akhir >= Decimal("110"), "Istimewa"),
        (PerformanceKinerjaRecord.nkp_akhir >= Decimal("100"), "Tinggi"),
        (PerformanceKinerjaRecord.nkp_akhir >= Decimal("90"), "Sedang"),
        else_="Rendah",
    )

    for key, expected in normalized_filters.items():
        if key.endswith("__min") or key.endswith("__max"):
            field, bound = key.rsplit("__", maxsplit=1)
            column = getattr(PerformanceKinerjaRecord, field)
            numeric_value = Decimal(expected)
            statement = statement.where(
                column >= numeric_value
                if bound == "min"
                else column <= numeric_value
            )
        elif key == "status":
            statement = statement.where(
                func.lower(status_expression) == expected
            )
        else:
            column = getattr(PerformanceKinerjaRecord, key)
            if key in RECORD_FILTER_OPTION_FIELDS:
                statement = statement.where(func.lower(column) == expected)
            else:
                statement = statement.where(
                    func.lower(column).contains(expected)
                )

    count_statement = select(func.count()).select_from(statement.subquery())
    total = db.scalar(count_statement) or 0

    if sort_by == "status":
        records = db.scalars(statement).all()
        result_records = [
            _performance_record_data(
                record,
                {
                    "unit_eselon_ii": record.unit_eselon_ii,
                    "unit_eselon_iii": record.unit_eselon_iii,
                    "unit_eselon_iv": record.unit_eselon_iv,
                    "eselon": record.eselon,
                },
            )
            for record in records
        ]
        present_records = [
            record for record in result_records
            if record[sort_by] is not None
        ]
        missing_records = [
            record for record in result_records
            if record[sort_by] is None
        ]
        present_records.sort(
            key=lambda record: str(record[sort_by]).casefold(),
            reverse=normalized_sort_order == "desc",
        )
        ordered_records = present_records + missing_records
        if page is not None and page_size is not None:
            offset = (page - 1) * page_size
            return ordered_records[offset:offset + page_size], total
        return ordered_records, total

    sort_column = getattr(PerformanceKinerjaRecord, sort_by)
    nulls_last_expression = case(
        (sort_column.is_(None), 1),
        else_=0,
    )
    statement = statement.order_by(
        nulls_last_expression.asc(),
        sort_column.desc()
        if normalized_sort_order == "desc"
        else sort_column.asc(),
    )
    if page is not None and page_size is not None:
        statement = statement.limit(page_size).offset((page - 1) * page_size)
    records = db.scalars(statement).all()
    result_records = [
        _performance_record_data(
            record,
            {
                "unit_eselon_ii": record.unit_eselon_ii,
                "unit_eselon_iii": record.unit_eselon_iii,
                "unit_eselon_iv": record.unit_eselon_iv,
                "eselon": record.eselon,
            },
        )
        for record in records
    ]
    return result_records, total

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
