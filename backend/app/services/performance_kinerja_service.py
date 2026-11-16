import csv
import re
from collections import OrderedDict, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from io import BytesIO, StringIO
from threading import RLock
from time import monotonic
from typing import Any
from zipfile import BadZipFile

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font
from openpyxl.utils.exceptions import InvalidFileException
from openpyxl.utils import get_column_letter
from sqlalchemy import bindparam, delete, func, or_, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.history_db import engine
from app.models.performance_kinerja import (
    PerformanceKinerjaDataset,
    PerformanceKinerjaInsight,
    PerformanceKinerjaRecord,
)


FULL_DATA_HEADERS = (
    "Nama",
    "NIP",
    "NHK",
    "NPK",
    "NHK Kalibrasi",
    "NPK Kalibrasi",
    "NKP Awal",
    "Rating Hasil Kerja Awal",
    "Rating Perilaku Kerja Awal",
    "Predikat Kinerja Awal",
    "Nilai Hukuman Disiplin",
    "Nilai Dampak Pelanggaran Disiplin",
    "Nilai Dampak Perilaku",
    "Nilai Koreksi",
    "NKO",
    "NKP Akhir",
    "Rating Hasil Kerja",
    "Rating Perilaku Kerja",
    "Predikat Kinerja",
)
ADJUSTMENT_HEADERS = (
    "NIP",
    "Nilai Hukuman Disiplin",
    "Nilai Dampak Pelanggaran Disiplin",
    "Nilai Dampak Perilaku",
    "Nilai Koreksi",
)
PERIOD_PATTERN = re.compile(r"Q[1-4]-\d{4}")
MAX_NUMBER = Decimal("120")
MAX_ADJUSTMENT = Decimal("20")
ZERO = Decimal("0")
TWO_PLACES = Decimal("0.01")
UNIDENTIFIED = "Unidentified"
EMPLOYEE_REFERENCE_TABLES = {
    "fetch_pbnopen": ("fetch_pbnopen", False, True),
    "dt_employee_q2_2026": ("dt_employee_q2_2026", True, False),
}
CACHE_TTL_SECONDS = 300
MAX_CACHED_FILTERS = 64
MAX_CACHED_DATASETS = 12
STATUS_LABELS = (
    "Sangat Istimewa",
    "Istimewa",
    "Tinggi",
    "Sedang",
    "Rendah",
    "Tidak tersedia",
)

