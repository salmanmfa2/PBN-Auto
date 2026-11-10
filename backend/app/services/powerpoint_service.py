from copy import deepcopy
from io import BytesIO
import posixpath
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote
from zipfile import BadZipFile, ZIP_DEFLATED, ZipFile

import pandas as pd
from pptx import Presentation
from pptx.enum.text import PP_ALIGN
from pptx.exc import PackageNotFoundError
from pptx.slide import Slide
from pptx.util import Pt
from lxml import etree

from app.services.dataset_service import filter_dataframe
from app.storage.dataset_store import DatasetStore


TEMPLATE_PATHS = {
    "Sitasi Es.III": Path(__file__).resolve().parents[2] / "templates" / "template.pptx",
    "Sitasi Es.III (3-row)": Path(__file__).resolve().parents[2] / "templates" / "template_3 Row.pptx",
    "Baperjakat": Path(__file__).resolve().parents[2] / "templates" / "combined_tempalate.pptx",
    "Sitasi Es.IV": Path(__file__).resolve().parents[2] / "templates" / "template_es4.pptx",
}

ESIII_COLUMN_ALIASES = (
    ("index", "no"),
    ("nama/nip",),
    ("usia (th)", "usia"),
    ("usia (bl)",),
    ("golongan", "pangkat/gol/tmt"),
    ("jabatan saat ini", "jabatan lama"),
    ("lama jab (th)",),
    ("lama jab (bl)",),
    ("jabatan baru",),
    ("keterangan",),
)

ESIV_COLUMN_ALIASES = (
    ("index", "no"),
    ("nama/nip",),
    ("usia",),
    ("golongan", "pangkat/gol/tmt", "gol"),
    ("jabatan saat ini", "jabatan lama"),
    ("tmt jabatan lama", "tmt (lama jab)", "tmt_jabatan_lama"),
    ("jabatan baru", "usul jabatan baru"),
    ("tour of area", "homebase, tour of area", "homebase_tour_of_area"),
)


def get_template_layout(mode: str, template_variant: str = "standard") -> dict[str, Any]:
    if template_variant not in {"standard", "three-row"}:
        raise ValueError(f"Unknown Sitasi Es.III PowerPoint template: {template_variant}.")
    if template_variant != "standard" and mode != "Sitasi Es.III":
        raise ValueError("The three-row PowerPoint template is available only for Sitasi Es.III.")

    if mode == "Sitasi Es.IV":
        return {
            "template_path": TEMPLATE_PATHS[mode],
            "header_rows": 1,
            "column_aliases": ESIV_COLUMN_ALIASES,
            "centered_columns": (2, 3, 5),
            "people_per_slide": 6,
        }
    if mode != "Sitasi Es.III":
        raise ValueError(f"PowerPoint profiles are not available for {mode}.")

    return {
        "template_path": (
            TEMPLATE_PATHS["Sitasi Es.III (3-row)"]
            if template_variant == "three-row"
            else TEMPLATE_PATHS["Sitasi Es.III"]
        ),
        "header_rows": 3,
        "column_aliases": ESIII_COLUMN_ALIASES,
        "centered_columns": (2, 3, 4, 6, 7),
        "people_per_slide": 0,
    }


