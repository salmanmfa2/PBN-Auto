"""Exports for Kinerja performance workflows."""

from io import BytesIO
from typing import Any
from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session
from .common import (
    RECORD_EXPORT_COLUMNS,
    UNIT_EXPORT_HEADERS,
    _performance_datasets,
    _select_dataset,
)
from .dashboard import _get_dashboard_cache, _units_for_eselon
from .records import _query_performance_records, _validate_record_query

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
    unit_eselon: str | None = None,
) -> bytes:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Unit Eselon II"
    worksheet.append(UNIT_EXPORT_HEADERS)

    dataset = _select_dataset(_performance_datasets(db), period)
    if dataset is not None:
        cache = _get_dashboard_cache(db, dataset)
        for unit in _units_for_eselon(cache, unit_eselon):
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
        metrics["nkp_perhitungan_sangat_istimewa_count"],
        metrics["nkp_perhitungan_sangat_istimewa_percentage"],
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
        records, _ = _query_performance_records(
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
