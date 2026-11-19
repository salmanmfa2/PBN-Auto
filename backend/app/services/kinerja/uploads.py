"""Uploads for Kinerja performance workflows."""

import csv
from dataclasses import field
from datetime import datetime, timezone
from io import StringIO
from typing import Any
from sqlalchemy import bindparam, text, delete, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.history_db import engine
from app.models.performance_kinerja import (
    PerformanceKinerjaRecord,
    PerformanceKinerjaDataset,
    PerformanceCorrectionEditLog,
)
from .cache import invalidate_dashboard_cache
from .common import (
    EMPLOYEE_REFERENCE_TABLES,
    FULL_DATA_HEADERS,
    UNIDENTIFIED,
    _NUMERIC_FIELDS,
    _PENALTY_FIELDS,
    _TEXT_FIELDS,
    _calculate_nkp_perhitungan,
    _get_nkp_perhitungan_status,
    _normalize_penalty,
    _parse_decimal,
    _validate_numeric_range,
    normalize_nip,
    validate_period,
)

def _read_full_csv(content: bytes) -> list[dict[str, Any]]:
    try:
        text_content = content.decode("utf-8-sig")
        rows = list(csv.reader(StringIO(text_content), delimiter=";"))
    except (UnicodeDecodeError, csv.Error) as exc:
        raise ValueError("The uploaded file must be a valid UTF-8 semicolon-delimited CSV.") from exc
    if not rows or not rows[0]:
        raise ValueError("The CSV must contain a header row.")

    headers = [header.strip() for header in rows[0]]
    if len(headers) != len(set(headers)):
        raise ValueError("The CSV contains duplicate column names.")
    if tuple(headers) != FULL_DATA_HEADERS:
        missing = [header for header in FULL_DATA_HEADERS if header not in headers]
        extra = [header for header in headers if header not in FULL_DATA_HEADERS]
        details = []
        if missing:
            details.append(f"Missing columns: {', '.join(missing)}")
        if extra:
            details.append(f"Unexpected columns: {', '.join(extra)}")
        if not details:
            details.append("Columns must be in the sample format and order.")
        raise ValueError("CSV columns do not match. " + ". ".join(details) + ".")

    data_rows = [
        row for row in rows[1:]
        if any(cell.strip() for cell in row)
    ]
    if not data_rows:
        raise ValueError("The CSV must contain at least one data row.")

    parsed: list[dict[str, Any]] = []
    errors: list[str] = []
    for row_number, cells in enumerate(data_rows, start=2):
        if len(cells) != len(FULL_DATA_HEADERS):
            errors.append(f"row {row_number}: expected {len(FULL_DATA_HEADERS)} columns.")
            continue
        raw = dict(zip(FULL_DATA_HEADERS, cells, strict=True))
        nip = normalize_nip(raw["NIP"])
        if not nip:
            errors.append(f"row {row_number}: NIP must contain 16 or 18 digits.")
            continue

        record: dict[str, Any] = {
            "nip": nip,
            "nama": raw["Nama"].strip(),
            "_normalized_penalty_count": 0,
        }
        row_errors: list[str] = []
        for field, column in _NUMERIC_FIELDS.items():
            try:
                value = _parse_decimal(
                    raw[field],
                    field=field,
                    row_number=row_number,
                    nip=nip,
                )
                if field in _PENALTY_FIELDS:
                    value, normalized = _normalize_penalty(value)
                    record["_normalized_penalty_count"] += int(normalized)
                _validate_numeric_range(field, value, row_number=row_number, nip=nip)
                record[column] = value
            except ValueError as exc:
                row_errors.append(str(exc))
        for field, column in _TEXT_FIELDS.items():
            record[column] = raw[field].strip() or None

        if row_errors:
            errors.extend(row_errors)
            continue

        parsed.append(record)

    seen: set[str] = set()
    duplicates: set[str] = set()
    for record in parsed:
        nip = record["nip"]
        if nip in seen:
            duplicates.add(nip)
        seen.add(nip)
    if duplicates:
        errors.append("Duplicate NIPs: " + ", ".join(sorted(duplicates)) + ".")
    if errors:
        raise ValueError("Full upload validation failed: " + " ".join(errors[:30]))
    return parsed

