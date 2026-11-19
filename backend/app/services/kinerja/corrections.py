"""Corrections for Kinerja performance workflows."""

import re
from collections import defaultdict
from datetime import datetime, timezone
from decimal import InvalidOperation, Decimal
from io import BytesIO
from typing import Any
from xml.etree.ElementTree import ParseError
from zipfile import BadZipFile
from openpyxl import load_workbook, Workbook
from openpyxl.styles import Font
from openpyxl.utils.exceptions import InvalidFileException
from sqlalchemy import func, select, delete
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.models.performance_kinerja import (
    PerformanceKinerjaDataset,
    PerformanceKinerjaRecord,
    PerformanceCorrectionEditLog,
)
from app.repositories.epride_performance_repository import (
    fetch_submitted_correction_rows,
    fetch_available_source_periods as fetch_epride_available_source_periods,
)
from .cache import invalidate_dashboard_cache
from .common import (
    CORRECTION_BATCH_HEADERS,
    CORRECTION_SCALE,
    MANUAL_CORRECTION_LIMIT,
    MAX_ADJUSTMENT,
    MAX_CORRECTION_BATCH_ROWS,
    PerformanceCorrectionConflictError,
    PerformanceCorrectionNotFoundError,
    ZERO,
    _format_decimal,
    calculate_nkp_akhir,
    get_status,
    normalize_nip,
    validate_period,
)

def create_correction_batch_template() -> bytes:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Koreksi"
    worksheet.append(CORRECTION_BATCH_HEADERS)
    worksheet.freeze_panes = "A2"
    worksheet.auto_filter.ref = "A1:B1"
    worksheet.column_dimensions["A"].width = 24
    worksheet.column_dimensions["B"].width = 20
    for cell in worksheet[1]:
        cell.font = Font(bold=True)
    for row in range(2, MAX_CORRECTION_BATCH_ROWS + 2):
        worksheet.cell(row=row, column=1).number_format = "@"

    output = BytesIO()
    workbook.save(output)
    workbook.close()
    return output.getvalue()

