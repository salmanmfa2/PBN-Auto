import hmac
from datetime import date
from io import BytesIO

from fastapi import HTTPException
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.plt_plh import PltPlhMonitoringRecord
from app.schemas.plt_plh import PltPlhRecordFields, PltPlhRecordRead


NOTIFICATION_STATUSES = {"Mendekati 6 Bulan", "Lebih dari 6 Bulan"}
EXPORT_HEADERS = [
    "No.",
    "Jabatan Kosong",
    "Pejabat Pengganti",
    "Jabatan Definitif Pengganti",
    "Nomor Surat",
    "TMT",
    "Masa Kerja",
    "Status",
]


def _completed_months(tmt: date, today: date) -> int:
    months = (today.year - tmt.year) * 12 + today.month - tmt.month
    if today.day < tmt.day:
        months -= 1
    return max(months, 0)


def record_to_read(record: PltPlhMonitoringRecord, today: date | None = None) -> PltPlhRecordRead:
    if today is None:
        today = date.today()
    total_months = _completed_months(record.tmt, today)
    years, months = divmod(total_months, 12)
    if not record.is_active:
        status = "Inaktif"
    elif total_months < 5:
        status = "Aktif"
    elif total_months < 6:
        status = "Mendekati 6 Bulan"
    else:
        status = "Lebih dari 6 Bulan"
    return PltPlhRecordRead(
        id=record.id,
        jabatan_kosong=record.jabatan_kosong,
        pejabat_pengganti=record.pejabat_pengganti,
        jabatan_definitif_pengganti=record.jabatan_definitif_pengganti,
        nomor_surat=record.nomor_surat,
        tmt=record.tmt,
        masa_kerja_tahun=years,
        masa_kerja_bulan=months,
        masa_kerja=f"{years} Y {months} M",
        status=status,
        is_active=record.is_active,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def list_records(db: Session) -> list[PltPlhRecordRead]:
    records = db.scalars(
        select(PltPlhMonitoringRecord).order_by(
            PltPlhMonitoringRecord.is_active.desc(),
            PltPlhMonitoringRecord.tmt.desc(),
            PltPlhMonitoringRecord.id.desc(),
        )
    ).all()
    today = date.today()
    return [record_to_read(record, today) for record in records]


def list_notifications(db: Session) -> list[PltPlhRecordRead]:
    return [record for record in list_records(db) if record.status in NOTIFICATION_STATUSES]


def verify_edit_password(db: Session, password: str) -> None:
    configured_password = db.execute(
        text("SELECT edit_password FROM plt_plh_edit_password WHERE id = 1")
    ).scalar_one_or_none()
    if configured_password is None:
        raise HTTPException(status_code=503, detail="The edit password is not configured.")
    if not hmac.compare_digest(
        str(configured_password).encode("utf-8"),
        password.encode("utf-8"),
    ):
        raise HTTPException(status_code=403, detail="Incorrect edit password.")


def create_record(db: Session, fields: PltPlhRecordFields) -> PltPlhMonitoringRecord:
    record = PltPlhMonitoringRecord(**fields.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def update_record(
    db: Session,
    record: PltPlhMonitoringRecord,
    fields: PltPlhRecordFields,
) -> PltPlhMonitoringRecord:
    for field, value in fields.model_dump().items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


def set_record_active(
    db: Session,
    record: PltPlhMonitoringRecord,
    is_active: bool,
) -> PltPlhMonitoringRecord:
    record.is_active = is_active
    db.commit()
    db.refresh(record)
    return record


def delete_record(db: Session, record: PltPlhMonitoringRecord) -> None:
    db.delete(record)
    db.commit()


def get_record(db: Session, record_id: int) -> PltPlhMonitoringRecord:
    record = db.get(PltPlhMonitoringRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Monitoring record not found.")
    return record


def export_records(db: Session) -> BytesIO:
    records = list_records(db)
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Manajemen Plt-Plh"
    worksheet.append(EXPORT_HEADERS)
    for cell in worksheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(fill_type="solid", fgColor="334155")
        cell.alignment = Alignment(vertical="center")

    for row_number, record in enumerate(records, start=1):
        worksheet.append(
            [
                row_number,
                record.jabatan_kosong,
                record.pejabat_pengganti,
                record.jabatan_definitif_pengganti,
                record.nomor_surat,
                record.tmt,
                record.masa_kerja,
                record.status,
            ]
        )

    worksheet.freeze_panes = "A2"
    worksheet.column_dimensions["A"].width = 10
    for column in "BCDE":
        worksheet.column_dimensions[column].width = 28
    worksheet.column_dimensions["F"].width = 16
    worksheet.column_dimensions["G"].width = 18
    worksheet.column_dimensions["H"].width = 24
    for cell in worksheet["F"][1:]:
        cell.number_format = "yyyy-mm-dd"

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output
