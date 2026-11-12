from copy import deepcopy
from datetime import date, datetime, timezone
from io import BytesIO
import math
import re
from numbers import Integral, Real
from pathlib import Path
import unicodedata
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import etree
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from sqlalchemy import bindparam, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from app.history_db import engine
from app.models.pelantikan_agenda import PelantikanAgenda, PelantikanAgendaPerson
from app.schemas.pelantikan_agenda import (
    PelantikanAgendaCreate,
    PelantikanAgendaFields,
    PelantikanAgendaPersonRead,
    PelantikanAgendaRead,
    PelantikanAgendaSummary,
    PelantikanImportStrategy,
    PelantikanPersonChoice,
)
from app.services import dataset_service
from app.storage.dataset_store import DatasetStore
from app.utils.employee_formatting import format_job_with_unit


MAX_UPLOAD_SIZE = 50 * 1024 * 1024
ALLOWED_EXTENSIONS = {".xlsx", ".xls"}
SELECTABLE_LOOKUP_STATUSES = {"matched", "duplicate"}
TEMPLATE_DIRECTORY = (
    Path(__file__).resolve().parents[2] / "templates" / "undangan_pelantikan"
)
W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
XML_NS = "http://www.w3.org/XML/1998/namespace"
NS = {"w": W_NS}
W = f"{{{W_NS}}}"
INDONESIAN_MONTHS = (
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
)
INDONESIAN_WEEKDAYS = (
    "Senin",
    "Selasa",
    "Rabu",
    "Kamis",
    "Jumat",
    "Sabtu",
    "Minggu",
)


def _normalize_column_name(value: object) -> str:
    return "".join(character for character in str(value).casefold() if character.isalnum())


def normalize_nip(value: object) -> str | None:
    if value is None or value is pd.NA:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        return None

    if isinstance(value, bool):
        return None
    if isinstance(value, Integral):
        raw = str(int(value))
    elif isinstance(value, Real):
        if not math.isfinite(float(value)) or not float(value).is_integer():
            return None
        raw = str(int(value))
    else:
        raw = str(value).strip()
        if re.fullmatch(r"\d+\.0+", raw):
            raw = raw[: raw.index(".")]

    digits = re.sub(r"\D", "", raw)
    return digits if len(digits) == 18 else None


def _validate_unique_selected_nips(people: list[PelantikanAgendaPerson]) -> None:
    seen_nips: set[str] = set()
    for person in people:
        nip = normalize_nip(getattr(person, "nip", None))
        if not nip:
            continue
        if nip in seen_nips:
            raise ValueError("Pilih hanya satu baris untuk setiap NIP duplikat.")
        seen_nips.add(nip)


def _extract_nip_from_name_nip(value: object) -> str | None:
    source = _display_text(value)
    for line in reversed(source.splitlines()):
        candidate = line.strip()
        if not candidate:
            continue
        matches = re.findall(r"(?<!\d)\d{18}(?!\d)", candidate)
        if matches:
            return matches[-1]
        return normalize_nip(candidate)
    return None


def _display_text(value: object) -> str:
    if value is None or value is pd.NA:
        return ""
    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        return ""
    return str(value).strip()


def _display_source_value(value: object) -> str:
    if isinstance(value, Real) and not isinstance(value, bool):
        if math.isfinite(float(value)) and float(value).is_integer():
            return str(int(value))
    return _display_text(value)


def _find_column(columns: list[object], aliases: tuple[str, ...]) -> object | None:
    normalized_aliases = {_normalize_column_name(alias) for alias in aliases}
    for column in columns:
        if _normalize_column_name(column) in normalized_aliases:
            return column
    return None


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


def _is_pendamping(person: PelantikanAgendaPerson) -> bool:
    return "pendamping" in _display_text(getattr(person, "source_no", None)).casefold()


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


def _unit_reference_by_name() -> dict[str, tuple[int, str]]:
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                "SELECT `unit_kerja_id`, `value`, `city` "
                "FROM pbncleaner.ref_unit_kerja"
            )
        ).mappings()
        return {
            _display_text(row["value"]).casefold(): (
                int(row["unit_kerja_id"]),
                _display_text(row["city"]),
            )
            for row in rows
            if _display_text(row["value"])
        }


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


