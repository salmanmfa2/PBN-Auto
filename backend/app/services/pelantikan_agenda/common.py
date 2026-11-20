"""Shared constants and helpers for Pelantikan Agenda workflows."""

import math
import re
from datetime import date
from numbers import Integral, Real
from pathlib import Path

import pandas as pd
from sqlalchemy import text

from app.history_db import engine
from app.models.pelantikan_agenda import PelantikanAgendaPerson
from app.utils.employee_formatting import format_job_with_unit

MAX_UPLOAD_SIZE = 50 * 1024 * 1024

ALLOWED_EXTENSIONS = {".xlsx", ".xls"}

SELECTABLE_LOOKUP_STATUSES = {"matched", "duplicate"}

TEMPLATE_DIRECTORY = (
    Path(__file__).resolve().parents[3] / "templates" / "undangan_pelantikan"
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


def _is_pendamping(person: PelantikanAgendaPerson) -> bool:
    return "pendamping" in _display_text(getattr(person, "source_no", None)).casefold()


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


__all__ = [
    "ALLOWED_EXTENSIONS",
    "INDONESIAN_MONTHS",
    "INDONESIAN_WEEKDAYS",
    "MAX_UPLOAD_SIZE",
    "NS",
    "SELECTABLE_LOOKUP_STATUSES",
    "TEMPLATE_DIRECTORY",
    "W",
    "W_NS",
    "XML_NS",
    "_display_source_value",
    "_display_text",
    "_extract_nip_from_name_nip",
    "_find_column",
    "_format_formal_recipient",
    "_format_job_with_unit",
    "_is_pendamping",
    "_kanwil_province",
    "_normalize_column_name",
    "_unit_reference_by_name",
    "_validate_unique_selected_nips",
    "engine",
    "format_indonesian_date",
    "normalize_nip",
]
