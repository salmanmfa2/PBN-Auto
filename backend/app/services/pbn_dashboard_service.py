from collections import Counter
from collections.abc import Mapping
from datetime import date, datetime, timedelta
import math
from numbers import Real
from typing import Any, NamedTuple

import pandas as pd

from app.repositories import pbn_dashboard_repository
from app.schemas.pbn_dashboard import PbnDashboardFilters



COLUMN_ALIASES = {
    "sex": ("sex", "jenis kelamin"),
    "age": ("usia (th.)", "usia (th)", "usia"),
    "tmt_jabatan": ("tmt jabatan",),
    "eselon": ("eselon",),
    "education": ("pendidikan terakhir (short)",),
    "education_group": ("rumpun pdd terakhir", "rumpun"),
    "region": ("region homebase",),
    "unit": ("unit eselon ii",),
    "religion": ("agama",),
}

RETIREMENT_60_ESELON_IDS = frozenset({2, 11})

AGE_GROUPS = ("<20 Th", "20 - 30 Th", "31 - 40 Th", "41 - 50 Th", "51+ Th", "Tidak diketahui")


class FilteredDashboardData(NamedTuple):
    source: pd.DataFrame
    original_source: pd.DataFrame
    columns: dict[str, Any]
    ages: pd.Series
    age_range: dict[str, int]
    tenure_range: dict[str, int]
    sheet_name: str


def _normalize_column_name(value: Any) -> str:
    return "".join(character for character in str(value).casefold() if character.isalnum())


def _resolve_alias_columns(
    dataframe: pd.DataFrame,
    aliases_by_name: Mapping[str, tuple[str, ...]],
) -> tuple[dict[str, Any], list[str]]:
    actual_columns = {_normalize_column_name(column): column for column in dataframe.columns}
    resolved: dict[str, Any] = {}
    missing = []
    for key, aliases in aliases_by_name.items():
        column = next(
            (
                actual_columns[normalized_alias]
                for alias in aliases
                if (normalized_alias := _normalize_column_name(alias)) in actual_columns
            ),
            None,
        )
        if column is None:
            missing.append(key)
        else:
            resolved[key] = column
    return resolved, missing


def _resolve_columns(dataframe: pd.DataFrame) -> dict[str, Any]:
    resolved, missing = _resolve_alias_columns(dataframe, COLUMN_ALIASES)
    if missing:
        missing_aliases = [COLUMN_ALIASES[key][0] for key in missing]
        raise ValueError(
            f"Dashboard requires these columns: {', '.join(missing_aliases)}."
        )
    return resolved


def _numeric_range(values: pd.Series) -> dict[str, int]:
    valid = values.dropna()
    if valid.empty:
        return {"min": 0, "max": 0}
    return {"min": math.floor(float(valid.min())), "max": math.ceil(float(valid.max()))}


def _completed_tenure_years(values: pd.Series, today: date) -> pd.Series:
    def parse_date(value: Any) -> date | None:
        if value is None or pd.isna(value):
            return None
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        if isinstance(value, Real) and not isinstance(value, bool):
            if not 10_000 <= value <= 100_000:
                return None
            return (datetime(1899, 12, 30) + timedelta(days=float(value))).date()
        if isinstance(value, str):
            text = value.strip()
            if text.startswith("'"):
                text = text[1:].strip()
            if not text:
                return None
            try:
                return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
            except ValueError:
                for format_string in ("%d/%m/%Y", "%d-%m-%Y", "%Y%m%d"):
                    try:
                        return datetime.strptime(text, format_string).date()
                    except ValueError:
                        continue
        return None

    tenure_years = []
    for value in values:
        start_date = parse_date(value)
        if start_date is None:
            tenure_years.append(pd.NA)
            continue
        years = today.year - start_date.year
        anniversary_not_reached = (start_date.month, start_date.day) > (today.month, today.day)
        tenure_years.append(years - anniversary_not_reached)
    return pd.Series(tenure_years, index=values.index, dtype="Int64")


def _display_category(value: Any) -> str:
    if value is None or pd.isna(value):
        return "Tidak diketahui"
    text = str(value).strip()
    return text or "Tidak diketahui"