def format_indonesian_date(value: date) -> str:
    return f"{value.day} {INDONESIAN_MONTHS[value.month - 1]} {value.year}"


def _kanwil_province(unit_name: str) -> str | None:
    normalized = re.sub(r"\s+", " ", unit_name).strip()
    kanwil = re.fullmatch(
        r"(?:Kanwil|Kantor Wilayah)\s+DJPb\s+Prov(?:insi)?\.?\s+(.+)",
        normalized,
        flags=re.IGNORECASE,
    )
    return kanwil.group(1).strip() if kanwil else None


def _format_formal_recipient(unit_name: str) -> str:
    normalized = re.sub(r"\s+", " ", unit_name).strip()
    province = _kanwil_province(normalized)
    if province:
        return (
            "Kepala Kantor Wilayah Direktorat Jenderal Perbendaharaan "
            f"Provinsi {province}"
        )

    directorate = re.match(r"^Direktorat\b\s*(.*)$", normalized, flags=re.IGNORECASE)
    if directorate:
        return f"Direktur {directorate.group(1).strip()}"

    agency = re.match(r"^Badan\b\s*(.*)$", normalized, flags=re.IGNORECASE)
    if agency:
        return f"Kepala Badan {agency.group(1).strip()}"

    return normalized


def _format_job_with_unit(person: PelantikanAgendaPerson) -> str:
    return format_job_with_unit(
        _display_text(person.jabatan),
        _display_text(person.unit_eselon_ii),
        _display_text(getattr(person, "eselon", None)),
    )


def _replace_token(paragraph: etree._Element, token: str, replacement: str) -> None:
    search_from = 0
    while True:
        nodes = paragraph.findall(".//w:t", NS)
        full_text = "".join(node.text or "" for node in nodes)
        token_start = full_text.find(token, search_from)
        if token_start < 0:
            return
        token_end = token_start + len(token)

        offset = 0
        start_node = end_node = -1
        start_offset = end_offset = 0
        for index, node in enumerate(nodes):
            node_text = node.text or ""
            node_end = offset + len(node_text)
            if start_node < 0 and offset <= token_start < node_end:
                start_node = index
                start_offset = token_start - offset
            if offset < token_end <= node_end:
                end_node = index
                end_offset = token_end - offset
                break
            offset = node_end

        if start_node < 0 or end_node < 0:
            return
        if start_node == end_node:
            old_text = nodes[start_node].text or ""
            nodes[start_node].text = (
                old_text[:start_offset] + replacement + old_text[end_offset:]
            )
            _set_xml_space(nodes[start_node])
            search_from = token_start + len(replacement)
            continue

        first_text = nodes[start_node].text or ""
        nodes[start_node].text = first_text[:start_offset] + replacement
        _set_xml_space(nodes[start_node])
        for index in range(start_node + 1, end_node):
            nodes[index].text = ""
        last_text = nodes[end_node].text or ""
        nodes[end_node].text = last_text[end_offset:]
        _set_xml_space(nodes[end_node])
        search_from = token_start + len(replacement)


def _set_xml_space(node: etree._Element) -> None:
    if node.text and (node.text[0].isspace() or node.text[-1].isspace()):
        node.set(f"{{{XML_NS}}}space", "preserve")


def _replace_document_tokens(document_xml: bytes, replacements: dict[str, str]) -> bytes:
    root = etree.fromstring(document_xml)
    token_markers = {
        token: f"__PE_TOKEN_{uuid4().hex}__"
        for token in replacements
    }
    markers = {
        marker: replacements[token]
        for token, marker in token_markers.items()
    }
    for paragraph in root.findall(".//w:p", NS):
        for token, marker in token_markers.items():
            _replace_token(paragraph, token, marker)
    for paragraph in root.findall(".//w:p", NS):
        for marker, value in markers.items():
            _replace_token(paragraph, marker, value)
    return etree.tostring(
        root,
        xml_declaration=True,
        encoding="UTF-8",
        standalone=True,
    )


def _cell_text(cell: etree._Element) -> str:
    return "".join(node.text or "" for node in cell.findall(".//w:t", NS)).strip()


