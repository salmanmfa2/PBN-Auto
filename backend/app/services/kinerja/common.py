"""Common for Kinerja performance workflows."""

import re
from dataclasses import field
from datetime import timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any
from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.models.performance_kinerja import (
    PerformanceKinerjaRecord,
    PerformanceKinerjaDataset,
    PerformanceCorrectionEditLog,
)
from .cache import invalidate_dashboard_cache

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

PERIOD_PATTERN = re.compile(r"Q[1-4]-\d{4}")

MAX_NUMBER = Decimal("120")

MAX_ADJUSTMENT = Decimal("20")

ZERO = Decimal("0")

MANUAL_CORRECTION_LIMIT = Decimal("5")

CORRECTION_SCALE = Decimal("0.00000001")

CORRECTION_BATCH_HEADERS = ("nip", "nilai_koreksi")

MAX_CORRECTION_BATCH_ROWS = 5000

class PerformanceCorrectionNotFoundError(LookupError):
    pass

class PerformanceDatasetNotFoundError(LookupError):
    pass

class PerformanceCorrectionConflictError(RuntimeError):
    pass

TWO_PLACES = Decimal("0.01")

UNIDENTIFIED = "Unidentified"

EMPLOYEE_REFERENCE_TABLES = {
    "fetch_pbnopen": ("fetch_pbnopen", False, True),
    "dt_employee_q2_2026": ("dt_employee_q2_2026", True, False),
}

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
    "status_nkp_perhitungan",
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
    ("nkp_perhitungan", "NKP Perhitungan"),
    ("status_nkp_perhitungan", "Status NKP Perhitungan"),
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
    "NKP Perhitungan Sangat Istimewa",
    "Persentase NKP Perhitungan Sangat Istimewa",
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

def delete_dataset_period(db: Session, period: str) -> str:
    normalized_period = validate_period(period)
    try:
        dataset = db.scalar(
            select(PerformanceKinerjaDataset)
            .where(PerformanceKinerjaDataset.period == normalized_period)
            .with_for_update()
        )
        if dataset is None:
            raise PerformanceDatasetNotFoundError(
                f"No performance dataset is stored for {normalized_period}."
            )

        db.execute(
            delete(PerformanceCorrectionEditLog).where(
                PerformanceCorrectionEditLog.period == normalized_period
            )
        )
        db.execute(
            delete(PerformanceKinerjaRecord).where(
                PerformanceKinerjaRecord.dataset_id == dataset.id
            )
        )
        db.delete(dataset)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise

    invalidate_dashboard_cache()
    return normalized_period

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
    adjusted_nkp_awal = (
        nkp_awal
        - abs(nilai_hukuman_disiplin or ZERO)
        - abs(nilai_dampak_pelanggaran_disiplin or ZERO)
        + (nilai_koreksi or ZERO)
    )
    if adjusted_nkp_awal > nko:
        return (
            Decimal("0.70") * adjusted_nkp_awal
            + Decimal("0.30") * nko
        )
    return (
        Decimal("0.90") * adjusted_nkp_awal
        + Decimal("0.10") * nko
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

def _get_nkp_perhitungan_status(nkp_perhitungan: Decimal | None) -> str:
    if nkp_perhitungan is None:
        return "Tidak tersedia"
    displayed_score = nkp_perhitungan.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    return get_status(displayed_score)

def _calculate_nkp_perhitungan(
    nkp_awal: Decimal | None,
    nko: Decimal | None,
) -> Decimal | None:
    if nkp_awal is None or nko is None:
        return None
    if nkp_awal >= nko:
        return Decimal("0.70") * nkp_awal + Decimal("0.30") * nko
    return Decimal("0.90") * nkp_awal + Decimal("0.10") * nko

def _format_decimal(value: Decimal | None) -> float | None:
    if value is None:
        return None
    return float(value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP))
