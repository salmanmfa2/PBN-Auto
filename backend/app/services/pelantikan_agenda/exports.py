"""Monitoring exports and grouped agenda document downloads."""

from datetime import datetime, timezone
from io import BytesIO
import re
import unicodedata
from zipfile import ZIP_DEFLATED, ZipFile

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from sqlalchemy.orm import Session

from app.models.pelantikan_agenda import PelantikanAgenda, PelantikanAgendaPerson

from .common import _display_text, _is_pendamping
from .documents import _selected_people_for_generation, build_agenda_docx


def _safe_filename(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^A-Za-z0-9]+", "_", ascii_name).strip("_").lower()
    return slug[:80] or "unit"


def export_monitoring_excel(agenda: PelantikanAgenda) -> bytes:
    grouped: dict[str, dict[str, int | str]] = {}
    for person in agenda.people:
        is_pendamping = _is_pendamping(person)
        if not is_pendamping and (
            not person.selected or person.modality not in {"daring", "luring"}
        ):
            continue

        unit = _display_text(person.unit_eselon_ii) or "Unit Eselon II tidak ditemukan"
        unit_key = unit.casefold()
        row = grouped.setdefault(
            unit_key,
            {
                "unit": unit,
                "daring": 0,
                "luring": 0,
                "pendamping": 0,
            },
        )
        if is_pendamping:
            row["pendamping"] += 1
        else:
            row[person.modality] += 1

    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Monitoring Pelantikan"
    worksheet.append(
        ["Unit Eselon II", "Daring", "Luring", "Pendamping (excluded)"]
    )
    for row in sorted(grouped.values(), key=lambda item: str(item["unit"]).casefold()):
        worksheet.append(
            [
                row["unit"],
                row["daring"],
                row["luring"],
                row["pendamping"],
            ]
        )

    header_fill = PatternFill(fill_type="solid", fgColor="17365D")
    for cell in worksheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for row in worksheet.iter_rows(min_row=2, min_col=2, max_col=4):
        for cell in row:
            cell.alignment = Alignment(horizontal="center")

    worksheet.freeze_panes = "A2"
    worksheet.auto_filter.ref = worksheet.dimensions
    worksheet.column_dimensions["A"].width = 55
    for column in ("B", "C", "D"):
        worksheet.column_dimensions[column].width = 24

    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def _group_people_for_agenda_documents(
    agenda: PelantikanAgenda,
    included: list[PelantikanAgendaPerson],
) -> tuple[
    dict[tuple[str | None, str, str], list[PelantikanAgendaPerson]],
    dict[tuple[str | None, str, str], str],
]:
    isolate_sheets = (
        getattr(agenda, "workflow_mode", "single_sheet") == "all_sheets"
        and getattr(agenda, "import_strategy", "all_sheets") == "isolated_sheets"
    )
    grouped: dict[tuple[str | None, str, str], list[PelantikanAgendaPerson]] = {}
    display_names: dict[tuple[str | None, str, str], str] = {}
    for person in sorted(included, key=lambda item: item.row_number):
        unit_name = person.unit_eselon_ii.strip()
        modality = person.modality
        source_sheet = (person.source_sheet or "Sheet") if isolate_sheets else None
        key = (source_sheet, unit_name.casefold(), modality)
        grouped.setdefault(key, []).append(person)
        display_names.setdefault(key, unit_name)
    return grouped, display_names


def _agenda_document_entry_name(
    index: int,
    key: tuple[str | None, str, str],
    display_names: dict[tuple[str | None, str, str], str],
) -> str:
    source_sheet, _, modality = key
    mode_label = "daring" if modality == "daring" else "luring"
    source_label = (
        f"_{_safe_filename(source_sheet)}"
        if source_sheet is not None
        else ""
    )
    return (
        f"{index:02d}_{_safe_filename(display_names[key])}{source_label}_{mode_label}.docx"
    )


def _mark_agenda_generated(db: Session, agenda: PelantikanAgenda) -> None:
    agenda.last_generated_at = datetime.now(timezone.utc)
    agenda.status = "generated"
    db.commit()


def generate_agenda_zip(db: Session, agenda: PelantikanAgenda) -> tuple[bytes, int]:
    included = _selected_people_for_generation(agenda)
    grouped, display_names = _group_people_for_agenda_documents(agenda, included)

    output = BytesIO()
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for index, (key, people) in enumerate(grouped.items(), start=1):
            unit_name = display_names[key]
            _, _, modality = key
            document = build_agenda_docx(agenda, people, modality, unit_name)
            entry_name = _agenda_document_entry_name(index, key, display_names)
            archive.writestr(entry_name, document)

    _mark_agenda_generated(db, agenda)
    return output.getvalue(), len(grouped)


def generate_selected_agenda_documents(
    db: Session,
    agenda: PelantikanAgenda,
    selected_person_ids: list[int],
) -> tuple[bytes, str, str, int]:
    if len(selected_person_ids) != len(set(selected_person_ids)):
        raise ValueError("Daftar dokumen berisi pegawai yang sama lebih dari satu kali.")

    included = _selected_people_for_generation(agenda)
    selected_ids = set(selected_person_ids)
    available_ids = {person.id for person in included}
    if not selected_ids.issubset(available_ids):
        raise ValueError("Pilih dokumen yang berisi pegawai terpilih pada agenda ini.")

    all_groups, display_names = _group_people_for_agenda_documents(agenda, included)
    selected_groups = []
    for key, people in all_groups.items():
        group_ids = {person.id for person in people}
        overlap = group_ids & selected_ids
        if overlap and overlap != group_ids:
            raise ValueError("Pilih seluruh peserta dalam satu dokumen.")
        if overlap:
            selected_groups.append((key, people))

    if not selected_groups:
        raise ValueError("Pilih setidaknya satu dokumen untuk diunduh.")

    if len(selected_groups) == 1:
        key, people = selected_groups[0]
        _, _, modality = key
        document = build_agenda_docx(
            agenda,
            people,
            modality,
            display_names[key],
        )
        source_sheet, _, _ = key
        source_label = (
            f"_{_safe_filename(source_sheet)}"
            if source_sheet is not None
            else ""
        )
        mode_label = "daring" if modality == "daring" else "luring"
        filename = (
            f"undangan_pelantikan_{agenda.tanggal_pelantikan.isoformat()}_"
            f"{_safe_filename(display_names[key])}{source_label}_{mode_label}.docx"
        )
        media_type = (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        data = document
    else:
        output = BytesIO()
        with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
            for index, (key, people) in enumerate(selected_groups, start=1):
                _, _, modality = key
                document = build_agenda_docx(
                    agenda,
                    people,
                    modality,
                    display_names[key],
                )
                archive.writestr(
                    _agenda_document_entry_name(index, key, display_names),
                    document,
                )
        filename = f"undangan_pelantikan_{agenda.tanggal_pelantikan.isoformat()}.zip"
        media_type = "application/zip"
        data = output.getvalue()

    _mark_agenda_generated(db, agenda)
    return data, filename, media_type, len(selected_groups)