def _set_cell_lines(cell: etree._Element, lines: list[str]) -> None:
    paragraphs = cell.findall("./w:p", NS)
    if paragraphs:
        paragraph = paragraphs[0]
    else:
        paragraph = etree.SubElement(cell, f"{W}p")

    paragraph_properties = paragraph.find("./w:pPr", NS)
    run_properties = None
    for run in paragraph.findall("./w:r", NS):
        existing_properties = run.find("./w:rPr", NS)
        if existing_properties is not None:
            run_properties = deepcopy(existing_properties)
            break

    for child in list(paragraph):
        if child is not paragraph_properties:
            paragraph.remove(child)
    for extra_paragraph in paragraphs[1:]:
        cell.remove(extra_paragraph)

    for line_index, line in enumerate(lines):
        run = etree.SubElement(paragraph, f"{W}r")
        if run_properties is not None:
            run.append(deepcopy(run_properties))
        text_node = etree.SubElement(run, f"{W}t")
        text_node.text = line
        _set_xml_space(text_node)
        if line_index < len(lines) - 1:
            etree.SubElement(run, f"{W}br")


def _find_roster_table(root: etree._Element) -> etree._Element:
    for table in root.findall(".//w:tbl", NS):
        rows = table.findall("./w:tr", NS)
        if not rows:
            continue
        header = [
            _normalize_column_name(_cell_text(cell))
            for cell in rows[0].findall("./w:tc", NS)
        ]
        if len(header) >= 3 and header[:3] == ["no", "namanip", "jabatansaatini"]:
            return table
    raise ValueError("The pelantikan template is missing the employee-list table.")


def _populate_roster(table: etree._Element, people: list[PelantikanAgendaPerson]) -> None:
    rows = table.findall("./w:tr", NS)
    if len(rows) < 2:
        raise ValueError("The pelantikan template's employee-list table has no data row.")
    header_row = rows[0]
    header_properties = header_row.find("./w:trPr", NS)
    if header_properties is None:
        header_properties = etree.Element(f"{W}trPr")
        header_row.insert(0, header_properties)
    if header_properties.find("./w:tblHeader", NS) is None:
        etree.SubElement(header_properties, f"{W}tblHeader").set(f"{W}val", "true")

    data_rows = rows[1:]
    template_row = data_rows[-1]
    while len(data_rows) > len(people):
        table.remove(data_rows.pop())
    while len(data_rows) < len(people):
        clone = deepcopy(template_row)
        table.append(clone)
        data_rows.append(clone)

    for number, (row, person) in enumerate(zip(data_rows, people), start=1):
        cells = row.findall("./w:tc", NS)
        if len(cells) < 3:
            raise ValueError("The employee-list table must have at least three columns.")
        _set_cell_lines(cells[0], [str(number)])
        _set_cell_lines(cells[1], [person.nama, person.nip or ""])
        _set_cell_lines(cells[2], [_format_job_with_unit(person)])


def _populate_appendix_roster(
    table: etree._Element,
    people: list[PelantikanAgendaPerson],
) -> None:
    rows = table.findall("./w:tr", NS)
    if len(rows) < 2:
        raise ValueError("The appendix template's employee-list table has no data row.")

    header = [
        _normalize_column_name(_cell_text(cell))
        for cell in rows[0].findall("./w:tc", NS)
    ]
    if header[:4] != ["no", "namanip", "jabatansaatini", "keterangan"]:
        raise ValueError(
            "The appendix template must have No, Nama/NIP, Jabatan Saat Ini, "
            "and Keterangan columns."
        )

    header_properties = rows[0].find("./w:trPr", NS)
    if header_properties is None:
        header_properties = etree.Element(f"{W}trPr")
        rows[0].insert(0, header_properties)
    if header_properties.find("./w:tblHeader", NS) is None:
        etree.SubElement(header_properties, f"{W}tblHeader").set(f"{W}val", "true")

    data_rows = rows[1:]
    template_row = data_rows[-1]
    while len(data_rows) > len(people):
        table.remove(data_rows.pop())
    while len(data_rows) < len(people):
        clone = deepcopy(template_row)
        table.append(clone)
        data_rows.append(clone)

    for number, (row, person) in enumerate(zip(data_rows, people), start=1):
        cells = row.findall("./w:tc", NS)
        if len(cells) < 4:
            raise ValueError("The appendix employee-list table must have four columns.")
        _set_cell_lines(cells[0], [str(number)])
        _set_cell_lines(cells[1], [person.nama, person.nip or ""])
        _set_cell_lines(cells[2], [person.jabatan])
        _set_cell_lines(
            cells[3],
            ["Fisik" if person.modality == "luring" else "Virtual"],
        )


