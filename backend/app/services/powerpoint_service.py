from copy import deepcopy
from io import BytesIO
from pathlib import Path
from typing import Any

import pandas as pd
from pptx import Presentation
from pptx.slide import Slide
from pptx.util import Pt

from app.services.dataset_service import filter_dataframe
from app.storage.dataset_store import DatasetStore


TEMPLATE_PATHS = {
    "Sitasi Es.III": Path(__file__).resolve().parents[2] / "templates" / "template.pptx",
    "Sitasi Es.III (Lite)": Path(__file__).resolve().parents[2] / "templates" / "template.pptx",
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


def get_template_layout(mode: str) -> dict[str, Any]:
    if mode == "Sitasi Es.IV":
        return {
            "template_path": TEMPLATE_PATHS[mode],
            "header_rows": 1,
            "column_aliases": ESIV_COLUMN_ALIASES,
            "people_per_slide": 6,
        }
    return {
        "template_path": TEMPLATE_PATHS["Sitasi Es.III"],
        "header_rows": 3,
        "column_aliases": ESIII_COLUMN_ALIASES,
        "people_per_slide": 0,
    }


def build_sitasi_profiles(dataset_id: str, sheet_name: str, mode: str, filters: dict[str, Any] | None = None) -> bytes:
    if mode not in {"Sitasi Es.III", "Sitasi Es.III (Lite)", "Sitasi Es.IV"}:
        raise ValueError("PowerPoint profiles are available only for Sitasi Es.III, Sitasi Es.III (Lite), and Sitasi Es.IV.")

    template_layout = get_template_layout(mode)
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

    output = BytesIO()
    presentation.save(output)
    return output.getvalue()


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


def _set_slide_number(slide: Slide, page_number: int) -> None:
    for shape in slide.shapes:
        if shape.has_text_frame and shape.text.strip() == "1":
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