def _parse_birth_date(value: Any) -> date | None:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, Real) and not isinstance(value, bool):
        if not 10_000 <= value <= 100_000:
            return None
        return (datetime(1899, 12, 30) + timedelta(days=float(value))).date()
    if isinstance(value, str):
        text = value.strip()
        if text.startswith("'"):
            text = text[1:].strip()
        if not text:
            return None
        try:
            return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
        except ValueError:
            for format_string in ("%d/%m/%Y", "%d-%m-%Y", "%Y%m%d", "%Y/%m/%d"):
                try:
                    return datetime.strptime(text, format_string).date()
                except ValueError:
                    continue
    return None


def _add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, _last_day(year, month))
    return date(year, month, day)


def _last_day(year: int, month: int) -> int:
    if month == 12:
        return (date(year + 1, 1, 1) - timedelta(days=1)).day
    return (date(year, month + 1, 1) - timedelta(days=1)).day


def _count_nearing_retirement(source: pd.DataFrame, today: date) -> int:
    if "Tanggal Lahir" not in source.columns:
        return 0
    eselon_id_column = next(
        (
            column
            for column in source.columns
            if _normalize_column_name(column) == "eselonid"
        ),
        None,
    )
    eselon_label_column = next(
        (
            column
            for column in source.columns
            if _normalize_column_name(column) == "eselon"
        ),
        None,
    )
    if eselon_id_column is None and eselon_label_column is None:
        return 0
    three_month_end = _add_months(today, 3)
    count = 0
    for _, row in source.iterrows():
        birth_date = _parse_birth_date(row["Tanggal Lahir"])
        if birth_date is None:
            continue
        eselon_id = 0
        if eselon_id_column is not None:
            raw_eselon_id = row[eselon_id_column]
            try:
                eselon_id = int(raw_eselon_id)
            except (TypeError, ValueError):
                eselon_id = 0
        elif eselon_label_column is not None:
            label = _display_category(row[eselon_label_column]).casefold()
            if label in {"ii.a", "fungs. ahli madya"}:
                eselon_id = 2 if label == "ii.a" else 11
        retirement_age = 60 if eselon_id in RETIREMENT_60_ESELON_IDS else 58
        retirement_date = _add_months(birth_date, retirement_age * 12)
        if today < retirement_date <= three_month_end:
            count += 1
    return count


def _distribution(values: list[str], total: int) -> list[dict[str, Any]]:
    counts = Counter(values)
    return [
        {
            "label": label,
            "count": count,
            "percentage": round(count * 100 / total, 1) if total else 0,
        }
        for label, count in sorted(counts.items(), key=lambda item: (-item[1], item[0].casefold()))
    ]


def _age_group(value: Any) -> str:
    if pd.isna(value):
        return "Tidak diketahui"
    if value < 20:
        return "<20 Th"
    if value <= 30:
        return "20 - 30 Th"
    if value <= 40:
        return "31 - 40 Th"
    if value <= 50:
        return "41 - 50 Th"
    return "51+ Th"


def _get_filtered_dashboard_data(
    dataset_id: str,
    sheet_name: str | None,
    filters: PbnDashboardFilters,
    today: date | None = None,
) -> FilteredDashboardData:
    source, sheet_name = pbn_dashboard_repository.load_dataset_sheet(
        dataset_id,
        sheet_name,
    )
    return _filter_dashboard_data(source, filters, sheet_name, today)