_NUMERIC_FIELDS = {
    "NHK": "nhk",
    "NPK": "npk",
    "NHK Kalibrasi": "nhk_kalibrasi",
    "NPK Kalibrasi": "npk_kalibrasi",
    "NKP Awal": "nkp_awal",
    "Nilai Hukuman Disiplin": "nilai_hukuman_disiplin",
    "Nilai Dampak Pelanggaran Disiplin": "nilai_dampak_pelanggaran_disiplin",
    "Nilai Dampak Perilaku": "nilai_dampak_perilaku",
    "Nilai Koreksi": "nilai_koreksi",
    "NKO": "nko",
    "NKP Akhir": "nkp_akhir",
}
_TEXT_FIELDS = {
    "Rating Hasil Kerja Awal": "rating_hasil_kerja_awal",
    "Rating Perilaku Kerja Awal": "rating_perilaku_kerja_awal",
    "Predikat Kinerja Awal": "predikat_kinerja_awal",
    "Rating Hasil Kerja": "rating_hasil_kerja",
    "Rating Perilaku Kerja": "rating_perilaku_kerja",
    "Predikat Kinerja": "predikat_kinerja",
}
RECORD_FILTER_OPTION_FIELDS = (
    "unit_eselon_ii",
    "unit_eselon_iii",
    "unit_eselon_iv",
    "eselon",
    "rating_hasil_kerja_awal",
    "rating_perilaku_kerja_awal",
    "predikat_kinerja_awal",
    "rating_hasil_kerja",
    "rating_perilaku_kerja",
    "predikat_kinerja",
    "status",
)
_SCORE_FIELDS = {"NHK", "NPK", "NHK Kalibrasi", "NPK Kalibrasi", "NKO"}
_PENALTY_FIELDS = {
    "Nilai Hukuman Disiplin",
    "Nilai Dampak Pelanggaran Disiplin",
    "Nilai Dampak Perilaku",
}
RECORD_EXPORT_COLUMNS = (
    ("nama", "Nama"),
    ("nip", "NIP"),
    ("unit_eselon_ii", "Unit Eselon II"),
    ("unit_eselon_iii", "Unit Eselon III"),
    ("unit_eselon_iv", "Unit Eselon IV"),
    ("eselon", "Eselon"),
    ("nhk", "NHK"),
    ("npk", "NPK"),
    ("nhk_kalibrasi", "NHK Kalibrasi"),
    ("npk_kalibrasi", "NPK Kalibrasi"),
    ("nkp_awal", "NKP Awal"),
    ("rating_hasil_kerja_awal", "Rating Hasil Kerja Awal"),
    ("rating_perilaku_kerja_awal", "Rating Perilaku Kerja Awal"),
    ("predikat_kinerja_awal", "Predikat Kinerja Awal"),
    ("nilai_hukuman_disiplin", "Nilai Hukuman Disiplin"),
    ("nilai_dampak_pelanggaran_disiplin", "Nilai Dampak Pelanggaran Disiplin"),
    ("nilai_dampak_perilaku", "Nilai Dampak Perilaku"),
    ("nilai_koreksi", "Nilai Koreksi"),
    ("nko", "NKO"),
    ("nkp_akhir", "NKP Akhir"),
    ("rating_hasil_kerja", "Rating Hasil Kerja"),
    ("rating_perilaku_kerja", "Rating Perilaku Kerja"),
    ("predikat_kinerja", "Predikat Kinerja"),
    ("status", "Status"),
)
UNIT_EXPORT_HEADERS = (
    "Unit Eselon II",
    "Unit Eselon III",
    "Unit Eselon IV",
    "Jumlah Pegawai",
    "Rata-rata NPK",
    "Rata-rata NHK",
    "Rata-rata NKP Awal",
    "NKP Awal Sangat Istimewa",
    "Persentase NKP Awal Sangat Istimewa",
    "Hukdis",
    "Dampak Pelanggaran",
    "Dampak Perilaku",
    "Jumlah Koreksi",
    "Penambahan",
    "Pengurangan",
    "Rata-rata Koreksi",
    "Koreksi Maksimum",
    "Koreksi Minimum",
    "Rata-rata NKP Akhir",
    "NKP Akhir Sangat Istimewa",
    "Persentase NKP Akhir Sangat Istimewa",
    "Gap Status",
)


@dataclass
class _PerformanceDashboardCache:
    bind: object
    dataset_signature: tuple[Any, ...]
    built_at: float
    dataset: dict[str, Any]
    resolved_records: list[tuple[PerformanceKinerjaRecord, str, str, str, str]]
    unit_options: list[str]
    eselon_options: list[str]
    units: list[dict[str, Any]]
    record_filter_options: dict[str, list[str]] = field(default_factory=dict)
    record_numeric_ranges: dict[str, tuple[float | None, float | None]] = field(
        default_factory=dict
    )
    filtered_overviews: OrderedDict[tuple[str | None, tuple[str, ...]], dict[str, Any]] = field(
        default_factory=OrderedDict
    )
    analyses: dict[str, dict[str, Any]] = field(default_factory=dict)


_dashboard_cache: OrderedDict[
    tuple[object, int],
    _PerformanceDashboardCache,
] = OrderedDict()
_dashboard_cache_lock = RLock()


def invalidate_dashboard_cache() -> None:
    with _dashboard_cache_lock:
        _dashboard_cache.clear()