def _read_correction_batch_workbook(content: bytes) -> list[tuple[str, Decimal]]:
    try:
        workbook = load_workbook(BytesIO(content), read_only=True, data_only=True)
    except (
        BadZipFile,
        InvalidFileException,
        KeyError,
        OSError,
        ParseError,
        ValueError,
    ) as exc:
        raise ValueError("The uploaded file is not a valid .xlsx correction template.") from exc

    try:
        worksheet = workbook.active
        if worksheet is None:
            raise ValueError("The correction workbook must contain a worksheet.")
        if worksheet.max_column != len(CORRECTION_BATCH_HEADERS):
            raise ValueError("The correction workbook must contain exactly two columns.")
        if worksheet.max_row is None or worksheet.max_row < 1:
            raise ValueError("The correction workbook is empty.")
        if worksheet.max_row > MAX_CORRECTION_BATCH_ROWS + 1:
            raise ValueError(
                f"The correction workbook may contain at most {MAX_CORRECTION_BATCH_ROWS} data rows."
            )

        headers = tuple(
            str(value or "").strip().lower()
            for value in next(worksheet.iter_rows(min_row=1, max_row=1, values_only=True))
        )
        if headers != CORRECTION_BATCH_HEADERS:
            raise ValueError(
                "The first row must contain exactly these headers: nip, nilai_koreksi."
            )

        corrections: list[tuple[str, Decimal]] = []
        seen_nips: set[str] = set()
        errors: list[str] = []
        for row_number, values in enumerate(
            worksheet.iter_rows(min_row=2, max_col=2, values_only=True),
            start=2,
        ):
            raw_nip, raw_correction = values
            nip_is_blank = raw_nip is None or (
                isinstance(raw_nip, str) and not raw_nip.strip()
            )
            correction_is_blank = raw_correction is None or (
                isinstance(raw_correction, str) and not raw_correction.strip()
            )
            if nip_is_blank and correction_is_blank:
                continue

            nip = normalize_nip(raw_nip) if isinstance(raw_nip, str) else None
            if nip is None:
                errors.append(f"Row {row_number}: NIP must be text with 16 or 18 digits.")
                continue
            if nip in seen_nips:
                errors.append(f"Row {row_number}: duplicate NIP {nip}.")
                continue
            seen_nips.add(nip)

            if isinstance(raw_correction, bool) or raw_correction is None:
                errors.append(f"Row {row_number}, NIP {nip}: nilai_koreksi must be a number.")
                continue
            correction_text = str(raw_correction).strip()
            if isinstance(raw_correction, str):
                if correction_text.count(",") > 1 or (
                    "," in correction_text and "." in correction_text
                ):
                    errors.append(
                        f"Row {row_number}, NIP {nip}: nilai_koreksi has an invalid number format."
                    )
                    continue
                correction_text = correction_text.replace(",", ".")
            try:
                correction = Decimal(correction_text)
            except (InvalidOperation, ValueError):
                errors.append(f"Row {row_number}, NIP {nip}: nilai_koreksi must be a number.")
                continue
            if not correction.is_finite() or not (
                -MANUAL_CORRECTION_LIMIT <= correction <= MANUAL_CORRECTION_LIMIT
            ):
                errors.append(
                    f"Row {row_number}, NIP {nip}: nilai_koreksi must be between -5 and 5, inclusive."
                )
                continue
            try:
                correction_has_supported_precision = (
                    correction == correction.quantize(CORRECTION_SCALE)
                )
            except InvalidOperation:
                correction_has_supported_precision = False
            if not correction_has_supported_precision:
                errors.append(
                    f"Row {row_number}, NIP {nip}: nilai_koreksi supports at most 8 decimal places."
                )
                continue
            corrections.append((nip, correction))

        if errors:
            shown_errors = errors[:20]
            remaining_error_count = len(errors) - len(shown_errors)
            detail = "\n".join(shown_errors)
            if remaining_error_count:
                detail += f"\nAnd {remaining_error_count} more row errors."
            raise ValueError(f"Correction workbook validation failed:\n{detail}")
        if not corrections:
            raise ValueError("The correction workbook contains no data rows.")
        return corrections
    finally:
        workbook.close()

def _prepare_epride_corrections(
    rows: list[dict[str, object]],
    source_year: int,
    source_tw: int,
) -> dict[str, Any]:
    grouped: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    ignored_unit_row_count = 0
    out_of_range_row_count = 0

    for row in rows:
        unit_id = str(row.get("id_unit") or "").strip()
        if not re.fullmatch(r"[0-9]{13}", unit_id):
            ignored_unit_row_count += 1
            continue

        nip = normalize_nip(row.get("nip"))
        if nip is None:
            raise ValueError("An eligible EPRIDE correction row has an invalid NIP.")

        raw_value = row.get("nilai_koreksi")
        try:
            value = ZERO if raw_value is None else Decimal(str(raw_value).strip())
        except (InvalidOperation, ValueError) as exc:
            raise ValueError("An eligible EPRIDE correction is not a valid number.") from exc
        if not value.is_finite():
            raise ValueError("An eligible EPRIDE correction must be finite.")
        if not -MAX_ADJUSTMENT <= value <= MAX_ADJUSTMENT:
            out_of_range_row_count += 1
        submitted_at = row.get("submitted_at")
        if hasattr(submitted_at, "isoformat"):
            submitted_at = submitted_at.isoformat()
        grouped[nip].append(
            {
                "value": value,
                "form_id": str(row["form_id"]) if row.get("form_id") is not None else "",
                "id_unit": unit_id,
                "submitted_at": str(submitted_at) if submitted_at is not None else None,
            }
        )

    if out_of_range_row_count:
        raise ValueError(
            f"{out_of_range_row_count} EPRIDE corrections are outside -20 to 20; "
            "no data was changed."
        )
    if not grouped:
        raise ValueError(
            "No submitted EPRIDE corrections with a 13-digit idUnit were found for "
            f"{source_year} TW{source_tw}."
        )

    corrections: dict[str, Decimal] = {}
    duplicate_nip_group_count = 0
    conflicts: list[dict[str, Any]] = []
    for nip, source_rows in grouped.items():
        if len(source_rows) > 1:
            duplicate_nip_group_count += 1
        nonzero_values = sorted({
            row["value"] for row in source_rows if row["value"] != ZERO
        })
        if len(nonzero_values) > 1:
            candidates_by_value: defaultdict[Decimal, list[dict[str, str | None]]] = defaultdict(list)
            for row in source_rows:
                value = row["value"]
                if value == ZERO:
                    continue
                source_detail = {
                    "form_id": row["form_id"],
                    "id_unit": row["id_unit"],
                    "submitted_at": row["submitted_at"],
                }
                if source_detail not in candidates_by_value[value]:
                    candidates_by_value[value].append(source_detail)
            conflicts.append(
                {
                    "nip": nip,
                    "candidates": [
                        {
                            "value": str(value),
                            "sources": candidates_by_value[value],
                        }
                        for value in nonzero_values
                    ],
                }
            )
            continue
        corrections[nip] = next(iter(nonzero_values), ZERO)

    return {
        "corrections": corrections,
        "conflicts": conflicts,
        "source_row_count": sum(len(source_rows) for source_rows in grouped.values()),
        "source_nip_count": len(grouped),
        "duplicate_nip_group_count": duplicate_nip_group_count,
        "ignored_unit_row_count": ignored_unit_row_count,
    }

