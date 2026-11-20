import json
from io import BytesIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, get_super_admin
from app.api.menu_access import require_menu_access
from app.history_db import get_history_db
from app.models.auth import User
from app.schemas.performance_kinerja import (
    PerformanceAnalysisResponse,
    PerformanceDashboardResponse,
    PerformanceInsightRead,
    PerformanceInsightUpdate,
    PerformanceRecordsResponse,
    PerformanceEmployeeSource,
    PerformanceCorrectionSourceYear,
    PerformanceCorrectionSyncRequest,
    PerformanceCorrectionSyncPreview,
    PerformanceCorrectionSyncResult,
    PerformanceCorrectionEditRequest,
    PerformanceCorrectionEditResult,
    PerformanceCorrectionEditLogPage,
    PerformanceCorrectionBatchResult,
    PerformanceUploadValidation,
)
from app.services.kinerja import (
    common as kinerja_common,
    corrections as kinerja_corrections,
    dashboard as kinerja_dashboard,
    exports as kinerja_exports,
    records as kinerja_records,
    uploads as kinerja_uploads,
)


router = APIRouter(
    prefix="/performance",
    tags=["performance"],
    dependencies=[Depends(require_menu_access("analisis-kinerja"))],
)
MAX_UPLOAD_SIZE = 50 * 1024 * 1024
MAX_CORRECTION_BATCH_UPLOAD_SIZE = 5 * 1024 * 1024


async def _read_upload(
    file: UploadFile,
    extension: str,
    max_size: int = MAX_UPLOAD_SIZE,
) -> bytes:
    filename = file.filename or ""
    if not filename.lower().endswith(extension):
        raise HTTPException(
            status_code=400,
            detail=f"Only {extension} files are supported for this upload.",
        )
    content = await file.read(max_size + 1)
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(content) > max_size:
        max_size_mb = max_size // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"The upload exceeds the {max_size_mb} MB limit.",
        )
    return content


def _validation_error(error: ValueError) -> HTTPException:
    return HTTPException(status_code=422, detail=str(error))


def _database_error(message: str) -> HTTPException:
    return HTTPException(status_code=503, detail=message)


def _parse_record_filters(value: str) -> dict[str, str]:
    try:
        filters = json.loads(value)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="Invalid employee table filters.") from exc
    if not isinstance(filters, dict) or any(
        not isinstance(key, str) or not isinstance(filter_value, str)
        for key, filter_value in filters.items()
    ):
        raise HTTPException(status_code=422, detail="Employee table filters must be text values.")
    return filters


@router.get("/analysis", response_model=PerformanceAnalysisResponse)
def get_performance_analysis(
    group_by: str = "overall",
    period: str | None = Query(default=None, max_length=7),
    db: Session = Depends(get_history_db),
):
    try:
        return kinerja_records.get_analysis(db, group_by, period)
    except ValueError as exc:
        raise _validation_error(exc) from exc
    except (RuntimeError, SQLAlchemyError) as exc:
        raise _database_error("Could not load employee performance analysis.") from exc


@router.get("/dashboard", response_model=PerformanceDashboardResponse)
def get_performance_dashboard(
    unit_eselon_ii: str | None = None,
    unit_eselon_iii: str | None = None,
    unit_eselon_iv: str | None = None,
    eselon: list[str] = Query(default=[]),
    period: str | None = Query(default=None, max_length=7),
    db: Session = Depends(get_history_db),
):
    try:
        return kinerja_dashboard.get_dashboard(
            db,
            unit_eselon_ii,
            eselon,
            period,
            unit_eselon_iii=unit_eselon_iii,
            unit_eselon_iv=unit_eselon_iv,
        )
    except ValueError as exc:
        raise _validation_error(exc) from exc
    except (RuntimeError, SQLAlchemyError) as exc:
        raise _database_error("Could not load employee performance dashboard.") from exc


@router.get("/insight", response_model=PerformanceInsightRead)
def get_performance_insight(db: Session = Depends(get_history_db)):
    try:
        return kinerja_records.get_insight(db)
    except SQLAlchemyError as exc:
        raise _database_error("Could not load the performance insight text.") from exc


