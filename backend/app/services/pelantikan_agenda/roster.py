"""Roster workbook import, lookup, and selection workflows."""

from io import BytesIO
from pathlib import Path

import pandas as pd
from sqlalchemy import bindparam, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.history_db import engine
from app.models.pelantikan_agenda import PelantikanAgenda, PelantikanAgendaPerson
from app.schemas.pelantikan_agenda import PelantikanImportStrategy, PelantikanPersonChoice
from app.services import dataset_service
from app.storage.dataset_store import DatasetStore

from .agendas import get_owned_agenda
from .common import (
    ALLOWED_EXTENSIONS,
    MAX_UPLOAD_SIZE,
    SELECTABLE_LOOKUP_STATUSES,
    _display_source_value,
    _display_text,
    _extract_nip_from_name_nip,
    _find_column,
    _is_pendamping,
    _validate_unique_selected_nips,
    normalize_nip,
)


def _extract_roster_rows(dataframe: pd.DataFrame, sheet_name: str) -> list[dict]:
    columns = list(dataframe.columns)
    no_column = _find_column(columns, ("No", "NO."))
    name_nip_column = _find_column(columns, ("Nama/NIP",))
    current_job_column = _find_column(
        columns,
        ("Jabatan Saat ini", "Jabatan Saat ini/Grade", "Jabatan Saat Ini/Grade"),
    )
    proposed_job_column = _find_column(
        columns,
        ("Usul Jabatan Baru", "Usul Jabatan Baru/Grade"),
    )
    required_columns = {
        "No": no_column,
        "Nama/NIP": name_nip_column,
        "Jabatan Saat ini": current_job_column,
        "Usul Jabatan Baru": proposed_job_column,
    }
    missing_columns = [name for name, column in required_columns.items() if column is None]
    if missing_columns:
        raise ValueError(
            "Kolom wajib tidak ditemukan pada baris header ketiga: "
            + ", ".join(missing_columns)
            + "."
        )

    extracted = []
    for index, row in dataframe.iterrows():
        source_name_nip = _display_text(row[name_nip_column])
        if not source_name_nip:
            continue
        source_row_number = int(index) + 4
        extracted.append(
            {
                "row_number": source_row_number,
                "source_sheet": sheet_name,
                "source_row_number": source_row_number,
                "nip": _extract_nip_from_name_nip(source_name_nip),
                "source_no": _display_source_value(row[no_column]),
                "source_nama_nip": source_name_nip,
                "source_jabatan_saat_ini": _display_source_value(row[current_job_column]),
                "source_usul_jabatan_baru": _display_source_value(row[proposed_job_column]),
            }
        )
    return extracted


def _match_extracted_rows(
    extracted: list[dict],
) -> tuple[list[PelantikanAgendaPerson], int]:
    nips = {row["nip"] for row in extracted if row["nip"]}
    employee_records = _lookup_employee_records(nips)
    seen_nips: set[str] = set()
    people: list[PelantikanAgendaPerson] = []
    duplicate_count = 0
    for row in extracted:
        nip = row["nip"]
        employee = employee_records.get(nip) if nip else None
        if not nip:
            lookup_status = "missing_nip"
        elif nip in seen_nips:
            lookup_status = "duplicate"
            duplicate_count += 1
        elif employee is None:
            lookup_status = "not_found"
        else:
            lookup_status = "matched"

        if nip:
            seen_nips.add(nip)
        if employee:
            name = employee["nama"]
            job = employee["jabatan"]
            unit = employee["unit_eselon_ii"]
        else:
            name = ""
            job = ""
            unit = ""

        people.append(
            PelantikanAgendaPerson(
                row_number=row["row_number"],
                source_no=row["source_no"],
                source_sheet=row["source_sheet"],
                source_row_number=row["source_row_number"],
                source_nama_nip=row["source_nama_nip"],
                source_jabatan_saat_ini=row["source_jabatan_saat_ini"],
                source_usul_jabatan_baru=row["source_usul_jabatan_baru"],
                nip=nip,
                nama=name,
                jabatan=job,
                unit_eselon_ii=unit,
                eselon=employee.get("eselon") if employee else None,
                lookup_status=lookup_status,
                selected=False,
                modality=employee.get("default_modality") if employee else None,
            )
        )
    return people, duplicate_count