def get_available_epride_source_periods() -> list[dict[str, Any]]:
    source_periods = fetch_epride_available_source_periods()
    available_tw_by_year: defaultdict[int, set[int]] = defaultdict(set)
    for source_period in source_periods:
        try:
            source_year = int(source_period["year"])
            source_tw = int(source_period["tw"])
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError("EPRIDE returned an invalid source year or TW.") from exc
        if not 2000 <= source_year <= 2100 or source_tw not in {1, 2, 3, 4}:
            raise RuntimeError("EPRIDE returned an unsupported source year or TW.")
        available_tw_by_year[source_year].add(source_tw)

    return [
        {"year": source_year, "available_tw": sorted(available_tw)}
        for source_year, available_tw in sorted(available_tw_by_year.items(), reverse=True)
    ]

def _load_epride_correction_sync_data(
    db: Session,
    period: str,
    source_year: int,
    source_tw: int,
) -> dict[str, Any]:
    normalized_period = validate_period(period)
    if not 2000 <= source_year <= 2100:
        raise ValueError("EPRIDE source year must be between 2000 and 2100.")
    if source_tw not in {1, 2, 3, 4}:
        raise ValueError("EPRIDE source TW must be between 1 and 4.")

    dataset = db.scalar(
        select(PerformanceKinerjaDataset).where(
            PerformanceKinerjaDataset.period == normalized_period
        )
    )
    if dataset is None:
        raise ValueError(f"There is no performance dataset for {normalized_period} to sync.")

    records = db.scalars(
        select(PerformanceKinerjaRecord).where(
            PerformanceKinerjaRecord.dataset_id == dataset.id
        )
    ).all()
    if not records:
        raise ValueError(f"The performance dataset for {normalized_period} has no employee records.")

    source_rows = fetch_submitted_correction_rows(
        year=source_year,
        quarter=source_tw,
    )
    source = _prepare_epride_corrections(source_rows, source_year, source_tw)
    corrections = source["corrections"]
    dataset_nips = {record.nip for record in records}
    source_nips = set(corrections) | {conflict["nip"] for conflict in source["conflicts"]}
    matched_count = len(dataset_nips & source_nips)
    summary = {
        "period": normalized_period,
        "source_year": source_year,
        "source_tw": source_tw,
        "row_count": len(records),
        "source_row_count": source["source_row_count"],
        "source_nip_count": source["source_nip_count"],
        "matched_count": matched_count,
        "unmatched_count": len(records) - matched_count,
        "duplicate_nip_group_count": source["duplicate_nip_group_count"],
        "ignored_unit_row_count": source["ignored_unit_row_count"],
        "source_only_nip_count": len(source_nips - dataset_nips),
    }
    return {
        "records": records,
        "source": source,
        "summary": summary,
        "preview": {**summary, "conflicts": source["conflicts"]},
    }