def build_sitasi_profiles(
    dataset_id: str,
    sheet_name: str,
    mode: str,
    filters: dict[str, Any] | None = None,
    template_variant: str = "standard",
) -> bytes:
    if mode not in {"Sitasi Es.III", "Sitasi Es.IV"}:
        raise ValueError("PowerPoint profiles are available only for Sitasi Es.III and Sitasi Es.IV.")

    template_layout = get_template_layout(mode, template_variant)
    template_path = template_layout["template_path"]
    if not template_path.is_file():
        raise FileNotFoundError(f"PowerPoint template not found: {template_path}")

    sheets = DatasetStore.get(dataset_id)
    if sheets is None:
        raise KeyError(f"Dataset '{dataset_id}' not found. Please upload a file first.")
    if sheet_name not in sheets:
        raise KeyError(f"Sheet '{sheet_name}' not found.")

    dataframe = filter_dataframe(sheets[sheet_name], filters)
    if dataframe.empty:
        raise ValueError("There are no people to add to the PowerPoint.")

    records = dataframe.to_dict(orient="records")
    presentation = Presentation(str(template_path))
    template_slide = presentation.slides[0]
    template_table = _get_profile_table(template_slide)
    column_aliases = template_layout["column_aliases"]
    if len(template_table.columns) != len(column_aliases):
        raise ValueError(f"The PowerPoint template table must have exactly {len(column_aliases)} columns for {mode}.")

    header_rows = template_layout["header_rows"]
    people_per_slide = len(template_table.rows) - header_rows
    if people_per_slide < 1:
        raise ValueError("The PowerPoint template needs at least one data row after its headers.")

    for slide_number, start in enumerate(range(0, len(records), people_per_slide), start=1):
        slide = template_slide if slide_number == 1 else _duplicate_slide(presentation, template_slide)
        table = _get_profile_table(slide)
        _set_slide_number(slide, slide_number)
        for table_row in range(header_rows, len(table.rows)):
            record_index = start + table_row - header_rows
            values = _record_values(records[record_index], column_aliases) if record_index < len(records) else [""] * len(column_aliases)
            for column_index, value in enumerate(values):
                _set_cell_text(table.cell(table_row, column_index), value)
        _center_table_columns(table, template_layout["centered_columns"])

    output = BytesIO()
    presentation.save(output)
    return output.getvalue()


def build_baperjakat_profiles(
    dataset_id: str,
    sheet_name: str,
    filters: dict[str, Any] | None = None,
) -> bytes:
    template_path = TEMPLATE_PATHS["Baperjakat"]
    if not template_path.is_file():
        raise FileNotFoundError(f"PowerPoint template not found: {template_path}")

    sheets = DatasetStore.get(dataset_id)
    if sheets is None:
        raise KeyError(f"Dataset '{dataset_id}' not found. Please upload a file first.")
    if sheet_name not in sheets:
        raise KeyError(f"Sheet '{sheet_name}' not found.")

    source = sheets[sheet_name]
    category_column = next(
        (column for column in source.columns if str(column).strip().casefold() == "kategori"),
        None,
    )
    if category_column is None:
        raise ValueError("The selected sheet must contain a Kategori column.")

    filters_without_category = {
        column: values
        for column, values in (filters or {}).items()
        if str(column).strip().casefold() != "kategori"
    }
    dataframe = filter_dataframe(source, filters_without_category)
    categories = dataframe[category_column].map(
        lambda value: "" if value is None or pd.isna(value) else str(value).strip().casefold()
    )
    mutasi_records = dataframe.loc[categories == "mutasi"].to_dict(orient="records")
    promosi_records = dataframe.loc[categories == "promosi"].to_dict(orient="records")
    if not mutasi_records:
        raise ValueError("No Mutasi records match the selected filters.")
    if not promosi_records:
        raise ValueError("No Promosi records match the selected filters.")

    presentation = Presentation(str(template_path))
    if len(presentation.slides) != 2:
        raise ValueError("The combined Baperjakat template must contain exactly two starter slides.")

    category_specs = (
        (presentation.slides[0], mutasi_records, 4, "Mutasi", 1),
        (presentation.slides[1], promosi_records, 3, "Promosi", 2),
    )
    ordered_slides = []
    for template_slide, records, people_per_slide, category_name, initial_page_number in category_specs:
        category_number = 0
        table = _get_profile_table(template_slide)
        if len(table.columns) != len(ESIII_COLUMN_ALIASES):
            raise ValueError(
                f"The {category_name} Baperjakat template table must have exactly "
                f"{len(ESIII_COLUMN_ALIASES)} columns."
            )
        if len(table.rows) != 3 + people_per_slide:
            raise ValueError(
                f"The {category_name} Baperjakat template must have three header rows "
                f"and space for {people_per_slide} people."
            )

        for page_number, start in enumerate(range(0, len(records), people_per_slide), start=1):
            slide = (
                template_slide
                if page_number == 1
                else _duplicate_slide(presentation, template_slide)
            )
            table = _get_profile_table(slide)
            current_page_number = initial_page_number if page_number == 1 else 1
            _set_slide_number(slide, page_number, current_page_number)
            for table_row in range(3, len(table.rows)):
                record_index = start + table_row - 3
                if record_index >= len(records):
                    values = [""] * len(ESIII_COLUMN_ALIASES)
                    is_pendamping = False
                else:
                    record = records[record_index]
                    values = _record_values(record, ESIII_COLUMN_ALIASES)
                    original_number = next(
                        (
                            value
                            for column, value in record.items()
                            if str(column).strip().casefold() in {"index", "no"}
                        ),
                        None,
                    )
                    preserved_label = _display_value(original_number).strip().casefold()
                    is_pendamping = category_name == "Promosi" and preserved_label in {
                        "pendamping i",
                        "pendamping ii",
                    }
                    if is_pendamping:
                        values[0] = _display_value(original_number).strip()
                    else:
                        category_number += 1
                        values[0] = str(category_number)
                for column_index, value in enumerate(values):
                    cell = table.cell(table_row, column_index)
                    _set_cell_text(cell, value)
                    if is_pendamping and column_index == 0:
                        cell._tc.get_or_add_tcPr().set("vert", "vert270")
                    elif category_name == "Promosi" and column_index == 0:
                        cell._tc.get_or_add_tcPr().attrib.pop("vert", None)
            _center_table_columns(table, (2, 3, 4, 6, 7))
            ordered_slides.append(slide)

    _reorder_slides(presentation, ordered_slides)
    output = BytesIO()
    presentation.save(output)
    return output.getvalue()


