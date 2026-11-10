from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.auth import get_admin_user
from app.history_db import get_history_db
from app.models.auth import User
from app.models.plt_plh import PltPlhMonitoringRecord
from app.schemas.plt_plh import (
    PltPlhRecordActiveUpdate,
    PltPlhRecordCreate,
    PltPlhRecordFields,
    PltPlhRecordRead,
    PltPlhRecordUpdate,
    PltPlhEmployeeOption,
)
from app.services import plt_plh_service


router = APIRouter(prefix="/plt-plh", tags=["Plt./Plh. management"])


def _read_record(record: PltPlhMonitoringRecord) -> PltPlhRecordRead:
    return plt_plh_service.record_to_read(record, date.today())


@router.get("/records", response_model=list[PltPlhRecordRead])
def get_records(history_db: Session = Depends(get_history_db)):
    return plt_plh_service.list_records(history_db)


@router.get("/notifications", response_model=list[PltPlhRecordRead])
def get_notifications(history_db: Session = Depends(get_history_db)):
    return plt_plh_service.list_notifications(history_db)


@router.get("/employees", response_model=list[PltPlhEmployeeOption])
def search_employees(
    q: str = Query(min_length=2, max_length=100),
    _: User = Depends(get_admin_user),
):
    try:
        return plt_plh_service.search_pbn_open_employees(q)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/records/export")
def export_records(history_db: Session = Depends(get_history_db)):
    workbook = plt_plh_service.export_records(history_db)
    return StreamingResponse(
        workbook,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="manajemen_plt_plh.xlsx"'},
    )


@router.post("/records", response_model=PltPlhRecordRead, status_code=201)
def create_record(
    request: PltPlhRecordCreate,
    _: User = Depends(get_admin_user),
    history_db: Session = Depends(get_history_db),
):
    record = plt_plh_service.create_record(history_db, PltPlhRecordFields(**request.model_dump()))
    return _read_record(record)


@router.put("/records/{record_id}", response_model=PltPlhRecordRead)
def update_record(
    record_id: int,
    request: PltPlhRecordUpdate,
    _: User = Depends(get_admin_user),
    history_db: Session = Depends(get_history_db),
):
    record = plt_plh_service.get_record(history_db, record_id)
    updated = plt_plh_service.update_record(
        history_db,
        record,
        PltPlhRecordFields(**request.model_dump()),
    )
    return _read_record(updated)


@router.patch("/records/{record_id}/active", response_model=PltPlhRecordRead)
def update_record_active(
    record_id: int,
    request: PltPlhRecordActiveUpdate,
    _: User = Depends(get_admin_user),
    history_db: Session = Depends(get_history_db),
):
    record = plt_plh_service.get_record(history_db, record_id)
    updated = plt_plh_service.set_record_active(history_db, record, request.is_active)
    return _read_record(updated)


@router.delete("/records/{record_id}", status_code=204)
def delete_record(
    record_id: int,
    _: User = Depends(get_admin_user),
    history_db: Session = Depends(get_history_db),
):
    record = plt_plh_service.get_record(history_db, record_id)
    plt_plh_service.delete_record(history_db, record)
    return Response(status_code=204)