def _filter_dashboard_data(
    source: pd.DataFrame,
    filters: PbnDashboardFilters,
    sheet_name: str,
    today: date | None = None,
) -> FilteredDashboardData:
    original_source = source
    columns = _resolve_columns(source)
    current_date = today or date.today()
    ages = pd.to_numeric(source[columns["age"]], errors="coerce")
    tenure = _completed_tenure_years(source[columns["tmt_jabatan"]], current_date)
    age_range = _numeric_range(ages)
    tenure_range = _numeric_range(tenure)

    if filters.age_min is not None or filters.age_max is not None:
        minimum = filters.age_min if filters.age_min is not None else age_range["min"]
        maximum = filters.age_max if filters.age_max is not None else age_range["max"]
        if minimum > maximum:
            raise ValueError("Age minimum cannot be greater than age maximum.")
        if minimum > age_range["min"] or maximum < age_range["max"]:
            source = source.loc[ages.notna() & ages.between(minimum, maximum)]
            ages = ages.loc[source.index]
            tenure = tenure.loc[source.index]

    if filters.tenure_min is not None or filters.tenure_max is not None:
        minimum = filters.tenure_min if filters.tenure_min is not None else tenure_range["min"]
        maximum = filters.tenure_max if filters.tenure_max is not None else tenure_range["max"]
        if minimum > maximum:
            raise ValueError("Tenure minimum cannot be greater than tenure maximum.")
        if minimum > tenure_range["min"] or maximum < tenure_range["max"]:
            source = source.loc[tenure.notna() & tenure.between(minimum, maximum)]
            ages = ages.loc[source.index]
            tenure = tenure.loc[source.index]

    categorical_filters = (
        ("eselon", filters.eselon),
        ("education", filters.education),
        ("region", filters.region),
        ("unit", filters.unit),
        ("education_group", filters.rumpun),
    )
    for column_key, selected_values in categorical_filters:
        if selected_values:
            values = source[columns[column_key]].map(_display_category)
            source = source.loc[values.isin(selected_values)]
            ages = ages.loc[source.index]
            tenure = tenure.loc[source.index]

    name_query = filters.name.strip().casefold()
    if name_query:
        name_columns, _ = _resolve_alias_columns(
            source,
            {
                "name": ("nama gelar", "nama", "nama/nip", "nama lengkap"),
            },
        )
        name_column = name_columns.get("name")
        if name_column is not None:
            names = source[name_column].map(
                lambda value: "" if value is None or pd.isna(value) else str(value).casefold()
            )
            escaped_query = name_query.replace("!", "!!").replace("%", "!%").replace("_", "!_")
            source = source.loc[names.str.contains(escaped_query, regex=False, na=False)]
            ages = ages.loc[source.index]
            tenure = tenure.loc[source.index]

    return FilteredDashboardData(
        source=source,
        original_source=original_source,
        columns=columns,
        ages=ages,
        age_range=age_range,
        tenure_range=tenure_range,
        sheet_name=sheet_name,
    )


def _available_values(source: pd.DataFrame, column: Any) -> list[str]:
    return sorted(
        {
            _display_category(value)
            for value in source[column]
            if _display_category(value) != "Tidak diketahui"
        },
        key=str.casefold,
    )


def build_pbn_dashboard(
    dataset_id: str,
    sheet_name: str | None,
    filters: PbnDashboardFilters,
    today: date | None = None,
) -> dict[str, Any]:
    data = _get_filtered_dashboard_data(
        dataset_id, sheet_name, filters, today
    )
    return _build_dashboard_result(data, dataset_id, today or date.today())


def build_pbnopen_dashboard(
    filters: PbnDashboardFilters,
    today: date | None = None,
) -> dict[str, Any]:
    source = pbn_dashboard_repository.load_pbnopen_source()
    data = _filter_dashboard_data(
        source,
        filters,
        "fetch_pbnopen",
        today,
    )
    return _build_dashboard_result(
        data,
        "pbncleaner.fetch_pbnopen",
        today or date.today(),
    )


def _build_dashboard_result(
    data: FilteredDashboardData,
    dataset_id: str,
    today: date | None = None,
) -> dict[str, Any]:
    source = data.source
    columns = data.columns
    total = len(source)
    age_counts = Counter(_age_group(value) for value in data.ages.tolist())
    age_distribution = [
        {
            "label": group,
            "count": age_counts.get(group, 0),
            "percentage": round(age_counts.get(group, 0) * 100 / total, 1) if total else 0,
        }
        for group in AGE_GROUPS
    ]

    retirement_count = 0
    if dataset_id == "pbncleaner.fetch_pbnopen":
        retirement_count = _count_nearing_retirement(
            data.source,
            today or date.today(),
        )

    return {
        "dataset_id": dataset_id,
        "sheet_name": data.sheet_name,
        "total_employees": total,
        "retirement_count": retirement_count,
        "sex_distribution": _distribution(
            source[columns["sex"]].map(_display_category).tolist(), total
        ),
        "age_group_distribution": age_distribution,
        "region_distribution": _distribution(
            source[columns["region"]].map(_display_category).tolist(), total
        ),
        "education_level_distribution": _distribution(
            source[columns["education"]].map(_display_category).tolist(), total
        ),
        "education_group_distribution": _distribution(
            source[columns["education_group"]].map(_display_category).tolist(), total
        ),
        "unit_distribution": _distribution(
            source[columns["unit"]].map(_display_category).tolist(), total
        ),
        "religion_distribution": _distribution(
            source[columns["religion"]].map(_display_category).tolist(), total
        ),
        "available_filters": {
            "age": data.age_range,
            "tenure": data.tenure_range,
            "eselon": _available_values(data.original_source, columns["eselon"]),
            "education": _available_values(data.original_source, columns["education"]),
            "region": _available_values(data.original_source, columns["region"]),
            "unit": _available_values(data.original_source, columns["unit"]),
            "rumpun": _available_values(
                data.original_source,
                columns["education_group"],
            ),
        },
    }


