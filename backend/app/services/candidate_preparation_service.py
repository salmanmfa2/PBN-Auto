from datetime import date, datetime
from io import BytesIO
import math
from pathlib import Path
import re

from sqlalchemy import bindparam, text
from sqlalchemy.engine import Engine
from pptx import Presentation
from pptx.shapes.base import BaseShape
from pptx.slide import Slide

from app.history_db import engine
from app.services.powerpoint_service import _duplicate_slide


ALLOWED_ESELON_IDS = frozenset({2, 3, 4, 6})
TEMPLATE_DIRECTORY = Path(__file__).resolve().parents[2] / "templates" / "profile"
SINGLE_TEMPLATE_PATH = TEMPLATE_DIRECTORY / "profile_template_single.pptx"
BATCH_TEMPLATE_PATH = TEMPLATE_DIRECTORY / "profile_template_batch.pptx"
POWERPOINT_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
)

BATCH_PROFILE_SHAPES = (
    {
        "nama": 39,
        "nip": 40,
        "jabatan": 41,
        "masa_kerja": 44,
        "pendidikan_pertimbangan": 48,
        "pangkat_gol": 73,
        "usia": 79,
        "nomor": 80,
    },
    {
        "nama": 82,
        "nip": 83,
        "jabatan": 84,
        "masa_kerja": 88,
        "pendidikan_pertimbangan": 89,
        "pangkat_gol": 93,
        "usia": 98,
        "nomor": 99,
    },
)


def fetch_employee_profiles(
    employee_ids: list[int],
    *,
    include_history: bool = False,
    database_engine: Engine | None = None,
) -> dict[int, dict[str, object]]:
    requested_ids = sorted({int(employee_id) for employee_id in employee_ids})
    if not requested_ids:
        return {}

    history_selection = (
        "history.`Jabatan` AS riwayat_jabatan"
        if include_history
        else "NULL AS riwayat_jabatan"
    )
    history_join = (
        """
        LEFT JOIN pbncleaner.ref_history_jabatan AS history
          ON history.`nip` = employee.`NIP`
        """
        if include_history
        else ""
    )
    statement = text(
        f"""
        SELECT employee.`employee_id`,
               employee.`NIP` AS nip,
               employee.`Nama Gelar` AS nama,
               employee.`eselon_id`,
               eselon_ref.`value` AS eselon,
               employee.`Jabatan` AS jabatan,
               employee.`Unit Eselon II` AS unit_eselon_ii,
               employee.`Unit Eselon III` AS unit_eselon_iii,
               employee.`Gol` AS gol,
               pangkat_ref.`value` AS pangkat,
               pendidikan_ref.`value` AS pendidikan,
               employee.`Jurusan` AS jurusan,
               employee.`Universitas/Sekolah Tinggi` AS universitas,
               employee.`TMT Jabatan` AS tmt_jabatan,
               employee.`Tanggal Lahir` AS tanggal_lahir,
               {history_selection}
        FROM pbncleaner.dt_employee AS employee
        LEFT JOIN pbncleaner.ref_eselon AS eselon_ref
          ON employee.`eselon_id` = eselon_ref.`eselon_id`
        LEFT JOIN pbncleaner.ref_pangkat AS pangkat_ref
          ON employee.`pangkat_id` = pangkat_ref.`pangkat_id`
        LEFT JOIN pbncleaner.ref_pendidikan_terakhir AS pendidikan_ref
          ON employee.`pendidikan_id` = pendidikan_ref.`pendidikan_id`
        {history_join}
        WHERE employee.`employee_id` IN :employee_ids
        """
    ).bindparams(bindparam("employee_ids", expanding=True))

    selected_engine = database_engine or engine
    with selected_engine.connect() as connection:
        rows = connection.execute(
            statement,
            {"employee_ids": requested_ids},
        ).mappings().all()

    profiles: dict[int, dict[str, object]] = {}
    for row in rows:
        employee_id = int(row["employee_id"])
        try:
            eselon_id = int(row["eselon_id"]) if row["eselon_id"] is not None else None
        except (TypeError, ValueError):
            eselon_id = None
        profiles[employee_id] = {
            "employee_id": employee_id,
            "nip": _display_text(row["nip"]),
            "nama": _display_text(row["nama"]),
            "eselon_id": eselon_id,
            "eselon": _display_text(row["eselon"]),
            "jabatan": _display_text(row["jabatan"]),
            "unit_eselon_ii": _display_text(row["unit_eselon_ii"]),
            "unit_eselon_iii": _display_text(row["unit_eselon_iii"]),
            "gol": _display_text(row["gol"]),
            "pangkat": _display_text(row["pangkat"]),
            "pendidikan": _display_text(row["pendidikan"]),
            "jurusan": _display_text(row["jurusan"]),
            "universitas": _display_text(row["universitas"]),
            "tmt_jabatan": row["tmt_jabatan"],
            "tanggal_lahir": row["tanggal_lahir"],
            "riwayat_jabatan": row["riwayat_jabatan"],
        }
    return profiles


