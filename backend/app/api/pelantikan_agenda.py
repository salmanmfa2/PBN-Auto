from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.history_db import get_history_db
from app.models.auth import User
from app.schemas.pelantikan_agenda import (
    PelantikanAgendaCreate,
    PelantikanAgendaDetail,
    PelantikanAgendaFields,
    PelantikanAgendaPeopleUpdate,
    PelantikanAgendaRead,
    PelantikanAgendaSummary,
    PelantikanAgendaUploadRead,
    PelantikanAgendaUpdate,
)
from app.services import pelantikan_agenda_service


router = APIRouter(prefix="/undangan-pelantikan", tags=["Undangan Pelantikan"])


@router.get("/agendas", response_model=list[PelantikanAgendaSummary])
def get_agendas(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    return pelantikan_agenda_service.list_agendas(db, user.user)


@router.post("/agendas", response_model=PelantikanAgendaRead, status_code=201)
def create_agenda(
    request: PelantikanAgendaCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    try:
        agenda = pelantikan_agenda_service.create_agenda(db, user.user, request)
        return pelantikan_agenda_service.agenda_to_read(agenda)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Agenda pelantikan tidak dapat disimpan ke database.",
        ) from exc


@router.get("/agendas/{agenda_id}", response_model=PelantikanAgendaDetail)
def get_agenda(
    agenda_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    try:
        agenda = pelantikan_agenda_service.get_owned_agenda(db, agenda_id, user.user)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\"")) from exc
    return pelantikan_agenda_service.agenda_to_detail(agenda)


@router.put("/agendas/{agenda_id}", response_model=PelantikanAgendaRead)
def update_agenda(
    agenda_id: str,
    request: PelantikanAgendaUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    try:
        agenda = pelantikan_agenda_service.get_owned_agenda(
            db,
            agenda_id,
            user.user,
            include_people=False,
        )
        updated = pelantikan_agenda_service.update_agenda(
            db,
            agenda,
            PelantikanAgendaFields(**request.model_dump()),
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\"")) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Agenda tidak dapat diperbarui.") from exc
    return pelantikan_agenda_service.agenda_to_read(updated)


@router.post(
    "/agendas/{agenda_id}/upload",
    response_model=PelantikanAgendaUploadRead,
)
async def upload_agenda_excel(
    agenda_id: str,
    file: UploadFile = File(...),
    sheet_name: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    try:
        agenda = pelantikan_agenda_service.get_owned_agenda(db, agenda_id, user.user)
        filename = file.filename or ""
        content = await file.read(pelantikan_agenda_service.MAX_UPLOAD_SIZE + 1)
        if len(content) > pelantikan_agenda_service.MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail="Ukuran file Excel melebihi 50 MB.")
        if not content:
            raise HTTPException(status_code=400, detail="File Excel kosong.")
        updated = pelantikan_agenda_service.upload_and_match(
            db,
            agenda,
            content,
            filename,
            sheet_name,
        )
    except HTTPException:
        raise
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\"")) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Hasil pencarian pegawai tidak dapat disimpan.",
        ) from exc
    finally:
        await file.close()

    return {
        "selected_sheet": updated.uploaded_sheet or "",
        "row_count": len(updated.people),
        "people": updated.people,
    }


@router.post(
    "/agendas/{agenda_id}/sheets",
    response_model=list[str],
)
async def list_agenda_excel_sheets(
    agenda_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    try:
        pelantikan_agenda_service.get_owned_agenda(db, agenda_id, user.user)
        filename = file.filename or ""
        content = await file.read(pelantikan_agenda_service.MAX_UPLOAD_SIZE + 1)
        if len(content) > pelantikan_agenda_service.MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail="Ukuran file Excel melebihi 50 MB.")
        if not content:
            raise HTTPException(status_code=400, detail="File Excel kosong.")
        return pelantikan_agenda_service.list_workbook_sheets(content, filename)
    except HTTPException:
        raise
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\"")) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        await file.close()


@router.put(
    "/agendas/{agenda_id}/people",
    response_model=PelantikanAgendaDetail,
)
def update_people(
    agenda_id: str,
    request: PelantikanAgendaPeopleUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    try:
        agenda = pelantikan_agenda_service.get_owned_agenda(db, agenda_id, user.user)
        updated = pelantikan_agenda_service.save_person_choices(
            db,
            agenda,
            request.people,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\"")) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Pilihan pegawai tidak dapat disimpan.") from exc
    return pelantikan_agenda_service.agenda_to_detail(updated)


@router.post("/agendas/{agenda_id}/generate")
def generate_agenda_documents(
    agenda_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    try:
        agenda = pelantikan_agenda_service.get_owned_agenda(db, agenda_id, user.user)
        data, group_count = pelantikan_agenda_service.generate_agenda_zip(db, agenda)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\"")) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Dokumen berhasil disiapkan, tetapi riwayat pembuatan tidak dapat disimpan.",
        ) from exc

    filename = f"undangan_pelantikan_{agenda.tanggal_pelantikan.isoformat()}.zip"
    return StreamingResponse(
        BytesIO(data),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Pelantikan-Document-Count": str(group_count),
        },
    )


@router.delete("/agendas/{agenda_id}", status_code=204)
def delete_agenda(
    agenda_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    try:
        agenda = pelantikan_agenda_service.get_owned_agenda(
            db,
            agenda_id,
            user.user,
            include_people=False,
        )
        db.delete(agenda)
        db.commit()
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\"")) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Agenda tidak dapat dihapus.") from exc
    return Response(status_code=204)
