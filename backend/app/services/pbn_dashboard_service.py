from collections import Counter
from datetime import date, datetime, timedelta
import math
from numbers import Real
from typing import Any

import pandas as pd
from sqlalchemy.exc import SQLAlchemyError

from app.history_db import engine
from app.storage.dataset_store import DatasetStore



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

AGE_GROUPS = ("<20 Th", "20 - 30 Th", "31 - 40 Th", "41 - 50 Th", "51+ Th", "Tidak diketahui")


def _normalize_column_name(value: Any) -> str:
    return "".join(character for character in str(value).casefold() if character.isalnum())


def _resolve_columns(dataframe: pd.DataFrame) -> dict[str, Any]:
    actual_columns = {_normalize_column_name(column): column for column in dataframe.columns}
    resolved: dict[str, Any] = {}
    missing = []
    for key, aliases in COLUMN_ALIASES.items():
        column = next(
            (actual_columns[_normalize_column_name(alias)] for alias in aliases
             if _normalize_column_name(alias) in actual_columns),
            None,
        )
        if column is None:
            missing.append(aliases[0])
        else:
            resolved[key] = column
    if missing:
        raise ValueError(f"Dashboard requires these columns: {', '.join(missing)}.")
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
    filters: Any,
    today: date | None = None,
) -> tuple[pd.DataFrame, dict[str, Any], pd.Series, dict[str, int], dict[str, int], str]:
    sheets = DatasetStore.get(dataset_id)
    if sheets is None:
        raise KeyError(f"Dataset '{dataset_id}' not found. Please upload a file first.")
    if sheet_name is None:
        sheet_name = next(iter(sheets))
    if sheet_name not in sheets:
        raise KeyError(f"Sheet '{sheet_name}' not found.")

    source = sheets[sheet_name]
    return _filter_dashboard_data(source, filters, sheet_name, today)


def _load_pbnopen_source() -> pd.DataFrame:
    try:
        return pd.read_sql_table("fetch_pbnopen", engine, schema="pbncleaner")
    except (SQLAlchemyError, ValueError) as exc:
        raise RuntimeError(
            "Could not read database table 'pbncleaner.fetch_pbnopen'. "
            "Check database connectivity and table availability."
        ) from exc


def _filter_dashboard_data(
    source: pd.DataFrame,
    filters: Any,
    sheet_name: str,
    today: date | None = None,
) -> tuple[pd.DataFrame, dict[str, Any], pd.Series, dict[str, int], dict[str, int], str]:
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

    return source, columns, ages, age_range, tenure_range, sheet_name


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
    filters: Any,
    today: date | None = None,
) -> dict[str, Any]:
    source, columns, ages, age_range, tenure_range, sheet_name = _get_filtered_dashboard_data(
        dataset_id, sheet_name, filters, today
    )
    stored_sheets = DatasetStore.get(dataset_id)
    if stored_sheets is None:
        raise KeyError(f"Dataset '{dataset_id}' not found. Please upload a file first.")
    original_source = stored_sheets[sheet_name]
    return _build_dashboard_result(
        source,
        original_source,
        columns,
        ages,
        age_range,
        tenure_range,
        dataset_id,
        sheet_name,
    )


def build_pbnopen_dashboard(
    filters: Any,
    today: date | None = None,
) -> dict[str, Any]:
    original_source = _load_pbnopen_source()
    source, columns, ages, age_range, tenure_range, sheet_name = _filter_dashboard_data(
        original_source,
        filters,
        "fetch_pbnopen",
        today,
    )
    return _build_dashboard_result(
        source,
        original_source,
        columns,
        ages,
        age_range,
        tenure_range,
        "pbncleaner.fetch_pbnopen",
        sheet_name,
    )


def _build_dashboard_result(
    source: pd.DataFrame,
    original_source: pd.DataFrame,
    columns: dict[str, Any],
    ages: pd.Series,
    age_range: dict[str, int],
    tenure_range: dict[str, int],
    dataset_id: str,
    sheet_name: str,
) -> dict[str, Any]:
    total = len(source)
    age_counts = Counter(_age_group(value) for value in ages.tolist())
    age_distribution = [
        {
            "label": group,
            "count": age_counts.get(group, 0),
            "percentage": round(age_counts.get(group, 0) * 100 / total, 1) if total else 0,
        }
        for group in AGE_GROUPS
    ]

    return {
        "dataset_id": dataset_id,
        "sheet_name": sheet_name,
        "total_employees": total,
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
            "age": age_range,
            "tenure": tenure_range,
            "eselon": _available_values(original_source, columns["eselon"]),
            "education": _available_values(original_source, columns["education"]),
            "region": _available_values(original_source, columns["region"]),
            "unit": _available_values(original_source, columns["unit"]),
            "rumpun": _available_values(original_source, columns["education_group"]),
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
}


def _resolve_people_columns(source: pd.DataFrame) -> dict[str, Any]:
    actual_columns = {_normalize_column_name(column): column for column in source.columns}
    resolved = {}
    missing = []
    for output_name, aliases in PEOPLE_COLUMN_ALIASES.items():
        column = next(
            (
                actual_columns[_normalize_column_name(alias)]
                for alias in aliases
                if _normalize_column_name(alias) in actual_columns
            ),
            None,
        )
        if column is None:
            missing.append(output_name)
        else:
            resolved[output_name] = column
    if missing:
        raise ValueError(f"People table requires these columns: {', '.join(missing)}.")
    return resolved


def get_pbn_dashboard_people(
    dataset_id: str,
    sheet_name: str | None,
    filters: Any,
    today: date | None = None,
) -> dict[str, Any]:
    source, _, _, _, _, sheet_name = _get_filtered_dashboard_data(
        dataset_id, sheet_name, filters, today
    )
    return _build_dashboard_people_result(source, dataset_id, sheet_name)


def get_pbnopen_dashboard_people(
    filters: Any,
    today: date | None = None,
) -> dict[str, Any]:
    original_source = _load_pbnopen_source()
    source, _, _, _, _, sheet_name = _filter_dashboard_data(
        original_source,
        filters,
        "fetch_pbnopen",
        today,
    )
    return _build_dashboard_people_result(source, "pbncleaner.fetch_pbnopen", sheet_name)


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