def check_adjustments_from_epride(
    db: Session,
    period: str,
    source_year: int,
    source_tw: int,
) -> dict[str, Any]:
    return _load_epride_correction_sync_data(db, period, source_year, source_tw)["preview"]

def _resolve_epride_correction_conflicts(
    source: dict[str, Any],
    resolutions: dict[str, str],
) -> dict[str, Decimal]:
    conflict_candidates = {
        conflict["nip"]: {
            Decimal(candidate["value"])
            for candidate in conflict["candidates"]
        }
        for conflict in source["conflicts"]
    }
    if set(resolutions) != set(conflict_candidates):
        raise ValueError(
            "Choose exactly one EPRIDE correction for every conflicting NIP, then recheck before syncing."
        )

    corrections = dict(source["corrections"])
    for nip, raw_value in resolutions.items():
        try:
            value = Decimal(raw_value)
        except (InvalidOperation, ValueError) as exc:
            raise ValueError("A conflict choice is not a valid correction value.") from exc
        if value not in conflict_candidates[nip]:
            raise ValueError(
                "A conflict choice no longer matches the EPRIDE source; check the source again."
            )
        corrections[nip] = value
    return corrections

def sync_adjustments_from_epride(
    db: Session,
    period: str,
    source_year: int,
    source_tw: int,
    conflict_resolutions: dict[str, str],
) -> dict[str, Any]:
    sync_data = _load_epride_correction_sync_data(
        db,
        period,
        source_year,
        source_tw,
    )
    records = sync_data["records"]
    source = sync_data["source"]
    corrections = _resolve_epride_correction_conflicts(source, conflict_resolutions)
    updates = [
        (
            record,
            corrections.get(record.nip, ZERO),
            calculate_nkp_akhir(
                record.nkp_awal,
                record.nko,
                record.nilai_hukuman_disiplin,
                record.nilai_dampak_pelanggaran_disiplin,
                corrections.get(record.nip, ZERO),
            ),
        )
        for record in records
    ]

    try:
        for record, correction, final_score in updates:
            record.nilai_koreksi = correction
            record.nkp_akhir = final_score
        db.execute(delete(PerformanceCorrectionEditLog))
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise

    invalidate_dashboard_cache()
    return {
        **sync_data["summary"],
        "conflicts": [],
        "resolved_conflict_count": len(source["conflicts"]),
    }

def update_manual_correction(
    db: Session,
    period: str,
    nip: str,
    nilai_koreksi: Decimal,
    edited_by_user: str,
    edited_by_name: str,
) -> dict[str, Any]:
    normalized_period = validate_period(period)
    normalized_nip = normalize_nip(nip)
    if normalized_nip is None:
        raise ValueError("NIP must contain 16 or 18 digits.")
    if not nilai_koreksi.is_finite() or not (
        -MANUAL_CORRECTION_LIMIT <= nilai_koreksi <= MANUAL_CORRECTION_LIMIT
    ):
        raise ValueError("Manual Nilai Koreksi must be between -5 and 5, inclusive.")
    if nilai_koreksi != nilai_koreksi.quantize(CORRECTION_SCALE):
        raise ValueError("Manual Nilai Koreksi supports at most 8 decimal places.")

    dataset = db.scalar(
        select(PerformanceKinerjaDataset)
        .where(PerformanceKinerjaDataset.period == normalized_period)
        .with_for_update()
    )
    if dataset is None:
        raise PerformanceCorrectionNotFoundError(
            f"No performance dataset is stored for {normalized_period}."
        )
    record = db.scalar(
        select(PerformanceKinerjaRecord)
        .where(
            PerformanceKinerjaRecord.dataset_id == dataset.id,
            PerformanceKinerjaRecord.nip == normalized_nip,
        )
        .with_for_update()
    )
    if record is None:
        raise PerformanceCorrectionNotFoundError(
            f"No performance record is stored for NIP {normalized_nip} in {normalized_period}."
        )

    if record.nilai_koreksi == nilai_koreksi:
        return {
            "period": normalized_period,
            "nip": normalized_nip,
            "nilai_koreksi": _format_decimal(record.nilai_koreksi),
            "nkp_akhir": _format_decimal(record.nkp_akhir),
            "status": get_status(record.nkp_akhir),
            "changed": False,
        }

    previous_value = record.nilai_koreksi
    record.nilai_koreksi = nilai_koreksi
    record.nkp_akhir = calculate_nkp_akhir(
        record.nkp_awal,
        record.nko,
        record.nilai_hukuman_disiplin,
        record.nilai_dampak_pelanggaran_disiplin,
        nilai_koreksi,
    )
    db.add(
        PerformanceCorrectionEditLog(
            period=normalized_period,
            nip=normalized_nip,
            employee_name=record.nama,
            old_value=previous_value,
            new_value=nilai_koreksi,
            edited_by_user=edited_by_user,
            edited_by_name=edited_by_name,
            edited_at=datetime.now(timezone.utc),
        )
    )
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise

    invalidate_dashboard_cache()
    return {
        "period": normalized_period,
        "nip": normalized_nip,
        "nilai_koreksi": _format_decimal(record.nilai_koreksi),
        "nkp_akhir": _format_decimal(record.nkp_akhir),
        "status": get_status(record.nkp_akhir),
        "changed": True,
    }