def normalize_nip(value: object) -> str | None:
    if value is None:
        return None
    raw = str(value).strip().lstrip("'`").strip()
    if re.fullmatch(r"\d+\.0+", raw):
        raw = raw[: raw.index(".")]
    raw = re.sub(r"\s+", "", raw)
    return raw if re.fullmatch(r"(?:\d{16}|\d{18})", raw) else None


def validate_period(period: str) -> str:
    normalized = period.strip().upper()
    if not PERIOD_PATTERN.fullmatch(normalized):
        raise ValueError("Period must use the Q1-YYYY format, for example Q3-2026.")
    return normalized


def _period_sort_key(period: str) -> tuple[int, int]:
    return int(period[3:]), int(period[1])


def _previous_period(period: str) -> str:
    quarter = int(period[1])
    year = int(period[3:])
    if quarter == 1:
        return f"Q4-{year - 1}"
    return f"Q{quarter - 1}-{year}"


def _performance_datasets(db: Session) -> list[PerformanceKinerjaDataset]:
    return db.scalars(select(PerformanceKinerjaDataset)).all()


def _select_dataset(
    datasets: list[PerformanceKinerjaDataset],
    period: str | None = None,
) -> PerformanceKinerjaDataset | None:
    if period is not None:
        normalized_period = validate_period(period)
        dataset = next(
            (item for item in datasets if item.period == normalized_period),
            None,
        )
        if dataset is None:
            raise ValueError(f"No performance dataset is stored for {normalized_period}.")
        return dataset
    if not datasets:
        return None
    return max(datasets, key=lambda item: _period_sort_key(item.period))


def _dataset_status(dataset: PerformanceKinerjaDataset) -> dict[str, Any]:
    uploaded_at = dataset.uploaded_at
    if uploaded_at.tzinfo is None:
        uploaded_at = uploaded_at.replace(tzinfo=timezone.utc)
    else:
        uploaded_at = uploaded_at.astimezone(timezone.utc)
    return {
        "period": dataset.period,
        "row_count": dataset.row_count,
        "uploaded_at": uploaded_at,
        "uploaded_by_user": dataset.uploaded_by_user,
        "uploaded_by_name": dataset.uploaded_by_name,
    }


def _parse_decimal(
    raw: object,
    *,
    field: str,
    row_number: int,
    nip: str,
    required: bool = False,
) -> Decimal | None:
    value = "" if raw is None else str(raw).strip()
    if not value:
        if required:
            raise ValueError(f"row {row_number}, NIP {nip}: {field} is required.")
        return None
    if "," in value and "." in value:
        raise ValueError(
            f"row {row_number}, NIP {nip}: {field} uses both comma and period; "
            "thousands separators are not supported."
        )
    normalized = value.replace(",", ".")
    if not re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)", normalized):
        raise ValueError(f"row {row_number}, NIP {nip}: {field} is not a valid number.")
    try:
        number = Decimal(normalized)
    except InvalidOperation as exc:
        raise ValueError(f"row {row_number}, NIP {nip}: {field} is not a valid number.") from exc
    if not number.is_finite():
        raise ValueError(f"row {row_number}, NIP {nip}: {field} must be finite.")
    return number


def _validate_numeric_range(
    field: str,
    value: Decimal | None,
    *,
    row_number: int,
    nip: str,
) -> None:
    if value is None:
        return
    if field in _SCORE_FIELDS and not ZERO <= value <= MAX_NUMBER:
        raise ValueError(
            f"row {row_number}, NIP {nip}: {field} must be between 0 and 120."
        )
    if field == "Nilai Koreksi" and not -MAX_ADJUSTMENT <= value <= MAX_ADJUSTMENT:
        raise ValueError(
            f"row {row_number}, NIP {nip}: Nilai Koreksi must be between -20 and 20."
        )


def _normalize_penalty(value: Decimal | None) -> tuple[Decimal | None, bool]:
    if value is not None and value > ZERO:
        return -value, True
    return value, False