PEOPLE_COLUMN_ALIASES = {
    "Nama": ("nama", "nama gelar", "nama/nip", "nama lengkap"),
    "Eselon": ("eselon",),
    "Jabatan": ("jabatan", "jabatan saat ini", "jabatan lama"),
    "Pendidikan Terakhir (Th.)": (
        "pendidikan terakhir (th.)",
        "pendidikan terakhir",
        "pendidikan terakhir (short)",
    ),
    "Jurusan": ("jurusan",),
    "Universitas/Sekolah Tinggi": ("universitas/sekolah tinggi", "universitas"),
    "NIP": ("nip",),
    "Eselon ID": ("eselon_id", "eselon id"),
    "Gol": ("gol", "golongan"),
    "Pangkat": ("pangkat",),
    "Unit Eselon II": ("unit eselon ii",),
    "Unit Eselon III": ("unit eselon iii",),
    "Unit Eselon IV": ("unit eselon iv",),
    "Tanggal Lahir": ("tanggal lahir",),
    "Usia": ("usia (th.)", "usia (th)", "usia"),
    "Agama": ("agama",),
    "Sex": ("sex", "jenis kelamin"),
    "Region Homebase": ("region homebase", "region"),
    "Homebase": ("homebase",),
    "Rumpun Pendidikan": ("rumpun pdd terakhir", "rumpun", "rumpun pendidikan"),
}

PEOPLE_CORE_COLUMN_NAMES = (
    "Nama",
    "Eselon",
    "Jabatan",
    "Pendidikan Terakhir (Th.)",
    "Jurusan",
    "Universitas/Sekolah Tinggi",
)


def _resolve_people_columns(source: pd.DataFrame) -> dict[str, Any]:
    aliases = {
        name: aliases
        for name, aliases in PEOPLE_COLUMN_ALIASES.items()
        if name in PEOPLE_CORE_COLUMN_NAMES
    }
    resolved, missing = _resolve_alias_columns(source, aliases)
    if missing:
        raise ValueError(f"People table requires these columns: {', '.join(missing)}.")
    optional_aliases = {
        name: aliases
        for name, aliases in PEOPLE_COLUMN_ALIASES.items()
        if name not in PEOPLE_CORE_COLUMN_NAMES
    }
    optional_resolved, _ = _resolve_alias_columns(source, optional_aliases)
    resolved.update(optional_resolved)
    return resolved


def get_pbn_dashboard_people(
    dataset_id: str,
    sheet_name: str | None,
    filters: PbnDashboardFilters,
    today: date | None = None,
) -> dict[str, Any]:
    data = _get_filtered_dashboard_data(
        dataset_id, sheet_name, filters, today
    )
    return _build_dashboard_people_result(data.source, dataset_id, data.sheet_name)


def get_pbnopen_dashboard_people(
    filters: PbnDashboardFilters,
    today: date | None = None,
) -> dict[str, Any]:
    original_source = pbn_dashboard_repository.load_pbnopen_source()
    data = _filter_dashboard_data(
        original_source,
        filters,
        "fetch_pbnopen",
        today,
    )
    return _build_dashboard_people_result(
        data.source,
        "pbncleaner.fetch_pbnopen",
        data.sheet_name,
    )


def _build_dashboard_people_result(
    source: pd.DataFrame,
    dataset_id: str,
    sheet_name: str,
) -> dict[str, Any]:
    columns = _resolve_people_columns(source)
    people = []
    for row_number, (_, row) in enumerate(source.iterrows(), start=1):
        person = {"index": row_number}
        for output_name, source_column in columns.items():
            value = row[source_column]
            person[output_name] = None if value is None or pd.isna(value) else str(value)
        people.append(person)
    return {"dataset_id": dataset_id, "sheet_name": sheet_name, "people": people}