def _selected_people_for_generation(
    agenda: PelantikanAgenda,
) -> list[PelantikanAgendaPerson]:
    included = [
        person
        for person in agenda.people
        if person.selected and not _is_pendamping(person)
    ]
    if not included:
        raise ValueError("Pilih setidaknya satu pegawai untuk membuat ND.")

    _validate_unique_selected_nips(included)

    invalid = [
        person
        for person in included
        if person.lookup_status not in SELECTABLE_LOOKUP_STATUSES
        or person.modality not in {"daring", "luring"}
        or not person.unit_eselon_ii.strip()
    ]
    if invalid:
        raise ValueError(
            "Setiap pegawai terpilih harus cocok dengan database, memiliki Unit Eselon II, "
            "dan memiliki pilihan Daring atau Luring."
        )
    return included


def generate_lampiran_pengantar_docx(agenda: PelantikanAgenda) -> bytes:
    included = _selected_people_for_generation(agenda)
    unit_reference_by_name = _unit_reference_by_name()

    def sort_key(person: PelantikanAgendaPerson) -> tuple[int, bool, int, str, int]:
        reference = unit_reference_by_name.get(
            _display_text(person.unit_eselon_ii).casefold()
        )
        return (
            0 if person.modality == "luring" else 1,
            reference is None,
            reference[0] if reference else 0,
            _display_text(person.unit_eselon_ii).casefold(),
            person.row_number,
        )

    included.sort(
        key=sort_key
    )

    template_path = TEMPLATE_DIRECTORY / "template_lampiran_pengantar.docx"
    if not template_path.is_file():
        raise FileNotFoundError(f"Pelantikan appendix template not found: {template_path}")

    output = BytesIO()
    with ZipFile(template_path, "r") as source:
        document_root = etree.fromstring(source.read("word/document.xml"))
        roster_table = _find_roster_table(document_root)
        _populate_appendix_roster(roster_table, included)
        document_xml = etree.tostring(
            document_root,
            xml_declaration=True,
            encoding="UTF-8",
            standalone=True,
        )
        with ZipFile(output, "w", compression=ZIP_DEFLATED) as destination:
            for item in source.infolist():
                contents = document_xml if item.filename == "word/document.xml" else source.read(item)
                destination.writestr(item, contents)
    return output.getvalue()


def build_agenda_docx(
    agenda: PelantikanAgenda,
    people: list[PelantikanAgendaPerson],
    modality: str,
    unit_eselon_ii: str,
) -> bytes:
    template_name = (
        "template_pelantikan_daring.docx"
        if modality == "daring"
        else "template_pelantikan_luring.docx"
    )
    template_path = TEMPLATE_DIRECTORY / template_name
    if not template_path.is_file():
        raise FileNotFoundError(f"Pelantikan template not found: {template_path}")

    replacements = {
        "(dt_employee.Unit Eselon II)": _format_formal_recipient(unit_eselon_ii),
        "(level_jabatan)": agenda.level_jabatan,
        "(nomor_nd)": agenda.nd_undangan_pelantikan,
        "(tanggal_nd)": format_indonesian_date(agenda.tanggal_nd_undangan_pelantikan),
        "(hari)": INDONESIAN_WEEKDAYS[agenda.tanggal_pelantikan.weekday()],
        "(tanggal)": format_indonesian_date(agenda.tanggal_pelantikan),
        "(time)": agenda.jam_pelantikan,
        "(dresscode)": agenda.dresscode,
    }

    output = BytesIO()
    with ZipFile(template_path, "r") as source:
        document_xml = _replace_document_tokens(
            source.read("word/document.xml"),
            replacements,
        )
        document_root = etree.fromstring(document_xml)
        roster_table = _find_roster_table(document_root)
        _populate_roster(roster_table, people)
        document_xml = etree.tostring(
            document_root,
            xml_declaration=True,
            encoding="UTF-8",
            standalone=True,
        )

        with ZipFile(output, "w", compression=ZIP_DEFLATED) as destination:
            for item in source.infolist():
                contents = document_xml if item.filename == "word/document.xml" else source.read(item)
                destination.writestr(item, contents)
    return output.getvalue()


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
