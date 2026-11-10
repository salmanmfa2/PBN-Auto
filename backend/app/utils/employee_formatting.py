import re


def format_formal_unit_name(unit_name: str) -> str:
    normalized = re.sub(r"\s+", " ", unit_name).strip()
    kanwil = re.fullmatch(
        r"(?:Kanwil|Kantor Wilayah)\s+DJPb\s+Prov(?:insi)?\.?\s+(.+)",
        normalized,
        flags=re.IGNORECASE,
    )
    if kanwil:
        return (
            "Kantor Wilayah Direktorat Jenderal Perbendaharaan "
            f"Provinsi {kanwil.group(1).strip()}"
        )
    return normalized


def needs_unit_suffix(eselon: str | None) -> bool:
    value = (eselon or "").strip()
    if not value:
        return False
    if re.fullmatch(r"\d+\.0+", value):
        value = value[: value.index(".")]
    normalized = "".join(character for character in value.casefold() if character.isalnum())
    return normalized not in {"2", "ii", "eselon2", "eselonii"}


def format_job_with_unit(jabatan: str, unit_eselon_ii: str, eselon: str | None) -> str:
    job = jabatan.strip()
    unit = unit_eselon_ii.strip()
    if not job or not unit or not needs_unit_suffix(eselon):
        return job
    return f"{job} {format_formal_unit_name(unit)}"