def _lookup_employee_records(nips: set[str]) -> dict[str, dict[str, str]]:
    if not nips:
        return {}

    statement = text(
        """
        SELECT employee.`NIP`, employee.`Nama Gelar`, employee.`Jabatan`,
               employee.`Unit Eselon II`, employee.`eselon` AS eselon,
               unit.prov AS unit_province
        FROM pbncleaner.fetch_pbnopen AS employee
        LEFT JOIN pbncleaner.ref_unit_kerja AS unit
          ON TRIM(employee.`Unit Eselon II`) = TRIM(unit.value)
        WHERE TRIM(CAST(employee.`NIP` AS CHAR)) IN :nips
        """
    ).bindparams(bindparam("nips", expanding=True))

    try:
        with engine.connect() as connection:
            rows = connection.execute(statement, {"nips": sorted(nips)}).mappings().all()
    except SQLAlchemyError as exc:
        raise RuntimeError(
                "Could not look up employees and unit locations in "
                "'pbncleaner.fetch_pbnopen' and 'pbncleaner.ref_unit_kerja'. "
                "Check database connectivity and the reference columns."
            ) from exc

    matches: dict[str, dict[str, str]] = {}
    for row in rows:
        nip = normalize_nip(row["NIP"])
        if not nip:
            continue
        if nip in matches:
            raise RuntimeError(
                "The PBN Open source contains duplicate NIP values. "
                "Resolve the duplicates before generating invitation letters."
            )
        matches[nip] = {
            "nama": _display_text(row["Nama Gelar"]),
            "jabatan": _display_text(row["Jabatan"]),
            "unit_eselon_ii": _display_text(row["Unit Eselon II"]),
            "eselon": _display_text(row["eselon"]),
            "default_modality": (
                "luring"
                if _display_text(row["unit_province"]).casefold() == "dki jakarta"
                else "daring"
            ),
        }
    return matches


def list_workbook_sheets(content: bytes, filename: str) -> list[str]:
    extension = Path(filename).suffix.casefold()
    if extension not in ALLOWED_EXTENSIONS:
        raise ValueError("Unggah file Excel berformat .xlsx atau .xls.")
    if not content:
        raise ValueError("File Excel kosong.")
    if len(content) > MAX_UPLOAD_SIZE:
        raise ValueError("Ukuran file Excel melebihi 50 MB.")

    engine_name = "openpyxl" if extension == ".xlsx" else "xlrd"
    try:
        workbook = pd.ExcelFile(BytesIO(content), engine=engine_name)
        try:
            sheet_names = list(workbook.sheet_names)
        finally:
            workbook.close()
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Could not read file: {exc}") from exc

    if not sheet_names:
        raise ValueError("Uploaded file contains no worksheets.")
    return sheet_names