def _display_text(value: object) -> str:
    return "" if value is None else str(value).strip()


def history_jabatan_entries(value: object) -> list[str]:
    if value is None:
        return []
    return [
        line
        for line in re.split(r"\r\n|\r|\n", str(value))
        if line.strip()
    ][:3]


def format_duration_since(value: object, today: date | None = None) -> str | None:
    start = _parse_date(value)
    if start is None:
        return None

    end = today or date.today()
    if start > end:
        return "0 Tahun 0 Bulan"

    months = (end.year - start.year) * 12 + end.month - start.month
    if end.day < min(start.day, _last_day_of_month(end.year, end.month)):
        months -= 1
    months = max(months, 0)
    return f"{months // 12} Tahun {months % 12} Bulan"


def _last_day_of_month(year: int, month: int) -> int:
    if month == 12:
        return 31
    return (date(year, month + 1, 1) - date.resolution).day


def _parse_date(value: object) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        return None

    normalized = value.strip()
    if not normalized:
        return None
    try:
        return datetime.fromisoformat(normalized.replace("Z", "+00:00")).date()
    except ValueError:
        pass
    for date_format in (
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%Y/%m/%d",
        "%d.%m.%Y",
    ):
        try:
            return datetime.strptime(normalized, date_format).date()
        except ValueError:
            continue
    return None


def build_single_profile(
    target_jabatan: str,
    candidate: dict[str, object],
    *,
    today: date | None = None,
    template_path: Path | None = None,
) -> bytes:
    selected_template = template_path or SINGLE_TEMPLATE_PATH
    if not selected_template.is_file():
        raise FileNotFoundError(f"Single profile template not found: {selected_template}")

    presentation = Presentation(str(selected_template))
    _fill_single_profile(presentation.slides[0], target_jabatan, candidate)

    output = BytesIO()
    presentation.save(output)
    return output.getvalue()


def build_single_profiles(
    target_jabatan: str,
    candidates: list[dict[str, object]],
    *,
    today: date | None = None,
    template_path: Path | None = None,
) -> bytes:
    if not candidates:
        raise ValueError("Select at least one candidate before exporting.")

    selected_template = template_path or SINGLE_TEMPLATE_PATH
    if not selected_template.is_file():
        raise FileNotFoundError(f"Single profile template not found: {selected_template}")

    presentation = Presentation(str(selected_template))
    template_slide = presentation.slides[0]
    slides = [template_slide]
    while len(slides) < len(candidates):
        slides.append(_duplicate_slide(presentation, template_slide))

    for slide, candidate in zip(slides, candidates):
        _fill_single_profile(slide, target_jabatan, candidate)

    output = BytesIO()
    presentation.save(output)
    return output.getvalue()


def _fill_single_profile(
    slide: Slide,
    target_jabatan: str,
    candidate: dict[str, object],
) -> None:
    _set_shape_text(
        slide,
        8,
        f"Kandidat Pengisian Jabatan pada {target_jabatan}",
    )
    _set_shape_text(slide, 11, _display_text(candidate.get("nama")) or "—")
    _set_shape_text(slide, 12, _single_position_details(candidate))
    _set_shape_text(slide, 13, _display_text(candidate.get("gol")) or "—")
    _set_shape_text(slide, 17, _education_summary(candidate))
    _set_shape_text(
        slide,
        20,
        _display_text(candidate.get("consideration")),
    )
    history = "\n".join(history_jabatan_entries(candidate.get("riwayat_jabatan")))
    _set_shape_text(slide, 22, history or "—")


def build_batch_profiles(
    target_jabatan: str,
    candidates: list[dict[str, object]],
    *,
    today: date | None = None,
    template_path: Path | None = None,
) -> bytes:
    if not candidates:
        raise ValueError("Select at least one candidate before exporting.")

    selected_template = template_path or BATCH_TEMPLATE_PATH
    if not selected_template.is_file():
        raise FileNotFoundError(f"Batch profile template not found: {selected_template}")

    presentation = Presentation(str(selected_template))
    template_slide = presentation.slides[0]
    slide_count = math.ceil(len(candidates) / len(BATCH_PROFILE_SHAPES))
    slides = [template_slide]
    while len(slides) < slide_count:
        slides.append(_duplicate_slide(presentation, template_slide))

    for slide_index, slide in enumerate(slides):
        _set_shape_text(
            slide,
            8,
            f"Kandidat Pengisian Jabatan pada {target_jabatan}",
        )
        for profile_index, shape_ids in enumerate(BATCH_PROFILE_SHAPES):
            candidate_index = (
                slide_index * len(BATCH_PROFILE_SHAPES) + profile_index
            )
            candidate = (
                candidates[candidate_index]
                if candidate_index < len(candidates)
                else None
            )
            _fill_batch_profile(
                slide,
                shape_ids,
                candidate,
                profile_index + 1,
                today,
            )

    output = BytesIO()
    presentation.save(output)
    return output.getvalue()