@router.put("/insight", response_model=PerformanceInsightRead)
def update_performance_insight(
    request: PerformanceInsightUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    try:
        return kinerja_records.update_insight(
            db,
            request.content,
            updated_by_user=user.user,
            updated_by_name=user.name,
        )
    except SQLAlchemyError as exc:
        raise _database_error("Could not save the performance insight text.") from exc


@router.get("/records", response_model=PerformanceRecordsResponse)
def get_performance_records(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    search: str = Query(default="", max_length=100),
    filters: str = Query(default="{}", max_length=4000),
    sort_by: str = Query(default="nama", max_length=80),
    sort_order: str = Query(default="asc", max_length=4),
    period: str | None = Query(default=None, max_length=7),
    db: Session = Depends(get_history_db),
):
    try:
        return kinerja_records.get_records(
            db,
            page,
            page_size,
            search,
            _parse_record_filters(filters),
            sort_by,
            sort_order,
            period,
        )
    except ValueError as exc:
        raise _validation_error(exc) from exc
    except (RuntimeError, SQLAlchemyError) as exc:
        raise _database_error("Could not load the performance data table.") from exc


@router.delete("/datasets/{period}", status_code=204)
def delete_performance_dataset_period(
    period: str,
    _: User = Depends(get_super_admin),
    db: Session = Depends(get_history_db),
):
    try:
        kinerja_common.delete_dataset_period(db, period)
    except kinerja_common.PerformanceDatasetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise _validation_error(exc) from exc
    except (RuntimeError, SQLAlchemyError) as exc:
        raise _database_error("Could not delete the performance dataset period.") from exc
    return Response(status_code=204)


@router.get("/corrections/batch-template")
def download_performance_correction_batch_template(
    _: User = Depends(get_current_user),
):
    content = kinerja_corrections.create_correction_batch_template()
    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="template-koreksi.xlsx"',
        },
    )