def upload_and_match(
    db: Session,
    agenda: PelantikanAgenda,
    content: bytes,
    filename: str,
    sheet_name: str | None = None,
) -> PelantikanAgenda:
    extension = Path(filename).suffix.casefold()
    if extension not in ALLOWED_EXTENSIONS:
        raise ValueError("Unggah file Excel berformat .xlsx atau .xls.")
    if not content:
        raise ValueError("File Excel kosong.")
    if len(content) > MAX_UPLOAD_SIZE:
        raise ValueError("Ukuran file Excel melebihi 50 MB.")

    dataset_id: str | None = None
    try:
        preview = dataset_service.parse_upload(content, filename)
        dataset_id = preview["dataset_id"]
        selected_sheet = sheet_name if sheet_name is not None else preview["selected_sheet"]
        selected_preview = next(
            (sheet for sheet in preview["sheets"] if sheet["name"] == selected_sheet),
            None,
        )
        if sheet_name is not None and selected_preview is None:
            raise ValueError(f"Sheet '{sheet_name}' was not found in the uploaded workbook.")
        if sheet_name is None and selected_preview is not None and selected_preview["row_count"] == 0:
            nonempty_sheet = next(
                (sheet for sheet in preview["sheets"] if sheet["row_count"] > 0),
                None,
            )
            if nonempty_sheet is not None:
                selected_sheet = nonempty_sheet["name"]

        engine_name = "openpyxl" if extension == ".xlsx" else "xlrd"
        dataframe = pd.read_excel(
            BytesIO(content),
            sheet_name=selected_sheet,
            skiprows=2,
            header=0,
            engine=engine_name,
        )
        if dataframe.empty:
            raise ValueError("The selected worksheet has no employee rows.")

        extracted = _extract_roster_rows(dataframe, selected_sheet)
        if not extracted:
            raise ValueError("Tidak ada baris pegawai dengan isi pada kolom Nama/NIP.")

        people, _ = _match_extracted_rows(extracted)

        agenda.people.clear()
        db.flush()
        agenda.people.extend(people)
        agenda.uploaded_filename = Path(filename).name[:255]
        agenda.uploaded_sheet = selected_sheet[:255]
        agenda.workflow_mode = "single_sheet"
        agenda.import_strategy = "single_sheet"
        agenda.status = "ready" if any(person.selected for person in people) else "draft"
        db.commit()
        db.refresh(agenda)
        return get_owned_agenda(db, agenda.id, agenda.created_by)
    except (KeyError, ValueError, RuntimeError):
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise RuntimeError("Could not save the employee lookup results for this agenda.") from exc
    finally:
        if dataset_id:
            DatasetStore.delete(dataset_id)


def upload_all_sheets_and_match(
    db: Session,
    agenda: PelantikanAgenda,
    content: bytes,
    filename: str,
) -> tuple[PelantikanAgenda, list[str], list[str], int]:
    return upload_sheets_and_match(
        db,
        agenda,
        content,
        filename,
        "all_sheets",
    )


