"""Record data for Kinerja performance workflows."""

from dataclasses import field
from typing import Any
from app.models.performance_kinerja import PerformanceKinerjaRecord
from .cache import _PerformanceDashboardCache
from .common import (
    RECORD_EXPORT_COLUMNS,
    RECORD_FILTER_OPTION_FIELDS,
    UNIDENTIFIED,
    _format_decimal,
    get_status,
)

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
        "nkp_perhitungan",
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
        "nkp_perhitungan": _format_decimal(record.nkp_perhitungan),
        "status_nkp_perhitungan": record.status_nkp_perhitungan,
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
