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
    PelantikanPersonChoice,
)
from app.services import dataset_service
from app.storage.dataset_store import DatasetStore


MAX_UPLOAD_SIZE = 50 * 1024 * 1024
ALLOWED_EXTENSIONS = {".xlsx", ".xls"}
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


def _lookup_employee_records(nips: set[str]) -> dict[str, dict[str, str]]:
    if not nips:
        return {}

    statement = text(
        """
        SELECT `NIP`, `Nama Gelar`, `Jabatan`, `Unit Eselon II`, `eselon` AS eselon
        FROM pbncleaner.fetch_pbnopen
        WHERE TRIM(CAST(`NIP` AS CHAR)) IN :nips
        """
    ).bindparams(bindparam("nips", expanding=True))

    try:
        with engine.connect() as connection:
            rows = connection.execute(statement, {"nips": sorted(nips)}).mappings().all()
    except SQLAlchemyError as exc:
        raise RuntimeError(
            "Could not look up employees in 'pbncleaner.fetch_pbnopen'. "
            "Check database connectivity and the NIP column."
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


def agenda_to_detail(agenda: PelantikanAgenda) -> dict:
    result = agenda_to_read(agenda).model_dump()
    return {
        **result,
        "people": [
            PelantikanAgendaPersonRead.model_validate(person).model_dump()
            for person in agenda.people
        ],
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
    agenda = PelantikanAgenda(
        id=str(uuid4()),
        created_by=username,
        **fields.model_dump(),
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


def upload_and_match(
    db: Session,
    agenda: PelantikanAgenda,
    content: bytes,
    filename: str,
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
        selected_sheet = preview["selected_sheet"]
        selected_preview = next(
            (sheet for sheet in preview["sheets"] if sheet["name"] == selected_sheet),
            None,
        )
        if selected_preview is not None and selected_preview["row_count"] == 0:
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
            extracted.append(
                {
                    "row_number": int(index) + 4,
                    "nip": _extract_nip_from_name_nip(source_name_nip),
                    "source_no": _display_source_value(row[no_column]),
                    "source_nama_nip": source_name_nip,
                    "source_jabatan_saat_ini": _display_source_value(row[current_job_column]),
                    "source_usul_jabatan_baru": _display_source_value(row[proposed_job_column]),
                }
            )
        if not extracted:
            raise ValueError("Tidak ada baris pegawai dengan isi pada kolom Nama/NIP.")

        nips = {row["nip"] for row in extracted if row["nip"]}
        employee_records = _lookup_employee_records(nips)
        seen_nips: set[str] = set()
        people: list[PelantikanAgendaPerson] = []
        for row in extracted:
            nip = row["nip"]
            employee = employee_records.get(nip) if nip else None
            if not nip:
                lookup_status = "missing_nip"
            elif nip in seen_nips:
                lookup_status = "duplicate"
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
                    modality=None,
                )
            )

        agenda.people.clear()
        agenda.people.extend(people)
        agenda.uploaded_filename = Path(filename).name[:255]
        agenda.uploaded_sheet = selected_sheet[:255]
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


def save_person_choices(
    db: Session,
    agenda: PelantikanAgenda,
    choices: list[PelantikanPersonChoice],
) -> PelantikanAgenda:
    people_by_id = {person.id: person for person in agenda.people}
    choice_ids = [choice.id for choice in choices]
    if len(choice_ids) != len(set(choice_ids)) or set(choice_ids) != set(people_by_id):
        raise ValueError("The employee choices do not match the saved agenda rows.")

    for choice in choices:
        person = people_by_id[choice.id]
        if choice.selected:
            if _is_pendamping(person):
                raise ValueError(
                    f"Baris Pendamping pada baris {person.row_number} tidak dapat dipilih."
                )
            if person.lookup_status != "matched":
                raise ValueError("Only employees matched to the PBN database can be included.")
            if not person.unit_eselon_ii:
                raise ValueError(
                    f"Unit Eselon II is missing for the selected employee in row {person.row_number}."
                )
        person.selected = choice.selected
        person.modality = choice.modality if choice.selected else None

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


def _format_formal_unit_name(unit_name: str) -> str:
    normalized = re.sub(r"\s+", " ", unit_name).strip()
    province = _kanwil_province(normalized)
    if province:
        return (
            "Kantor Wilayah Direktorat Jenderal Perbendaharaan "
            f"Provinsi {province}"
        )
    return normalized


def _needs_unit_suffix(eselon: object) -> bool:
    value = _display_text(eselon)
    if not value:
        return False
    if re.fullmatch(r"\d+\.0+", value):
        value = value[: value.index(".")]
    normalized = _normalize_column_name(value)
    return normalized not in {"2", "ii", "eselon2", "eselonii"}


def _format_job_with_unit(person: PelantikanAgendaPerson) -> str:
    job = _display_text(person.jabatan)
    unit = _display_text(person.unit_eselon_ii)
    if not job or not unit or not _needs_unit_suffix(getattr(person, "eselon", None)):
        return job
    return f"{job} {_format_formal_unit_name(unit)}"


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


def generate_agenda_zip(db: Session, agenda: PelantikanAgenda) -> tuple[bytes, int]:
    included = [
        person
        for person in agenda.people
        if person.selected and not _is_pendamping(person)
    ]
    if not included:
        raise ValueError("Pilih setidaknya satu pegawai untuk membuat ND.")

    invalid = [
        person
        for person in included
        if person.lookup_status != "matched"
        or person.modality not in {"daring", "luring"}
        or not person.unit_eselon_ii.strip()
    ]
    if invalid:
        raise ValueError(
            "Setiap pegawai terpilih harus cocok dengan database, memiliki Unit Eselon II, "
            "dan memiliki pilihan Daring atau Luring."
        )

    grouped: dict[tuple[str, str], list[PelantikanAgendaPerson]] = {}
    display_names: dict[tuple[str, str], str] = {}
    for person in sorted(included, key=lambda item: item.row_number):
        unit_name = person.unit_eselon_ii.strip()
        modality = person.modality
        key = (unit_name.casefold(), modality)
        grouped.setdefault(key, []).append(person)
        display_names.setdefault(key, unit_name)

    output = BytesIO()
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for index, (key, people) in enumerate(grouped.items(), start=1):
            unit_name = display_names[key]
            modality = key[1]
            document = build_agenda_docx(agenda, people, modality, unit_name)
            mode_label = "daring" if modality == "daring" else "luring"
            entry_name = (
                f"{index:02d}_{_safe_filename(unit_name)}_{mode_label}.docx"
            )
            archive.writestr(entry_name, document)

    agenda.last_generated_at = datetime.now(timezone.utc)
    agenda.status = "generated"
    db.commit()
    return output.getvalue(), len(grouped)