def upload_sheets_and_match(
    db: Session,
    agenda: PelantikanAgenda,
    content: bytes,
    filename: str,
    import_strategy: PelantikanImportStrategy,
    sheet_names: list[str] | None = None,
) -> tuple[PelantikanAgenda, list[str], list[str], int]:
    if import_strategy not in {
        "single_sheet",
        "all_sheets",
        "selected_sheets",
        "isolated_sheets",
    }:
        raise ValueError("Pilih metode impor sheet yang valid.")
    extension = Path(filename).suffix.casefold()
    if extension not in ALLOWED_EXTENSIONS:
        raise ValueError("Unggah file Excel berformat .xlsx atau .xls.")
    if not content:
        raise ValueError("File Excel kosong.")
    if len(content) > MAX_UPLOAD_SIZE:
        raise ValueError("Ukuran file Excel melebihi 50 MB.")

    engine_name = "openpyxl" if extension == ".xlsx" else "xlrd"
    try:
        workbook = pd.ExcelFile(BytesIO(content), engine=engine_name)
    except Exception as exc:
        raise ValueError(f"Could not read file: {exc}") from exc

    extracted: list[dict] = []
    processed_sheets: list[str] = []
    skipped_sheets: list[str] = []
    try:
        try:
            workbook_sheets = list(workbook.sheet_names)
            if not workbook_sheets:
                raise ValueError("Uploaded file contains no worksheets.")
            requested_sheets = sheet_names or []
            if import_strategy == "selected_sheets":
                if not requested_sheets:
                    raise ValueError("Pilih setidaknya satu sheet untuk digabungkan.")
                if len(requested_sheets) != len(set(requested_sheets)):
                    raise ValueError("Sheet yang dipilih tidak boleh duplikat.")
            elif import_strategy == "single_sheet" and len(requested_sheets) != 1:
                raise ValueError("Pilih tepat satu sheet untuk diproses.")

            if import_strategy in {"selected_sheets", "single_sheet"}:
                unknown_sheets = [
                    sheet_name
                    for sheet_name in requested_sheets
                    if sheet_name not in workbook_sheets
                ]
                if unknown_sheets:
                    raise ValueError(
                        "Sheet tidak ditemukan di workbook: " + ", ".join(unknown_sheets) + "."
                    )
                selected_names = set(requested_sheets)
                sheets_to_process = [
                    sheet_name for sheet_name in workbook_sheets if sheet_name in selected_names
                ]
            else:
                sheets_to_process = workbook_sheets

            for sheet_name in sheets_to_process:
                dataframe = workbook.parse(sheet_name=sheet_name, skiprows=2, header=0)
                if dataframe.empty:
                    skipped_sheets.append(sheet_name)
                    continue
                try:
                    rows = _extract_roster_rows(dataframe, sheet_name)
                except ValueError:
                    skipped_sheets.append(sheet_name)
                    continue
                if not rows:
                    skipped_sheets.append(sheet_name)
                    continue
                for row in rows:
                    row["row_number"] = len(extracted) + 1
                    extracted.append(row)
                processed_sheets.append(sheet_name)
        finally:
            workbook.close()

        if not extracted:
            skipped_detail = (
                " Sheet yang dilewati: " + ", ".join(skipped_sheets) + "."
                if skipped_sheets
                else ""
            )
            raise ValueError(
                "Tidak ditemukan sheet roster yang dapat diproses." + skipped_detail
            )

        people, duplicate_count = _match_extracted_rows(extracted)
        agenda.people.clear()
        db.flush()
        agenda.people.extend(people)
        agenda.uploaded_filename = Path(filename).name[:255]
        if import_strategy in {"all_sheets", "isolated_sheets"}:
            agenda.uploaded_sheet = "Semua sheet"
        elif import_strategy == "selected_sheets":
            agenda.uploaded_sheet = ", ".join(processed_sheets)[:255]
        else:
            agenda.uploaded_sheet = processed_sheets[0][:255]
        agenda.workflow_mode = "all_sheets"
        agenda.import_strategy = import_strategy
        agenda.status = "ready" if any(person.selected for person in people) else "draft"
        db.commit()
        db.refresh(agenda)
        return (
            get_owned_agenda(db, agenda.id, agenda.created_by),
            processed_sheets,
            skipped_sheets,
            duplicate_count,
        )
    except (KeyError, ValueError, RuntimeError):
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise RuntimeError("Could not save the employee lookup results for this agenda.") from exc


def save_person_choices(
    db: Session,
    agenda: PelantikanAgenda,
    choices: list[PelantikanPersonChoice],
) -> PelantikanAgenda:
    people_by_id = {person.id: person for person in agenda.people}
    choice_ids = [choice.id for choice in choices]
    if len(choice_ids) != len(set(choice_ids)) or set(choice_ids) != set(people_by_id):
        raise ValueError("The employee choices do not match the saved agenda rows.")

    _validate_unique_selected_nips(
        [people_by_id[choice.id] for choice in choices if choice.selected]
    )

    for choice in choices:
        person = people_by_id[choice.id]
        if choice.selected:
            if _is_pendamping(person):
                raise ValueError(
                    f"Baris Pendamping pada baris {person.row_number} tidak dapat dipilih."
                )
            if person.lookup_status not in SELECTABLE_LOOKUP_STATUSES or not normalize_nip(person.nip):
                raise ValueError("Only employees matched to the PBN database can be included.")
            if not person.unit_eselon_ii:
                raise ValueError(
                    f"Unit Eselon II is missing for the selected employee in row {person.row_number}."
                )
        person.selected = choice.selected
        person.modality = choice.modality

    agenda.status = "ready" if any(choice.selected for choice in choices) else "draft"
    db.commit()
    return get_owned_agenda(db, agenda.id, agenda.created_by)