def merge_sitasi_presentations(presentation_files: list[bytes]) -> bytes:
    if len(presentation_files) < 2:
        raise ValueError("Stage at least two PowerPoint files before combining them.")

    source_packages = []
    for index, content in enumerate(presentation_files, start=1):
        try:
            presentation = Presentation(BytesIO(content))
            archive = ZipFile(BytesIO(content))
            if archive.testzip() is not None:
                raise ValueError(f"Staged item {index} contains a corrupted PowerPoint part.")
        except (PackageNotFoundError, BadZipFile) as exc:
            raise ValueError(f"Staged item {index} is not a valid PowerPoint file.") from exc
        if not presentation.slides:
            raise ValueError(f"Staged item {index} does not contain any slides.")
        source_packages.append((archive, presentation))

    base_archive, base_presentation = source_packages[0]
    presentation_path = "ppt/presentation.xml"
    presentation_rels_path = "ppt/_rels/presentation.xml.rels"
    content_types_path = "[Content_Types].xml"
    rels_namespace = "http://schemas.openxmlformats.org/package/2006/relationships"
    content_types_namespace = "http://schemas.openxmlformats.org/package/2006/content-types"
    presentation_namespace = "http://schemas.openxmlformats.org/presentationml/2006/main"
    office_relationship_namespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

    base_presentation_xml = etree.fromstring(base_archive.read(presentation_path))
    base_relationships_xml = etree.fromstring(base_archive.read(presentation_rels_path))
    base_content_types_xml = etree.fromstring(base_archive.read(content_types_path))
    slide_id_list = base_presentation_xml.find(f"{{{presentation_namespace}}}sldIdLst")
    if slide_id_list is None:
        raise ValueError("The first staged PowerPoint has no slide list.")

    base_relationship_ids = [
        relationship.get("Id", "")
        for relationship in base_relationships_xml.findall(f"{{{rels_namespace}}}Relationship")
    ]
    relationship_number = max(
        (
            int(value[3:])
            for value in base_relationship_ids
            if value.startswith("rId") and value[3:].isdigit()
        ),
        default=0,
    )
    slide_id_number = max(
        (
            int(slide.get("id", "255"))
            for slide in slide_id_list.findall(f"{{{presentation_namespace}}}sldId")
        ),
        default=255,
    )
    content_type_defaults = {
        item.get("Extension"): item.get("ContentType")
        for item in base_content_types_xml.findall(f"{{{content_types_namespace}}}Default")
    }

    added_parts: list[tuple[str, bytes]] = []
    for package_index, (archive, presentation) in enumerate(source_packages[1:], start=2):
        source_names = [
            name
            for name in archive.namelist()
            if not name.endswith("/")
            and name not in {content_types_path, "_rels/.rels"}
        ]
        part_mapping = {
            name: f"ppt/staged_{package_index}/{name}"
            for name in source_names
        }

        source_content_types = etree.fromstring(archive.read(content_types_path))
        for item in source_content_types.findall(f"{{{content_types_namespace}}}Default"):
            extension = item.get("Extension")
            content_type = item.get("ContentType")
            existing_type = content_type_defaults.get(extension)
            if existing_type is not None and existing_type != content_type:
                raise ValueError(f"Staged item {package_index} uses a conflicting .{extension} file type.")
            if existing_type is None:
                content_type_defaults[extension] = content_type
                base_content_types_xml.append(
                    etree.Element(f"{{{content_types_namespace}}}Default", item.attrib)
                )

        for item in source_content_types.findall(f"{{{content_types_namespace}}}Override"):
            source_part = item.get("PartName", "").lstrip("/")
            destination_part = part_mapping.get(source_part)
            if destination_part is None:
                continue
            base_content_types_xml.append(
                etree.Element(
                    f"{{{content_types_namespace}}}Override",
                    {
                        "PartName": f"/{destination_part}",
                        "ContentType": item.get("ContentType", ""),
                    },
                )
            )

        for source_name in source_names:
            content = archive.read(source_name)
            if source_name.endswith(".rels"):
                relationships_xml = etree.fromstring(content)
                owner_name = _relationship_owner(source_name)
                destination_owner = part_mapping.get(owner_name)
                if destination_owner is None:
                    continue
                owner_directory = posixpath.dirname(owner_name)
                destination_directory = posixpath.dirname(destination_owner)
                for relationship in relationships_xml.findall(f"{{{rels_namespace}}}Relationship"):
                    if relationship.get("TargetMode") == "External":
                        continue
                    target = unquote(relationship.get("Target", ""))
                    source_target = posixpath.normpath(
                        target.lstrip("/")
                        if target.startswith("/")
                        else posixpath.join(owner_directory, target)
                    )
                    destination_target = part_mapping.get(source_target)
                    if destination_target is not None:
                        relationship.set(
                            "Target",
                            quote(
                                posixpath.relpath(destination_target, destination_directory),
                                safe="/._-",
                            ),
                        )
                content = etree.tostring(
                    relationships_xml,
                    xml_declaration=True,
                    encoding="UTF-8",
                    standalone=True,
                )
            added_parts.append((part_mapping[source_name], content))

        for slide in presentation.slides:
            source_slide = str(slide.part.partname).lstrip("/")
            destination_slide = part_mapping.get(source_slide)
            if destination_slide is None:
                raise ValueError(f"Staged item {package_index} has an unsupported slide part.")

            relationship_number += 1
            slide_id_number += 1
            relationship_id = f"rId{relationship_number}"
            etree.SubElement(
                base_relationships_xml,
                f"{{{rels_namespace}}}Relationship",
                {
                    "Id": relationship_id,
                    "Type": f"{office_relationship_namespace}/slide",
                    "Target": posixpath.relpath(destination_slide, "ppt"),
                },
            )
            etree.SubElement(
                slide_id_list,
                f"{{{presentation_namespace}}}sldId",
                {
                    "id": str(slide_id_number),
                    f"{{{office_relationship_namespace}}}id": relationship_id,
                },
            )

    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as merged_archive:
        for item in base_archive.infolist():
            if item.filename == presentation_path:
                content = etree.tostring(
                    base_presentation_xml,
                    xml_declaration=True,
                    encoding="UTF-8",
                    standalone=True,
                )
            elif item.filename == presentation_rels_path:
                content = etree.tostring(
                    base_relationships_xml,
                    xml_declaration=True,
                    encoding="UTF-8",
                    standalone=True,
                )
            elif item.filename == content_types_path:
                content = etree.tostring(
                    base_content_types_xml,
                    xml_declaration=True,
                    encoding="UTF-8",
                    standalone=True,
                )
            else:
                content = base_archive.read(item.filename)
            merged_archive.writestr(item, content)
        for part_name, content in added_parts:
            merged_archive.writestr(part_name, content)

    for archive, _ in source_packages:
        archive.close()
    return output.getvalue()