def _lookup_employee_records(
    nips: set[str],
    employee_source: str = "fetch_pbnopen",
) -> dict[str, dict[str, Any]]:
    employee_reference = EMPLOYEE_REFERENCE_TABLES.get(employee_source)
    if employee_reference is None:
        raise ValueError(
            "Employee source must be 'fetch_pbnopen' or 'dt_employee_q2_2026'."
        )
    employee_table, uses_eselon_reference, uses_unit_kerja_reference = employee_reference
    if not nips:
        return {}
    eselon_expression = "r.`value`" if uses_eselon_reference else "e.`eselon`"
    eselon_join = (
        "LEFT JOIN pbncleaner.ref_eselon AS r ON e.eselon_id = r.eselon_id"
        if uses_eselon_reference
        else ""
    )
    unit_kerja_expression = (
        "u.unit_kerja_id" if uses_unit_kerja_reference else "e.unit_kerja_id"
    )
    unit_kerja_join = (
        "LEFT JOIN pbncleaner.ref_unit_kerja AS u "
        "ON TRIM(e.`Unit Kerja`) = TRIM(u.`value`)"
        if uses_unit_kerja_reference
        else ""
    )
    statement = text(
        f"""
        SELECT e.`NIP`, e.`Nama Gelar` AS nama, e.`Unit Eselon II` AS unit_eselon_ii,
               e.`Unit Eselon III` AS unit_eselon_iii,
               e.`Unit Eselon IV` AS unit_eselon_iv, {eselon_expression} AS eselon,
               {unit_kerja_expression} AS unit_kerja_id
        FROM pbncleaner.{employee_table} AS e
        {eselon_join}
        {unit_kerja_join}
        WHERE TRIM(REPLACE(CAST(e.`NIP` AS CHAR), CHAR(9), '')) IN :nips
        """
    ).bindparams(bindparam("nips", expanding=True))
    try:
        with engine.connect() as connection:
            rows = connection.execute(statement, {"nips": sorted(nips)}).mappings().all()
    except SQLAlchemyError as exc:
        raise RuntimeError(
            f"Could not look up employees in 'pbncleaner.{employee_table}'. "
            "Check database connectivity and the NIP column."
        ) from exc

    matches: dict[str, dict[str, str]] = {}
    duplicates: set[str] = set()
    for row in rows:
        nip = normalize_nip(row["NIP"])
        if not nip:
            continue
        if nip in matches:
            duplicates.add(nip)
        matches[nip] = {
            "nama": str(row["nama"] or "").strip(),
            "unit_eselon_ii": str(row["unit_eselon_ii"] or "").strip(),
            "unit_eselon_iii": str(row.get("unit_eselon_iii") or "").strip(),
            "unit_eselon_iv": str(row.get("unit_eselon_iv") or "").strip(),
            "eselon": str(row["eselon"] or "").strip(),
            "unit_kerja_id": (
                int(row["unit_kerja_id"])
                if row["unit_kerja_id"] is not None
                else None
            ),
        }
    for nip in duplicates:
        matches[nip] = {
            "nama": "",
            "unit_eselon_ii": UNIDENTIFIED,
            "unit_eselon_iii": UNIDENTIFIED,
            "unit_eselon_iv": UNIDENTIFIED,
            "eselon": UNIDENTIFIED,
            "unit_kerja_id": None,
        }
    return matches

