from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd

from app.storage.dataset_store import DatasetStore


VERIFICATION_DIR = Path(__file__).resolve().parents[2] / "templates" / "verification"
PBN_EXTRA_COLUMN_START = 55

VERIFICATION_TEMPLATES = {
    "PBN Open": "input_PBN Open.xlsx",
    "PBN Open + Edu + HB": "input_PBN Open + Edu+HB.xlsx",
    "Sitasi Es.III": "input_sitasi_esIII.xlsx",
    "Sitasi Es.IV": "input_sitasi_esIV.xlsx",
}

SITASI_HEADER_MARKERS = {
    "Sitasi Es.III": {"no", "namanip", "jpm", "tourOfArea".casefold(), "tourofduty"},
    "Sitasi Es.IV": {"no", "namanip", "pertimbangan", "agama"},
}


@dataclass(frozen=True)
class VerificationProfile:
    mode: str
    filename: str
    header_cells: tuple[tuple[int, str], ...]
    header_row: int
    extra_column_occupancy: tuple[float, ...] | None = None


def _normalize(value: Any) -> str:
    return "".join(character for character in str(value).casefold() if character.isalnum())


def _nonempty(value: Any) -> bool:
    if value is None or pd.isna(value):
        return False
    return bool(str(value).strip())


def _find_sitasi_header_row(frame: pd.DataFrame, mode: str) -> int:
    expected_markers = SITASI_HEADER_MARKERS[mode]
    for row_index, row in frame.iterrows():
        markers = {_normalize(value) for value in row.tolist() if _nonempty(value)}
        if expected_markers.issubset(markers):
            return int(row_index)
    raise ValueError(f"Could not find the {mode} header in its verification template.")


@lru_cache(maxsize=1)
def _load_verification_profiles() -> tuple[VerificationProfile, ...]:
    profiles = []
    for mode, filename in VERIFICATION_TEMPLATES.items():
        path = VERIFICATION_DIR / filename
        if not path.is_file():
            raise FileNotFoundError(f"Cleaning verification template is missing: {path}")

        raw_template = pd.read_excel(path, sheet_name=0, header=None, dtype=object)
        if mode.startswith("Sitasi"):
            header_row = _find_sitasi_header_row(raw_template, mode)
            source_row = raw_template.iloc[header_row]
            header_cells = tuple(
                (column_index, _normalize(value))
                for column_index, value in enumerate(source_row.tolist())
                if _nonempty(value)
            )
            occupancy = None
        else:
            header_row = 0
            reference_data = pd.read_excel(path, sheet_name=0, dtype=object)
            header_cells = tuple(
                (column_index, _normalize(value))
                for column_index, value in enumerate(raw_template.iloc[header_row].tolist())
                if _nonempty(value)
            )
            if mode.startswith("PBN"):
                extra_data = reference_data.iloc[:, PBN_EXTRA_COLUMN_START:]
                occupancy = tuple(
                    float(extra_data.iloc[:, column_index].notna().mean())
                    for column_index in range(extra_data.shape[1])
                )
            else:
                occupancy = None

        profiles.append(
            VerificationProfile(
                mode=mode,
                filename=filename,
                header_cells=header_cells,
                header_row=header_row,
                extra_column_occupancy=occupancy,
            )
        )
    return tuple(profiles)


def _source_rows(source: pd.DataFrame, count: int = 12) -> list[list[Any]]:
    return [list(source.columns), *source.head(count).values.tolist()]


def _header_match(
    source: pd.DataFrame,
    profile: VerificationProfile,
    rows: list[list[Any]],
) -> bool:
    if profile.mode.startswith("PBN"):
        actual = [_normalize(value) for value in source.columns]
        return all(
            position < len(actual) and actual[position] == expected
            for position, expected in profile.header_cells
        )

    if profile.header_row >= len(rows):
        return False
    actual_row = rows[profile.header_row]
    return all(
        position < len(actual_row) and _normalize(actual_row[position]) == expected
        for position, expected in profile.header_cells
    )