def _relationship_owner(rels_path: str) -> str:
    directory, filename = posixpath.split(rels_path)
    if not directory.endswith("/_rels") or not filename.endswith(".rels"):
        raise ValueError(f"Invalid PowerPoint relationship part: {rels_path}")
    owner_directory = directory[: -len("/_rels")]
    return posixpath.join(owner_directory, filename[: -len(".rels")])


def _get_profile_table(slide: Slide):
    tables = [shape.table for shape in slide.shapes if shape.has_table]
    if len(tables) != 1:
        raise ValueError("The PowerPoint template must contain exactly one table per slide.")
    return tables[0]


def _record_values(record: dict[str, Any], column_aliases: tuple[tuple[str, ...], ...]) -> list[str]:
    columns = {str(name).strip().casefold(): value for name, value in record.items()}
    return [
        _display_value(next((columns[name] for name in names if name in columns), None))
        for names in column_aliases
    ]


def _display_value(value: Any) -> str:
    if value is None or pd.isna(value):
        return ""
    return str(value)


def _set_cell_text(cell, value: str) -> None:
    cell.text = value
    for paragraph in cell.text_frame.paragraphs:
        for run in paragraph.runs:
            run.font.size = Pt(10)


def _center_table_columns(table, column_indices: tuple[int, ...]) -> None:
    for row in table.rows:
        for column_index in column_indices:
            for paragraph in row.cells[column_index].text_frame.paragraphs:
                paragraph.alignment = PP_ALIGN.CENTER


