"""Agenda persistence and API serialization."""

from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.pelantikan_agenda import PelantikanAgenda, PelantikanAgendaPerson
from app.schemas.pelantikan_agenda import (
    PelantikanAgendaCreate,
    PelantikanAgendaFields,
    PelantikanAgendaPersonRead,
    PelantikanAgendaRead,
    PelantikanAgendaSummary,
)

from .common import INDONESIAN_WEEKDAYS, _display_text, _unit_reference_by_name


def get_owned_agenda(
    db: Session,
    agenda_id: str,
    username: str,
    *,
    include_people: bool = True,
) -> PelantikanAgenda:
    statement = select(PelantikanAgenda).where(
        PelantikanAgenda.id == agenda_id,
        PelantikanAgenda.created_by == username,
    )
    if include_people:
        statement = statement.options(selectinload(PelantikanAgenda.people))
    agenda = db.scalar(statement)
    if agenda is None:
        raise KeyError("Pelantikan agenda not found.")
    return agenda


def agenda_to_read(agenda: PelantikanAgenda) -> PelantikanAgendaRead:
    return PelantikanAgendaRead(
        id=agenda.id,
        tanggal_pelantikan=agenda.tanggal_pelantikan,
        hari_pelantikan=INDONESIAN_WEEKDAYS[agenda.tanggal_pelantikan.weekday()],
        nd_undangan_pelantikan=agenda.nd_undangan_pelantikan,
        tanggal_nd_undangan_pelantikan=agenda.tanggal_nd_undangan_pelantikan,
        jam_pelantikan=agenda.jam_pelantikan,
        dresscode=agenda.dresscode,
        level_jabatan=agenda.level_jabatan,
        status=agenda.status,
        workflow_mode=agenda.workflow_mode,
        import_strategy=agenda.import_strategy,
        uploaded_filename=agenda.uploaded_filename,
        uploaded_sheet=agenda.uploaded_sheet,
        last_generated_at=agenda.last_generated_at,
        created_at=agenda.created_at,
        updated_at=agenda.updated_at,
    )


def agenda_to_summary(agenda: PelantikanAgenda) -> PelantikanAgendaSummary:
    result = agenda_to_read(agenda).model_dump()
    return PelantikanAgendaSummary(
        **result,
        people_count=len(agenda.people),
        selected_count=sum(person.selected for person in agenda.people),
    )


def people_to_read(people: list[PelantikanAgendaPerson]) -> list[dict]:
    if not people:
        return []

    unit_reference_by_name = _unit_reference_by_name()
    results = []
    for person in people:
        person_read = PelantikanAgendaPersonRead.model_validate(person)
        reference = unit_reference_by_name.get(
            _display_text(person.unit_eselon_ii).casefold()
        )
        person_read.unit_kerja_id = reference[0] if reference else None
        person_read.unit_city = reference[1] if reference else ""
        results.append(person_read.model_dump())
    return results


def agenda_to_detail(agenda: PelantikanAgenda) -> dict:
    result = agenda_to_read(agenda).model_dump()
    return {
        **result,
        "people": people_to_read(agenda.people),
    }


def list_agendas(db: Session, username: str) -> list[PelantikanAgendaSummary]:
    records = db.scalars(
        select(PelantikanAgenda)
        .where(PelantikanAgenda.created_by == username)
        .options(selectinload(PelantikanAgenda.people))
        .order_by(PelantikanAgenda.created_at.desc())
    ).all()
    return [agenda_to_summary(record) for record in records]


def create_agenda(
    db: Session,
    username: str,
    fields: PelantikanAgendaCreate,
) -> PelantikanAgenda:
    values = fields.model_dump()
    values["import_strategy"] = (
        "all_sheets" if fields.workflow_mode == "all_sheets" else "single_sheet"
    )
    agenda = PelantikanAgenda(
        id=str(uuid4()),
        created_by=username,
        **values,
    )
    db.add(agenda)
    db.commit()
    db.refresh(agenda)
    return agenda


def update_agenda(
    db: Session,
    agenda: PelantikanAgenda,
    fields: PelantikanAgendaFields,
) -> PelantikanAgenda:
    for key, value in fields.model_dump().items():
        setattr(agenda, key, value)
    if agenda.status == "generated":
        agenda.status = "ready"
    db.commit()
    db.refresh(agenda)
    return agenda