def update_manual_corrections_from_excel(
    db: Session,
    content: bytes,
    period: str,
    edited_by_user: str,
    edited_by_name: str,
) -> dict[str, Any]:
    normalized_period = validate_period(period)
    corrections = _read_correction_batch_workbook(content)
    dataset = db.scalar(
        select(PerformanceKinerjaDataset)
        .where(PerformanceKinerjaDataset.period == normalized_period)
        .with_for_update()
    )
    if dataset is None:
        raise PerformanceCorrectionNotFoundError(
            f"No performance dataset is stored for {normalized_period}."
        )

    records_by_nip: dict[str, PerformanceKinerjaRecord] = {}
    nips = [nip for nip, _ in corrections]
    try:
        for start in range(0, len(nips), 500):
            nip_batch = nips[start : start + 500]
            records = db.scalars(
                select(PerformanceKinerjaRecord)
                .where(
                    PerformanceKinerjaRecord.dataset_id == dataset.id,
                    PerformanceKinerjaRecord.nip.in_(nip_batch),
                )
                .with_for_update()
            ).all()
            records_by_nip.update({record.nip: record for record in records})
    except SQLAlchemyError:
        db.rollback()
        raise

    missing_nips = [nip for nip in nips if nip not in records_by_nip]
    if missing_nips:
        shown_nips = ", ".join(missing_nips[:20])
        remaining_count = len(missing_nips) - 20
        if remaining_count > 0:
            shown_nips += f", and {remaining_count} more"
        raise ValueError(
            f"These NIPs were not found in {normalized_period}: {shown_nips}."
        )

    edited_at = datetime.now(timezone.utc)
    edit_logs: list[PerformanceCorrectionEditLog] = []
    unchanged_count = 0
    for nip, correction in corrections:
        record = records_by_nip[nip]
        if record.nilai_koreksi == correction:
            unchanged_count += 1
            continue

        previous_value = record.nilai_koreksi
        record.nilai_koreksi = correction
        record.nkp_akhir = calculate_nkp_akhir(
            record.nkp_awal,
            record.nko,
            record.nilai_hukuman_disiplin,
            record.nilai_dampak_pelanggaran_disiplin,
            correction,
        )
        edit_logs.append(
            PerformanceCorrectionEditLog(
                period=normalized_period,
                nip=nip,
                employee_name=record.nama,
                old_value=previous_value,
                new_value=correction,
                edited_by_user=edited_by_user,
                edited_by_name=edited_by_name,
                edited_at=edited_at,
            )
        )

    try:
        if edit_logs:
            db.add_all(edit_logs)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise

    if edit_logs:
        invalidate_dashboard_cache()
    return {
        "period": normalized_period,
        "input_count": len(corrections),
        "updated_count": len(edit_logs),
        "unchanged_count": unchanged_count,
    }