def _prepare_full_upload(
    content: bytes,
    period: str,
    employee_source: str = "fetch_pbnopen",
) -> tuple[str, list[dict[str, Any]], int, int]:
    normalized_period = validate_period(period)
    records = _read_full_csv(content)
    normalized_penalty_count = sum(
        record.pop("_normalized_penalty_count", 0)
        for record in records
    )
    employees = _lookup_employee_records(
        {record["nip"] for record in records},
        employee_source=employee_source,
    )
    unidentified_count = 0
    for record in records:
        nkp_perhitungan = _calculate_nkp_perhitungan(
            record["nkp_awal"],
            record["nko"],
        )
        record["nkp_perhitungan"] = nkp_perhitungan
        record["status_nkp_perhitungan"] = _get_nkp_perhitungan_status(
            nkp_perhitungan
        )
        employee = employees.get(record["nip"])
        if employee is None:
            record["unit_eselon_ii"] = UNIDENTIFIED
            record["unit_eselon_iii"] = UNIDENTIFIED
            record["unit_eselon_iv"] = UNIDENTIFIED
            record["eselon"] = UNIDENTIFIED
            record["unit_kerja_id"] = None
            unidentified_count += 1
            continue
        record["nama"] = employee.get("nama") or record["nama"]
        record["unit_eselon_ii"] = employee["unit_eselon_ii"] or UNIDENTIFIED
        record["unit_eselon_iii"] = employee.get("unit_eselon_iii") or UNIDENTIFIED
        record["unit_eselon_iv"] = employee.get("unit_eselon_iv") or UNIDENTIFIED
        record["eselon"] = employee["eselon"] or UNIDENTIFIED
        record["unit_kerja_id"] = employee.get("unit_kerja_id")
        if (
            record["unit_eselon_ii"] == UNIDENTIFIED
            and record["eselon"] == UNIDENTIFIED
        ):
            unidentified_count += 1
    return normalized_period, records, unidentified_count, normalized_penalty_count

def validate_full_upload(
    content: bytes,
    period: str,
    employee_source: str = "fetch_pbnopen",
) -> dict[str, Any]:
    normalized_period, records, unidentified_count, normalized_penalty_count = (
        _prepare_full_upload(content, period, employee_source)
    )
    return {
        "period": normalized_period,
        "row_count": len(records),
        "unidentified_count": unidentified_count,
        "normalized_penalty_count": normalized_penalty_count,
    }

def replace_full_upload(
    db: Session,
    content: bytes,
    period: str,
    uploaded_by_user: str,
    uploaded_by_name: str,
    employee_source: str = "fetch_pbnopen",
) -> dict[str, Any]:
    normalized_period, records, unidentified_count, normalized_penalty_count = (
        _prepare_full_upload(content, period, employee_source)
    )

    try:
        dataset = db.scalar(
            select(PerformanceKinerjaDataset).where(
                PerformanceKinerjaDataset.period == normalized_period
            )
        )
        if dataset is None:
            dataset = PerformanceKinerjaDataset(
                period=normalized_period,
                row_count=len(records),
                uploaded_at=datetime.now(timezone.utc),
                uploaded_by_user=uploaded_by_user,
                uploaded_by_name=uploaded_by_name,
            )
            db.add(dataset)
            db.flush()
        else:
            dataset.period = normalized_period
            dataset.row_count = len(records)
            dataset.uploaded_at = datetime.now(timezone.utc)
            dataset.uploaded_by_user = uploaded_by_user
            dataset.uploaded_by_name = uploaded_by_name
            db.execute(
                delete(PerformanceKinerjaRecord).where(
                    PerformanceKinerjaRecord.dataset_id == dataset.id
                )
            )
        for record in records:
            db.add(PerformanceKinerjaRecord(dataset_id=dataset.id, **record))
        db.execute(delete(PerformanceCorrectionEditLog))
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise
    invalidate_dashboard_cache()
    return {
        "period": normalized_period,
        "row_count": len(records),
        "unidentified_count": unidentified_count,
        "normalized_penalty_count": normalized_penalty_count,
    }
