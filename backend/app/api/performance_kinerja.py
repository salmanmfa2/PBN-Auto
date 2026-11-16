import json
from io import BytesIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.auth import get_admin_user, get_super_admin
from app.history_db import get_history_db
from app.models.auth import User
from app.schemas.performance_kinerja import (
    PerformanceAnalysisResponse,
    PerformanceDashboardResponse,
    PerformanceInsightRead,
    PerformanceInsightUpdate,
    PerformanceRecordsResponse,
    PerformanceEmployeeSource,
    PerformanceUploadValidation,
)
from app.services import performance_kinerja_service as service


router = APIRouter(prefix="/performance", tags=["performance"])
MAX_UPLOAD_SIZE = 50 * 1024 * 1024


async def _read_upload(file: UploadFile, extension: str) -> bytes:
    filename = file.filename or ""
    if not filename.lower().endswith(extension):
        raise HTTPException(
            status_code=400,
            detail=f"Only {extension} files are supported for this upload.",
        )
    content = await file.read(MAX_UPLOAD_SIZE + 1)
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="The upload exceeds the 50 MB limit.")
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
        return service.get_analysis(db, group_by, period)
    except ValueError as exc:
        raise _validation_error(exc) from exc
    except (RuntimeError, SQLAlchemyError) as exc:
        raise _database_error("Could not load employee performance analysis.") from exc


@router.get("/dashboard", response_model=PerformanceDashboardResponse)
def get_performance_dashboard(
    unit_eselon_ii: str | None = None,
    eselon: list[str] = Query(default=[]),
    period: str | None = Query(default=None, max_length=7),
    db: Session = Depends(get_history_db),
):
    try:
        return service.get_dashboard(db, unit_eselon_ii, eselon, period)
    except ValueError as exc:
        raise _validation_error(exc) from exc
    except (RuntimeError, SQLAlchemyError) as exc:
        raise _database_error("Could not load employee performance dashboard.") from exc


@router.get("/insight", response_model=PerformanceInsightRead)
def get_performance_insight(db: Session = Depends(get_history_db)):
    try:
        return service.get_insight(db)
    except SQLAlchemyError as exc:
        raise _database_error("Could not load the performance insight text.") from exc


@router.put("/insight", response_model=PerformanceInsightRead)
def update_performance_insight(
    request: PerformanceInsightUpdate,
    user: User = Depends(get_admin_user),
    db: Session = Depends(get_history_db),
):
    try:
        return service.update_insight(
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
        return service.get_records(
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


@router.get("/exports/unit-eselon-ii")
def download_unit_analysis(
    period: str | None = Query(default=None, max_length=7),
    db: Session = Depends(get_history_db),
):
    try:
        content = service.create_unit_analysis_workbook(db, period)
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
        content = service.create_performance_records_workbook(
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
        return service.validate_full_upload(content, period, employee_source)
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
        return service.replace_full_upload(
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


@router.get("/adjustments/template")
def download_adjustment_template(_: User = Depends(get_super_admin)):
    content = service.create_adjustment_template()
    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="template-penyesuaian-kinerja.xlsx"'},
    )


@router.post("/adjustments/validate", response_model=PerformanceUploadValidation)
async def validate_performance_adjustments(
    file: UploadFile = File(...),
    period: str = Form(...),
    _: User = Depends(get_super_admin),
    db: Session = Depends(get_history_db),
):
    content = await _read_upload(file, ".xlsx")
    try:
        return service.validate_adjustment_upload(db, content, period)
    except ValueError as exc:
        raise _validation_error(exc) from exc
    except (RuntimeError, SQLAlchemyError) as exc:
        raise _database_error("Could not validate performance adjustments.") from exc


@router.post("/adjustments/replace", response_model=PerformanceUploadValidation)
async def replace_performance_adjustments(
    file: UploadFile = File(...),
    period: str = Form(...),
    _: User = Depends(get_super_admin),
    db: Session = Depends(get_history_db),
):
    content = await _read_upload(file, ".xlsx")
    try:
        return service.replace_adjustments(db, content, period)
    except ValueError as exc:
        raise _validation_error(exc) from exc
    except (RuntimeError, SQLAlchemyError) as exc:
        raise _database_error("Could not apply performance adjustments.") from exc
