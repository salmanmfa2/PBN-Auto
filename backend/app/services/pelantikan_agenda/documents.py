"""DOCX template population and agenda document generation."""

from copy import deepcopy
from io import BytesIO
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import etree

from app.models.pelantikan_agenda import PelantikanAgenda, PelantikanAgendaPerson

from .common import (
    INDONESIAN_WEEKDAYS,
    NS,
    SELECTABLE_LOOKUP_STATUSES,
    TEMPLATE_DIRECTORY,
    W,
    XML_NS,
    _display_text,
    _format_formal_recipient,
    _format_job_with_unit,
    _is_pendamping,
    _normalize_column_name,
    _unit_reference_by_name,
    _validate_unique_selected_nips,
    format_indonesian_date,
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