def calculate_nkp_akhir(
    nkp_awal: Decimal | None,
    nko: Decimal | None,
    nilai_hukuman_disiplin: Decimal | None,
    nilai_dampak_pelanggaran_disiplin: Decimal | None,
    nilai_koreksi: Decimal | None,
) -> Decimal | None:
    if nkp_awal is None or nko is None:
        return None
    if nko > nkp_awal:
        base = Decimal("0.10") * nko + Decimal("0.90") * nkp_awal
    else:
        base = Decimal("0.70") * nko + Decimal("0.30") * nkp_awal
    return (
        base
        + (nilai_hukuman_disiplin or ZERO)
        + (nilai_dampak_pelanggaran_disiplin or ZERO)
        + (nilai_koreksi or ZERO)
    )


def get_status(nkp_akhir: Decimal | None) -> str:
    if nkp_akhir is None:
        return "Tidak tersedia"
    if nkp_akhir >= Decimal("115"):
        return "Sangat Istimewa"
    if nkp_akhir >= Decimal("110"):
        return "Istimewa"
    if nkp_akhir >= Decimal("100"):
        return "Tinggi"
    if nkp_akhir >= Decimal("90"):
        return "Sedang"
    return "Rendah"


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


def _read_adjustment_xlsx(content: bytes) -> list[dict[str, Any]]:
    try:
        workbook = load_workbook(BytesIO(content), read_only=True, data_only=True)
    except (BadZipFile, InvalidFileException, OSError, ValueError) as exc:
        raise ValueError("The adjustment file must be a valid .xlsx workbook.") from exc

    try:
        worksheet = workbook.active
        rows = worksheet.iter_rows(values_only=True)
        header_row = next(rows, None)
        if not header_row:
            raise ValueError("The adjustment workbook must contain a header row.")
        headers = [str(value or "").strip() for value in header_row]
        if len(headers) != len(set(headers)):
            raise ValueError("The adjustment workbook contains duplicate column names.")
        if set(headers) != set(ADJUSTMENT_HEADERS) or len(headers) != len(ADJUSTMENT_HEADERS):
            missing = [header for header in ADJUSTMENT_HEADERS if header not in headers]
            extra = [header for header in headers if header not in ADJUSTMENT_HEADERS]
            details = []
            if missing:
                details.append(f"Missing columns: {', '.join(missing)}")
            if extra:
                details.append(f"Unexpected columns: {', '.join(extra)}")
            raise ValueError("Adjustment columns do not match. " + ". ".join(details) + ".")

        positions = {header: index for index, header in enumerate(headers)}
        parsed: list[dict[str, Any]] = []
        errors: list[str] = []
        for row_number, cells in enumerate(rows, start=2):
            values = list(cells)
            if not any(value is not None and str(value).strip() for value in values):
                continue
            nip = normalize_nip(values[positions["NIP"]] if positions["NIP"] < len(values) else None)
            if not nip:
                errors.append(f"row {row_number}: NIP must contain 16 or 18 digits.")
                continue
            record: dict[str, Any] = {"nip": nip, "_normalized_penalty_count": 0}
            row_errors: list[str] = []
            for field in ADJUSTMENT_HEADERS[1:]:
                raw = values[positions[field]] if positions[field] < len(values) else None
                try:
                    value = _parse_decimal(
                        raw,
                        field=field,
                        row_number=row_number,
                        nip=nip,
                    )
                    if field in _PENALTY_FIELDS:
                        value, normalized = _normalize_penalty(value)
                        record["_normalized_penalty_count"] += int(normalized)
                    _validate_numeric_range(field, value, row_number=row_number, nip=nip)
                    record[_NUMERIC_FIELDS[field]] = value
                except ValueError as exc:
                    row_errors.append(str(exc))
            if not any(record.get(_NUMERIC_FIELDS[field]) is not None for field in ADJUSTMENT_HEADERS[1:]):
                row_errors.append(f"row {row_number}, NIP {nip}: provide at least one adjustment value.")
            if row_errors:
                errors.extend(row_errors)
                continue
            parsed.append(record)

        seen: set[str] = set()
        duplicates: set[str] = set()
        for record in parsed:
            if record["nip"] in seen:
                duplicates.add(record["nip"])
            seen.add(record["nip"])
        if duplicates:
            errors.append("Duplicate NIPs: " + ", ".join(sorted(duplicates)) + ".")
        if not parsed:
            errors.append("The adjustment workbook must contain at least one data row.")
        if errors:
            raise ValueError("Adjustment validation failed: " + " ".join(errors[:30]))
        return parsed
    finally:
        workbook.close()