def _pbn_occupancy_distance(source: pd.DataFrame, profile: VerificationProfile) -> float:
    expected = profile.extra_column_occupancy
    if expected is None:
        return float("inf")
    if len(source) == 0:
        return float("inf")

    extra_data = source.iloc[:, PBN_EXTRA_COLUMN_START:]
    actual = tuple(
        float(extra_data.iloc[:, column_index].map(_nonempty).mean())
        for column_index in range(extra_data.shape[1])
    )
    compared_columns = max(len(actual), len(expected))
    if not compared_columns:
        return 0.0
    padded_actual = actual + (0.0,) * (compared_columns - len(actual))
    padded_expected = expected + (0.0,) * (compared_columns - len(expected))
    return sum(abs(left - right) for left, right in zip(padded_actual, padded_expected)) / compared_columns


def _recommendation(mode: str | None, template: str | None, reason: str, confidence: str) -> dict[str, Any]:
    return {
        "recommended_mode": mode,
        "template_name": template,
        "confidence": confidence,
        "reason": reason,
    }


def recommend_cleaning_method(source: pd.DataFrame) -> dict[str, Any]:
    profiles = _load_verification_profiles()
    rows = _source_rows(source)
    matched_profiles = [
        profile
        for profile in profiles
        if _header_match(source, profile, rows)
    ]

    sitasi_matches = [profile for profile in matched_profiles if profile.mode.startswith("Sitasi")]
    if len(sitasi_matches) == 1:
        profile = sitasi_matches[0]
        return _recommendation(
            profile.mode,
            profile.filename,
            "The input table headers and positions match this verification template.",
            "high",
        )

    pbn_matches = [profile for profile in matched_profiles if profile.mode.startswith("PBN")]
    if len(pbn_matches) >= 2:
        extra_data = source.iloc[:, PBN_EXTRA_COLUMN_START:]
        education_data = extra_data.iloc[:, :5]
        homebase_data = extra_data.iloc[:, 5:]
        if (
            not education_data.empty
            and education_data.map(_nonempty).any().any()
            and (homebase_data.empty or not homebase_data.map(_nonempty).any().any())
        ):
            return _recommendation(
                None,
                None,
                "The PBN sheet contains education-only fields, but no separate PBN Open + Edu verification template is available.",
                "ambiguous",
            )

        scored = sorted(
            (
                (_pbn_occupancy_distance(source, profile), profile)
                for profile in pbn_matches
            ),
            key=lambda item: item[0],
        )
        best_distance, best_profile = scored[0]
        next_distance = scored[1][0]
        if best_distance <= 0.15 and next_distance - best_distance >= 0.05:
            return _recommendation(
                best_profile.mode,
                best_profile.filename,
                "The PBN headers match; populated Homebase/Education columns are closest to this verification template.",
                "high",
            )
        return _recommendation(
            None,
            None,
            "The PBN headers match multiple methods, but the available data does not clearly distinguish their verification templates.",
            "ambiguous",
        )

    if len(matched_profiles) == 1:
        profile = matched_profiles[0]
        return _recommendation(
            profile.mode,
            profile.filename,
            "The input table headers and positions match this verification template.",
            "high",
        )

    return _recommendation(
        None,
        None,
        "No available verification template matches this sheet's structure.",
        "none",
    )


def recommend_dataset_cleaning_method(dataset_id: str, sheet_name: str | None = None) -> dict[str, Any]:
    sheets = DatasetStore.get(dataset_id)
    if sheets is None:
        raise KeyError(f"Dataset '{dataset_id}' not found. Please upload a file first.")
    if sheet_name is None:
        sheet_name = next(iter(sheets))
    if sheet_name not in sheets:
        raise KeyError(f"Sheet '{sheet_name}' not found.")

    result = recommend_cleaning_method(sheets[sheet_name])
    return {
        "dataset_id": dataset_id,
        "sheet_name": sheet_name,
        **result,
    }