@router.post(
    "/corrections/batch",
    response_model=PerformanceCorrectionBatchResult,
)
async def batch_update_performance_corrections(
    file: UploadFile = File(...),
    period: str = Form(..., min_length=7, max_length=7),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    content = await _read_upload(
        file,
        ".xlsx",
        max_size=MAX_CORRECTION_BATCH_UPLOAD_SIZE,
    )
    try:
        return kinerja_corrections.update_manual_corrections_from_excel(
            db,
            content,
            period,
            edited_by_user=user.user,
            edited_by_name=user.name,
        )
    except kinerja_common.PerformanceCorrectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise _validation_error(exc) from exc
    except SQLAlchemyError as exc:
        raise _database_error("Could not apply the batch performance corrections.") from exc


@router.post(
    "/corrections/manual",
    response_model=PerformanceCorrectionEditResult,
)
def update_manual_performance_correction(
    request: PerformanceCorrectionEditRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    try:
        return kinerja_corrections.update_manual_correction(
            db,
            request.period,
            request.nip,
            request.nilai_koreksi,
            edited_by_user=user.user,
            edited_by_name=user.name,
        )
    except kinerja_common.PerformanceCorrectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise _validation_error(exc) from exc
    except SQLAlchemyError as exc:
        raise _database_error("Could not save the manual performance correction.") from exc


@router.get(
    "/corrections/edit-log",
    response_model=PerformanceCorrectionEditLogPage,
)
def get_performance_correction_edit_log(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    period: str | None = Query(default=None, max_length=7),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    try:
        return kinerja_corrections.get_correction_edit_logs(db, page, page_size, period)
    except ValueError as exc:
        raise _validation_error(exc) from exc
    except SQLAlchemyError as exc:
        raise _database_error("Could not load the correction edit log.") from exc


@router.post(
    "/corrections/edit-log/{log_id}/undo",
    response_model=PerformanceCorrectionEditResult,
)
def undo_performance_correction_edit(
    log_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    try:
        return kinerja_corrections.undo_manual_correction(db, log_id)
    except kinerja_common.PerformanceCorrectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except kinerja_common.PerformanceCorrectionConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        raise _database_error("Could not undo the manual performance correction.") from exc


@router.get("/exports/unit-eselon-ii")
def download_unit_analysis(
    period: str | None = Query(default=None, max_length=7),
    db: Session = Depends(get_history_db),
):
    try:
        content = kinerja_exports.create_unit_analysis_workbook(db, period)
    except ValueError as exc:
        raise _validation_error(exc) from exc
    except (RuntimeError, SQLAlchemyError) as exc:
        raise _database_error("Could not export the Unit Eselon II analysis.") from exc
    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="analisis-unit-eselon-ii.xlsx"'},
    )


@router.get("/exports/records")
def download_performance_records(
    search: str = Query(default="", max_length=100),
    filters: str = Query(default="{}", max_length=4000),
    sort_by: str = Query(default="nama", max_length=80),
    sort_order: str = Query(default="asc", max_length=4),
    period: str | None = Query(default=None, max_length=7),
    db: Session = Depends(get_history_db),
):
    try:
        content = kinerja_exports.create_performance_records_workbook(
            db,
            search,
            _parse_record_filters(filters),
            sort_by,
            sort_order,
            period,
        )
    except ValueError as exc:
        raise _validation_error(exc) from exc
    except (RuntimeError, SQLAlchemyError) as exc:
        raise _database_error("Could not export the employee performance data.") from exc
    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="daftar-pegawai-kinerja.xlsx"'},
    )


@router.post("/full-data/validate", response_model=PerformanceUploadValidation)
async def validate_full_performance_data(
    file: UploadFile = File(...),
    period: str = Form(...),
    employee_source: PerformanceEmployeeSource = Form(default="fetch_pbnopen"),
    _: User = Depends(get_super_admin),
):
    content = await _read_upload(file, ".csv")
    try:
        return kinerja_uploads.validate_full_upload(content, period, employee_source)
    except ValueError as exc:
        raise _validation_error(exc) from exc
    except (RuntimeError, SQLAlchemyError) as exc:
        raise _database_error(
            "Could not validate performance data against the employee source."
        ) from exc


@router.post("/full-data/replace", response_model=PerformanceUploadValidation)
async def replace_full_performance_data(
    file: UploadFile = File(...),
    period: str = Form(...),
    employee_source: PerformanceEmployeeSource = Form(default="fetch_pbnopen"),
    user: User = Depends(get_super_admin),
    db: Session = Depends(get_history_db),
):
    content = await _read_upload(file, ".csv")
    try:
        return kinerja_uploads.replace_full_upload(
            db,
            content,
            period,
            uploaded_by_user=user.user,
            uploaded_by_name=user.name,
            employee_source=employee_source,
        )
    except ValueError as exc:
        raise _validation_error(exc) from exc
    except (RuntimeError, SQLAlchemyError) as exc:
        raise _database_error("Could not replace the performance dataset for that period.") from exc


@router.get(
    "/adjustments/source-periods",
    response_model=list[PerformanceCorrectionSourceYear],
)
def get_performance_correction_source_periods(
    _: User = Depends(get_super_admin),
):
    try:
        return kinerja_corrections.get_available_epride_source_periods()
    except (RuntimeError, SQLAlchemyError) as exc:
        raise _database_error(
            "Could not load available EPRIDE source periods. Check its database configuration and connection."
        ) from exc


@router.post("/adjustments/sync", response_model=PerformanceCorrectionSyncResult)
def sync_performance_adjustments(
    request: PerformanceCorrectionSyncRequest,
    period: str = Query(..., min_length=7, max_length=7),
    source_year: int = Query(..., ge=2000, le=2100),
    source_tw: int = Query(..., ge=1, le=4),
    _: User = Depends(get_super_admin),
    db: Session = Depends(get_history_db),
):
    try:
        return kinerja_corrections.sync_adjustments_from_epride(
            db,
            period,
            source_year,
            source_tw,
            request.conflict_resolutions,
        )
    except ValueError as exc:
        raise _validation_error(exc) from exc
    except (RuntimeError, SQLAlchemyError) as exc:
        raise _database_error(
            "Could not sync performance corrections from EPRIDE. Check its database configuration and connection."
        ) from exc


@router.post("/adjustments/check", response_model=PerformanceCorrectionSyncPreview)
def check_performance_adjustments(
    period: str = Query(..., min_length=7, max_length=7),
    source_year: int = Query(..., ge=2000, le=2100),
    source_tw: int = Query(..., ge=1, le=4),
    _: User = Depends(get_super_admin),
    db: Session = Depends(get_history_db),
):
    try:
        return kinerja_corrections.check_adjustments_from_epride(
            db,
            period,
            source_year,
            source_tw,
        )
    except ValueError as exc:
        raise _validation_error(exc) from exc
    except (RuntimeError, SQLAlchemyError) as exc:
        raise _database_error(
            "Could not check EPRIDE corrections. Check its database configuration and connection."
        ) from exc