def _validate_adjustment_target(
    db: Session,
    period: str,
    records: list[dict[str, Any]],
) -> PerformanceKinerjaDataset:
    normalized_period = validate_period(period)
    dataset = db.scalar(
        select(PerformanceKinerjaDataset).where(
            PerformanceKinerjaDataset.period == normalized_period
        )
    )
    if dataset is None:
        raise ValueError(f"There is no performance dataset for {normalized_period} to adjust.")
    existing_nips = set(
        db.scalars(
            select(PerformanceKinerjaRecord.nip).where(
                PerformanceKinerjaRecord.dataset_id == dataset.id,
                PerformanceKinerjaRecord.nip.in_([record["nip"] for record in records]),
            )
        ).all()
    )
    unknown_nips = sorted(record["nip"] for record in records if record["nip"] not in existing_nips)
    if unknown_nips:
        raise ValueError(
            "Unknown NIPs; no data was changed: " + ", ".join(unknown_nips[:30]) + "."
        )
    return dataset


def validate_adjustment_upload(db: Session, content: bytes, period: str) -> dict[str, Any]:
    records = _read_adjustment_xlsx(content)
    _validate_adjustment_target(db, period, records)
    return {
        "period": validate_period(period),
        "row_count": len(records),
        "unidentified_count": 0,
        "normalized_penalty_count": sum(
            record["_normalized_penalty_count"] for record in records
        ),
    }


def replace_adjustments(db: Session, content: bytes, period: str) -> dict[str, Any]:
    records = _read_adjustment_xlsx(content)
    normalized_period = validate_period(period)
    try:
        dataset = _validate_adjustment_target(db, normalized_period, records)
        stored_records = {
            record.nip: record
            for record in db.scalars(
                select(PerformanceKinerjaRecord).where(
                    PerformanceKinerjaRecord.dataset_id == dataset.id,
                    PerformanceKinerjaRecord.nip.in_([record["nip"] for record in records]),
                )
            ).all()
        }
        for update in records:
            stored = stored_records[update["nip"]]
            for field in ADJUSTMENT_HEADERS[1:]:
                column = _NUMERIC_FIELDS[field]
                if update[column] is not None:
                    setattr(stored, column, update[column])
            stored.nkp_akhir = calculate_nkp_akhir(
                stored.nkp_awal,
                stored.nko,
                stored.nilai_hukuman_disiplin,
                stored.nilai_dampak_pelanggaran_disiplin,
                stored.nilai_koreksi,
            )
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise
    invalidate_dashboard_cache()
    return {
        "period": normalized_period,
        "row_count": len(records),
        "unidentified_count": 0,
        "normalized_penalty_count": sum(
            record["_normalized_penalty_count"] for record in records
        ),
    }


def create_adjustment_template() -> bytes:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Penyesuaian"
    worksheet.append(ADJUSTMENT_HEADERS)
    worksheet.freeze_panes = "A2"
    worksheet.auto_filter.ref = f"A1:{chr(64 + len(ADJUSTMENT_HEADERS))}1"
    worksheet.column_dimensions["A"].width = 24
    for column in range(2, len(ADJUSTMENT_HEADERS) + 1):
        worksheet.column_dimensions[chr(64 + column)].width = 38
    worksheet["A2"].number_format = "@"
    stream = BytesIO()
    workbook.save(stream)
    workbook.close()
    return stream.getvalue()


