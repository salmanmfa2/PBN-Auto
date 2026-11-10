from datetime import date
from io import BytesIO
import re

from fastapi import HTTPException
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.history_db import engine
from app.models.plt_plh import PltPlhMonitoringRecord
from app.schemas.plt_plh import (
    PltPlhEmployeeOption,
    PltPlhRecordFields,
    PltPlhRecordRead,
)
from app.utils.employee_formatting import format_job_with_unit


NOTIFICATION_STATUSES = {"Mendekati 6 Bulan", "Lebih dari 6 Bulan"}
EXPORT_HEADERS = [
    "No.",
    "Jabatan Kosong",
    "Pejabat Pengganti",
    "NIP Pejabat Pengganti",
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
        pejabat_pengganti_nip=getattr(record, "pejabat_pengganti_nip", None),
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


def search_pbn_open_employees(query: str, limit: int = 20) -> list[PltPlhEmployeeOption]:
    normalized_query = query.strip()
    if len(normalized_query) < 2:
        return []

    filters = ["`Nama Gelar` LIKE :name_pattern"]
    params: dict[str, str | int] = {
        "name_pattern": f"%{normalized_query}%",
        "limit": limit,
    }
    nip_query = re.sub(r"\D", "", normalized_query)
    if nip_query:
        filters.append("CAST(`NIP` AS CHAR) LIKE :nip_pattern")
        params["nip_pattern"] = f"%{nip_query}%"

    statement = text(
        f"""
        SELECT
            CAST(`NIP` AS CHAR) AS nip,
            `Nama Gelar` AS nama,
            `Jabatan` AS jabatan,
            `Unit Eselon II` AS unit_eselon_ii,
            `eselon` AS eselon
        FROM pbncleaner.fetch_pbnopen
        WHERE {" OR ".join(filters)}
        ORDER BY `Nama Gelar`
        LIMIT :limit
        """
    )
    try:
        with engine.connect() as connection:
            rows = connection.execute(statement, params).mappings().all()
    except SQLAlchemyError as exc:
        raise RuntimeError(
            "Could not search employees in 'pbncleaner.fetch_pbnopen'. "
            "Check database connectivity and the employee table."
        ) from exc

    employees: list[PltPlhEmployeeOption] = []
    seen_nips: set[str] = set()
    for row in rows:
        nip = re.sub(r"\D", "", str(row["nip"] or ""))
        nama = str(row["nama"] or "").strip()
        if len(nip) != 18 or not nama:
            continue
        if nip in seen_nips:
            raise RuntimeError(
                "The PBN Open source contains duplicate NIP values. "
                "Resolve the duplicates before selecting an employee."
            )
        seen_nips.add(nip)
        jabatan = str(row["jabatan"] or "").strip()
        unit_eselon_ii = str(row["unit_eselon_ii"] or "").strip()
        eselon = str(row["eselon"] or "").strip() or None
        employees.append(
            PltPlhEmployeeOption(
                nip=nip,
                nama=nama,
                jabatan_definitif_pengganti=format_job_with_unit(
                    jabatan,
                    unit_eselon_ii,
                    eselon,
                ),
            )
        )
    return employees


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
                record.pejabat_pengganti_nip,
                record.jabatan_definitif_pengganti,
                record.nomor_surat,
                record.tmt,
                record.masa_kerja,
                record.status,
            ]
        )

    worksheet.freeze_panes = "A2"
    worksheet.column_dimensions["A"].width = 10
    for column in "BCEF":
        worksheet.column_dimensions[column].width = 28
    worksheet.column_dimensions["D"].width = 20
    worksheet.column_dimensions["G"].width = 16
    worksheet.column_dimensions["H"].width = 18
    worksheet.column_dimensions["I"].width = 24
    for cell in worksheet["G"][1:]:
        cell.number_format = "yyyy-mm-dd"

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output