def get_correction_edit_logs(
    db: Session,
    page: int = 1,
    page_size: int = 50,
    period: str | None = None,
) -> dict[str, Any]:
    if page < 1:
        raise ValueError("Page must be greater than or equal to 1.")
    if page_size < 1 or page_size > 200:
        raise ValueError("Page size must be between 1 and 200.")

    statement = select(PerformanceCorrectionEditLog)
    if period is not None:
        normalized_period = validate_period(period)
        statement = statement.where(PerformanceCorrectionEditLog.period == normalized_period)
    total = db.scalar(
        select(func.count()).select_from(statement.subquery())
    ) or 0
    logs = db.scalars(
        statement
        .order_by(
            PerformanceCorrectionEditLog.edited_at.desc(),
            PerformanceCorrectionEditLog.id.desc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "records": [
            {
                "id": log.id,
                "period": log.period,
                "nip": log.nip,
                "employee_name": log.employee_name,
                "old_value": float(log.old_value) if log.old_value is not None else None,
                "new_value": float(log.new_value),
                "edited_by_user": log.edited_by_user,
                "edited_by_name": log.edited_by_name,
                "edited_at": log.edited_at,
            }
            for log in logs
        ],
    }

def undo_manual_correction(
    db: Session,
    log_id: int,
) -> dict[str, Any]:
    selected_log = db.scalar(
        select(PerformanceCorrectionEditLog)
        .where(PerformanceCorrectionEditLog.id == log_id)
        .with_for_update()
    )
    if selected_log is None:
        raise PerformanceCorrectionNotFoundError(
            "The selected correction edit log no longer exists."
        )

    dataset = db.scalar(
        select(PerformanceKinerjaDataset)
        .where(PerformanceKinerjaDataset.period == selected_log.period)
        .with_for_update()
    )
    if dataset is None:
        raise PerformanceCorrectionNotFoundError(
            f"No performance dataset is stored for {selected_log.period}."
        )
    record = db.scalar(
        select(PerformanceKinerjaRecord)
        .where(
            PerformanceKinerjaRecord.dataset_id == dataset.id,
            PerformanceKinerjaRecord.nip == selected_log.nip,
        )
        .with_for_update()
    )
    if record is None:
        raise PerformanceCorrectionNotFoundError(
            f"No performance record is stored for NIP {selected_log.nip} in {selected_log.period}."
        )

    related_logs = db.scalars(
        select(PerformanceCorrectionEditLog)
        .where(
            PerformanceCorrectionEditLog.period == selected_log.period,
            PerformanceCorrectionEditLog.nip == selected_log.nip,
            PerformanceCorrectionEditLog.id >= selected_log.id,
        )
        .order_by(PerformanceCorrectionEditLog.id.asc())
        .with_for_update()
    ).all()
    if not related_logs or record.nilai_koreksi != related_logs[-1].new_value:
        raise PerformanceCorrectionConflictError(
            "The current correction no longer matches this edit history. Refresh the log and try again."
        )

    record.nilai_koreksi = selected_log.old_value
    record.nkp_akhir = calculate_nkp_akhir(
        record.nkp_awal,
        record.nko,
        record.nilai_hukuman_disiplin,
        record.nilai_dampak_pelanggaran_disiplin,
        selected_log.old_value,
    )
    result = {
        "period": selected_log.period,
        "nip": selected_log.nip,
        "nilai_koreksi": _format_decimal(selected_log.old_value),
        "nkp_akhir": _format_decimal(record.nkp_akhir),
        "status": get_status(record.nkp_akhir),
        "changed": True,
    }
    db.execute(
        delete(PerformanceCorrectionEditLog).where(
            PerformanceCorrectionEditLog.period == selected_log.period,
            PerformanceCorrectionEditLog.nip == selected_log.nip,
            PerformanceCorrectionEditLog.id >= selected_log.id,
        )
    )
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise

    invalidate_dashboard_cache()
    return result