def _status(nkp_akhir: Decimal | None) -> str:
    return get_status(nkp_akhir)


def _format_decimal(value: Decimal | None) -> float | None:
    if value is None:
        return None
    return float(value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP))


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
    nkp_awal_count = sum(
        1 for record in records if _status(record.nkp_awal) == "Sangat Istimewa"
    )
    nkp_akhir_count = sum(
        1 for record in records if _status(record.nkp_akhir) == "Sangat Istimewa"
    )
    return {
        "label": label,
        "unit_kerja_id": min(unit_kerja_ids) if unit_kerja_ids else None,
        "nkp_awal_status_counts": {
            status: sum(1 for record in records if _status(record.nkp_awal) == status)
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
        "nkp_awal_sangat_istimewa_count": nkp_awal_count,
        "nkp_awal_sangat_istimewa_percentage": _percentage(nkp_awal_count, len(records)),
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
        "correction": _make_correction_stats(records),
        "average_nkp_akhir": _average([record.nkp_akhir for record in records]),
        "nkp_akhir_sangat_istimewa_count": nkp_akhir_count,
        "nkp_akhir_sangat_istimewa_percentage": _percentage(nkp_akhir_count, len(records)),
        "status_gap_count": sum(
            1 for record in records if _status(record.nkp_awal) != _status(record.nkp_akhir)
        ),
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
        "nkp_awal_sangat_istimewa_count",
        "nkp_awal_sangat_istimewa_percentage",
        "hukdis_count",
        "dampak_pelanggaran_count",
        "dampak_perilaku_count",
        "correction.count",
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
        "nkp_awal_sangat_istimewa_count",
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
        for field in ("nkp_awal_status_counts", "nkp_akhir_status_counts")
        for status in STATUS_LABELS
    )
    count_paths.update(
        f"{field}.{status}"
        for field in ("nkp_awal_status_counts", "nkp_akhir_status_counts")
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
    return (dataset.id, dataset.period, dataset.row_count, dataset.uploaded_at)


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
    eselons: tuple[str, ...],
) -> list[PerformanceKinerjaRecord]:
    return [
        record
        for record, unit, eselon, _, _ in cache.resolved_records
        if (unit_eselon_ii is None or unit == unit_eselon_ii)
        and (not eselons or eselon in eselons)
    ]


def _cached_filtered_overview(
    cache: _PerformanceDashboardCache,
    filter_key: tuple[str | None, tuple[str, ...]],
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
    filter_key = (unit_eselon_ii, selected_eselons)
    filtered_records = _dashboard_filtered_records(
        cache,
        unit_eselon_ii,
        selected_eselons,
    )
    overview = _cached_filtered_overview(cache, filter_key, filtered_records)
    overview_previous = None
    overview_comparison = {}
    if previous_cache is not None:
        previous_records = _dashboard_filtered_records(
            previous_cache,
            unit_eselon_ii,
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
        "unit_eselon_ii_options": cache.unit_options,
        "eselon_options": cache.eselon_options,
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
    result_records = _query_performance_records(
        db,
        dataset,
        search=search,
        filters=filters,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return {
        "period": dataset.period,
        "page": page,
        "page_size": page_size,
        "total": len(result_records),
        "records": result_records[(page - 1) * page_size : page * page_size],
        "filter_options": cache.record_filter_options,
        "numeric_ranges": cache.record_numeric_ranges,
    }


def _record_filter_options(
    cache: _PerformanceDashboardCache,
) -> dict[str, list[str]]:
    options = {field: set() for field in RECORD_FILTER_OPTION_FIELDS}
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
        for field in RECORD_FILTER_OPTION_FIELDS:
            value = values[field]
            if value is not None and str(value).strip():
                options[field].add(str(value))
    return {
        field: sorted(values, key=str.casefold)
        for field, values in options.items()
    }


def _record_numeric_ranges(
    cache: _PerformanceDashboardCache,
) -> dict[str, tuple[float | None, float | None]]:
    numeric_fields = tuple(field for field, _ in RECORD_EXPORT_COLUMNS if field in {
        "nhk",
        "npk",
        "nhk_kalibrasi",
        "npk_kalibrasi",
        "nkp_awal",
        "nilai_hukuman_disiplin",
        "nilai_dampak_pelanggaran_disiplin",
        "nilai_dampak_perilaku",
        "nilai_koreksi",
        "nko",
        "nkp_akhir",
    })
    values_by_field: dict[str, list[float]] = {field: [] for field in numeric_fields}
    for record, _, _, _, _ in cache.resolved_records:
        for field in numeric_fields:
            value = getattr(record, field)
            if value is not None:
                values_by_field[field].append(float(value))
    return {
        field: (
            (min(values), max(values))
            if values
            else (None, None)
        )
        for field, values in values_by_field.items()
    }

def _performance_record_data(
    record: PerformanceKinerjaRecord,
    employee: dict[str, str],
) -> dict[str, Any]:
    return {
        "nama": record.nama,
        "nip": record.nip,
        "unit_eselon_ii": (
            employee.get("unit_eselon_ii", "").strip()
            or record.unit_eselon_ii
            or UNIDENTIFIED
        ),
        "unit_eselon_iii": (
            employee.get("unit_eselon_iii", "").strip()
            or record.unit_eselon_iii
            or UNIDENTIFIED
        ),
        "unit_eselon_iv": (
            employee.get("unit_eselon_iv", "").strip()
            or record.unit_eselon_iv
            or UNIDENTIFIED
        ),
        "eselon": employee.get("eselon", "").strip() or record.eselon or UNIDENTIFIED,
        "nhk": _format_decimal(record.nhk),
        "npk": _format_decimal(record.npk),
        "nhk_kalibrasi": _format_decimal(record.nhk_kalibrasi),
        "npk_kalibrasi": _format_decimal(record.npk_kalibrasi),
        "nkp_awal": _format_decimal(record.nkp_awal),
        "rating_hasil_kerja_awal": record.rating_hasil_kerja_awal,
        "rating_perilaku_kerja_awal": record.rating_perilaku_kerja_awal,
        "predikat_kinerja_awal": record.predikat_kinerja_awal,
        "nilai_hukuman_disiplin": _format_decimal(record.nilai_hukuman_disiplin),
        "nilai_dampak_pelanggaran_disiplin": _format_decimal(
            record.nilai_dampak_pelanggaran_disiplin
        ),
        "nilai_dampak_perilaku": _format_decimal(record.nilai_dampak_perilaku),
        "nilai_koreksi": _format_decimal(record.nilai_koreksi),
        "nko": _format_decimal(record.nko),
        "nkp_akhir": _format_decimal(record.nkp_akhir),
        "rating_hasil_kerja": record.rating_hasil_kerja,
        "rating_perilaku_kerja": record.rating_perilaku_kerja,
        "predikat_kinerja": record.predikat_kinerja,
        "status": get_status(record.nkp_akhir),
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
        if normalized_search and (
            normalized_search not in values["nama"].casefold()
            and normalized_search not in values["nip"].casefold()
        ):
            continue
        is_filtered_out = False
        for key, expected in normalized_filters.items():
            if key.endswith("__min") or key.endswith("__max"):
                field, bound = key.rsplit("__", maxsplit=1)
                value = values[field]
                if value is None:
                    is_filtered_out = True
                    break
                numeric_value = float(value)
                numeric_bound = float(expected)
                if (bound == "min" and numeric_value < numeric_bound) or (
                    bound == "max" and numeric_value > numeric_bound
                ):
                    is_filtered_out = True
                    break
            elif values[key] is None:
                is_filtered_out = True
                break
            elif key in RECORD_FILTER_OPTION_FIELDS:
                if str(values[key]).casefold() != expected:
                    is_filtered_out = True
                    break
            elif expected not in str(values[key]).casefold():
                is_filtered_out = True
                break
        if is_filtered_out:
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
        for field in _NUMERIC_FIELDS.values()
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


def _excel_safe_value(value: Any) -> Any:
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@", "\t", "\r")):
        return f"'{value}"
    return value


def _style_export_header(worksheet) -> None:
    worksheet.freeze_panes = "A2"
    worksheet.auto_filter.ref = worksheet.dimensions
    for cell in worksheet[1]:
        cell.font = Font(bold=True)
    for index, cell in enumerate(worksheet[1], start=1):
        worksheet.column_dimensions[get_column_letter(index)].width = min(
            max(len(str(cell.value)) + 2, 14),
            38,
        )


def create_unit_analysis_workbook(
    db: Session,
    period: str | None = None,
) -> bytes:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Unit Eselon II"
    worksheet.append(UNIT_EXPORT_HEADERS)

    dataset = _select_dataset(_performance_datasets(db), period)
    if dataset is not None:
        cache = _get_dashboard_cache(db, dataset)
        for unit in cache.units:
            worksheet.append(
                [_excel_safe_value(value) for value in _unit_export_values(unit)]
            )
            for child in unit["children"]:
                worksheet.append(
                    [
                        _excel_safe_value(value)
                        for value in _unit_export_values(child, unit["label"])
                    ]
                )
                worksheet.row_dimensions[worksheet.max_row].outlineLevel = 1
                for grandchild in child["children"]:
                    worksheet.append(
                        [
                            _excel_safe_value(value)
                            for value in _unit_export_values(
                                grandchild,
                                unit["label"],
                                child["label"],
                            )
                        ]
                    )
                    worksheet.row_dimensions[worksheet.max_row].outlineLevel = 2

    _style_export_header(worksheet)
    stream = BytesIO()
    workbook.save(stream)
    workbook.close()
    return stream.getvalue()


def _unit_export_values(
    metrics: dict[str, Any],
    unit_ii_label: str | None = None,
    unit_iii_label: str | None = None,
) -> tuple[Any, ...]:
    correction = metrics["correction"]
    return (
        unit_ii_label or metrics["label"],
        unit_iii_label or (metrics["label"] if unit_ii_label else ""),
        metrics["label"] if unit_iii_label else "",
        metrics["employee_count"],
        metrics["average_npk"],
        metrics["average_nhk"],
        metrics["average_nkp_awal"],
        metrics["nkp_awal_sangat_istimewa_count"],
        metrics["nkp_awal_sangat_istimewa_percentage"],
        metrics["hukdis_count"],
        metrics["dampak_pelanggaran_count"],
        metrics["dampak_perilaku_count"],
        correction["count"],
        correction["positive_count"],
        correction["negative_count"],
        correction["average"],
        correction["maximum"],
        correction["minimum"],
        metrics["average_nkp_akhir"],
        metrics["nkp_akhir_sangat_istimewa_count"],
        metrics["nkp_akhir_sangat_istimewa_percentage"],
        metrics["status_gap_count"],
    )


def create_performance_records_workbook(
    db: Session,
    search: str = "",
    filters: dict[str, str] | None = None,
    sort_by: str = "nama",
    sort_order: str = "asc",
    period: str | None = None,
) -> bytes:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Daftar Pegawai"
    worksheet.append([label for _, label in RECORD_EXPORT_COLUMNS])

    dataset = _select_dataset(_performance_datasets(db), period)
    if dataset is not None:
        records = _query_performance_records(
            db,
            dataset,
            search=search,
            filters=filters,
            sort_by=sort_by,
            sort_order=sort_order,
        )
        for values in records:
            worksheet.append(
                [
                    _excel_safe_value(values[key])
                    for key, _ in RECORD_EXPORT_COLUMNS
                ]
            )
            worksheet.cell(worksheet.max_row, 2).number_format = "@"
    else:
        _validate_record_query(filters, sort_by, sort_order)

    _style_export_header(worksheet)
    stream = BytesIO()
    workbook.save(stream)
    workbook.close()
    return stream.getvalue()