def _set_slide_number(slide: Slide, page_number: int, current_page_number: int = 1) -> None:
    for shape in slide.shapes:
        if shape.has_text_frame and shape.text.strip() == str(current_page_number):
            paragraph = shape.text_frame.paragraphs[0]
            if paragraph.runs:
                paragraph.runs[0].text = str(page_number)
            else:
                paragraph.text = str(page_number)
            return


def _duplicate_slide(presentation: Presentation, source_slide: Slide) -> Slide:
    new_slide = presentation.slides.add_slide(source_slide.slide_layout)
    new_tree = new_slide.shapes._spTree
    for shape in list(new_slide.shapes):
        new_tree.remove(shape.element)

    source_tree = source_slide.shapes._spTree
    for element in list(source_tree)[2:]:
        new_tree.insert_element_before(deepcopy(element), "p:extLst")
    return new_slide


def _reorder_slides(presentation: Presentation, ordered_slides: list[Slide]) -> None:
    slide_id_list = presentation.slides._sldIdLst
    slide_ids_by_part = {
        presentation.part.related_part(slide_id.rId): slide_id
        for slide_id in slide_id_list
    }
    ordered_slide_ids = [slide_ids_by_part[slide.part] for slide in ordered_slides]
    for slide_id in list(slide_id_list):
        slide_id_list.remove(slide_id)
    for slide_id in ordered_slide_ids:
        slide_id_list.append(slide_id)