def _single_position_details(candidate: dict[str, object]) -> str:
    eselon_id = candidate.get("eselon_id")
    jabatan = _display_text(candidate.get("jabatan")) or "—"
    if eselon_id in {4, 6}:
        return "\n".join(
            (
                jabatan,
                f"Unit Eselon III: {_display_text(candidate.get('unit_eselon_iii')) or '—'}",
                f"Unit Eselon II: {_display_text(candidate.get('unit_eselon_ii')) or '—'}",
            )
        )
    if eselon_id == 3:
        return "\n".join(
            (
                jabatan,
                f"Unit Eselon II: {_display_text(candidate.get('unit_eselon_ii')) or '—'}",
            )
        )
    return jabatan


def _education_summary(candidate: dict[str, object]) -> str:
    return " · ".join(
        value
        for value in (
            _display_text(candidate.get("pendidikan")),
            _display_text(candidate.get("jurusan")),
            _display_text(candidate.get("universitas")),
        )
        if value
    ) or "—"


def _fill_batch_profile(
    slide: Slide,
    shape_ids: dict[str, int],
    candidate: dict[str, object] | None,
    profile_number: int,
    today: date | None,
) -> None:
    if candidate is None:
        for key in (
            "nama",
            "nip",
            "jabatan",
            "masa_kerja",
            "pangkat_gol",
            "usia",
        ):
            _set_shape_text(slide, shape_ids[key], "")
        _set_education_consideration_text(
            _get_shape(slide, shape_ids["pendidikan_pertimbangan"]),
            "",
            "",
        )
        _set_shape_text(slide, shape_ids["nomor"], "")
        return

    _set_shape_text(
        slide,
        shape_ids["nama"],
        _display_text(candidate.get("nama")) or "—",
    )
    _set_shape_text(slide, shape_ids["nip"], _display_text(candidate.get("nip")) or "—")
    jabatan = _display_text(candidate.get("jabatan")) or "—"
    tenure = format_duration_since(candidate.get("tmt_jabatan"), today)
    _set_shape_text(
        slide,
        shape_ids["jabatan"],
        jabatan,
    )
    _set_shape_text(
        slide,
        shape_ids["masa_kerja"],
        f"Masa Kerja: {tenure or '—'}",
    )
    pangkat = _display_text(candidate.get("pangkat"))
    gol = _display_text(candidate.get("gol"))
    _set_shape_text(
        slide,
        shape_ids["pangkat_gol"],
        " · ".join(value for value in (pangkat, gol) if value) or "—",
    )
    age = format_duration_since(candidate.get("tanggal_lahir"), today)
    _set_shape_text(slide, shape_ids["usia"], age or "—")
    _set_education_consideration_text(
        _get_shape(slide, shape_ids["pendidikan_pertimbangan"]),
        _education_summary(candidate),
        _display_text(candidate.get("consideration")),
    )
    _set_shape_text(slide, shape_ids["nomor"], str(profile_number))


def _set_education_consideration_text(
    shape: BaseShape,
    education: str,
    consideration: str,
) -> None:
    paragraphs = shape.text_frame.paragraphs if shape.has_text_frame else []
    if (
        len(paragraphs) >= 2
        and len(paragraphs[0].runs) >= 2
        and len(paragraphs[1].runs) >= 2
    ):
        paragraphs[0].runs[0].text = "Pendidikan: "
        paragraphs[0].runs[1].text = education
        paragraphs[1].runs[0].text = "Pertimbangan "
        paragraphs[1].runs[1].text = f": {consideration}"
        for paragraph in paragraphs:
            for run in list(paragraph.runs[2:]):
                run._r.getparent().remove(run._r)
        for paragraph in paragraphs[2:]:
            paragraph._p.getparent().remove(paragraph._p)
        return

    _set_shape_text(
        shape,
        f"Pendidikan: {education}\nPertimbangan: {consideration}",
    )


def _get_shape(slide: Slide, shape_id: int) -> BaseShape:
    shape = next(
        (item for item in _iter_slide_shapes(slide) if item.shape_id == shape_id),
        None,
    )
    if shape is None:
        raise ValueError(
            f"PowerPoint template is missing expected shape ID {shape_id}."
        )
    return shape


def _iter_slide_shapes(slide: Slide):
    for shape in slide.shapes:
        yield shape
        if getattr(shape, "shapes", None) is not None:
            yield from shape.shapes


def _set_shape_text(slide: Slide, shape_id: int, value: str) -> None:
    shape = _get_shape(slide, shape_id)
    if not shape.has_text_frame:
        raise ValueError(
            f"PowerPoint template shape ID {shape_id} has no text frame."
        )
    text_frame = shape.text_frame
    paragraphs = list(text_frame.paragraphs)
    if not paragraphs:
        text_frame.text = value
        return

    first_paragraph = paragraphs[0]
    first_run = first_paragraph.runs[0] if first_paragraph.runs else None
    if first_run is None:
        first_paragraph.text = value
    else:
        first_run.text = value
        for run in list(first_paragraph.runs[1:]):
            run._r.getparent().remove(run._r)
    for paragraph in paragraphs[1:]:
        paragraph._p.getparent().remove(paragraph._p)

