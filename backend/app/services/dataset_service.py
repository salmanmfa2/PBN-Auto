"""
Core dataset service — all DataFrame operations live here.
"""

import io
import re
from datetime import date, datetime, timedelta
from numbers import Real
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from openpyxl.utils import get_column_letter

from app.storage.dataset_store import DatasetStore
from app.cleaners import get_rules_for_mode, CLEANER_MODULES


PREVIEW_LIMIT = 500  # rows returned in preview payloads
PBN_EDU_HB_DATE_COLUMNS = (
    "TMT JF Keterampilan",
    "TMT JF Keahlian",
    "TMT JF Ahli Muda",
    "TMT JF Ahli Madya",
    "TMT Es4",
    "TMT Es3",
    "TMT Es2",
    "TMT Jabatan",
)
AUTO_CLEAN_RULES_FILES = {
    "PBN Open": Path(__file__).resolve().parents[2] / "Auto Clean Logic (PBN Open).txt",
    "PBN Open + Edu": Path(__file__).resolve().parents[2] / "Cleaning Logic" / "PBN Open + Edu.txt",
    "Sitasi Es.IV": Path(__file__).resolve().parents[2] / "Cleaning Logic" / "Sitasi EsIV.txt",
    "Sitasi Es.III": Path(__file__).resolve().parents[2] / "Cleaning Logic" / "Sitasi EsIII.txt",
}


def _sanitize(df: pd.DataFrame) -> pd.DataFrame:
    """Replace NaN/Inf with None so JSON serialization doesn't blow up."""
    df = df.astype(object)
    return df.where(pd.notnull(df), other=None)


def _build_sheet_preview(name: str, df: pd.DataFrame) -> Dict[str, Any]:
    preview_df = _sanitize(df.head(PREVIEW_LIMIT))
    return {
        "name": name,
        "columns": list(df.columns),
        "rows": preview_df.to_dict(orient="records"),
        "row_count": len(df),
        "column_count": len(df.columns),
    }


def _build_preview(dataset_id: str, sheets: Dict[str, pd.DataFrame], selected_sheet: Optional[str] = None) -> Dict[str, Any]:
    if not sheets:
        raise ValueError("No sheets available in the dataset.")

    selected_sheet = selected_sheet or next(iter(sheets))
    if selected_sheet not in sheets:
        raise KeyError(f"Sheet '{selected_sheet}' not found.")

    sheet_preview = _build_sheet_preview(selected_sheet, sheets[selected_sheet])
    return {
        "dataset_id": dataset_id,
        "selected_sheet": selected_sheet,
        "sheets": [_build_sheet_preview(name, df) for name, df in sheets.items()],
        **sheet_preview,
    }


def _parse_excel_sheets(file_bytes: bytes, engine: str) -> Dict[str, pd.DataFrame]:
    sheets = pd.read_excel(io.BytesIO(file_bytes), sheet_name=None, engine=engine)
    parsed: Dict[str, pd.DataFrame] = {}
    for name, df in sheets.items():
        if not isinstance(df, pd.DataFrame):
            continue
        df = df.copy()
        df.columns = [str(c) for c in df.columns]
        parsed[str(name)] = df
    return parsed


def parse_upload(file_bytes: bytes, filename: str, dataset_id: Optional[str] = None) -> Dict[str, Any]:
    """Parse an uploaded file and store it; return preview."""
    lower = filename.lower()

    try:
        if lower.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_bytes))
            sheets = {"Sheet1": df}
        elif lower.endswith(".xlsx"):
            sheets = _parse_excel_sheets(file_bytes, engine="openpyxl")
        elif lower.endswith(".xls"):
            sheets = _parse_excel_sheets(file_bytes, engine="xlrd")
        else:
            raise ValueError(f"Unsupported file type: {filename}")
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Could not read file: {exc}") from exc

    if not sheets or all(sheet.empty for sheet in sheets.values()):
        raise ValueError("Uploaded file contains no data.")

    if dataset_id is None:
        dataset_id = DatasetStore.save(sheets)
    else:
        DatasetStore.update(dataset_id, sheets)
    return _build_preview(dataset_id, sheets)


def get_dataset_preview(dataset_id: str, sheet_name: Optional[str] = None) -> Dict[str, Any]:
    sheets = _require_dataset(dataset_id)
    return _build_preview(dataset_id, sheets, sheet_name)


def remove_columns(dataset_id: str, columns_to_keep: List[str], sheet_name: Optional[str] = None) -> Dict[str, Any]:
    sheets = _require_dataset(dataset_id)
    sheet_name = sheet_name or next(iter(sheets))
    sheets[sheet_name] = _remove_columns_from_sheet(sheets[sheet_name], columns_to_keep)
    DatasetStore.update(dataset_id, sheets)
    return _build_preview(dataset_id, sheets, sheet_name)


def _remove_columns_from_sheet(df: pd.DataFrame, columns_to_keep: List[str]) -> pd.DataFrame:
    missing = [c for c in columns_to_keep if c not in df.columns]
    if missing:
        raise ValueError(f"Columns not found: {missing}")
    return df[columns_to_keep]


def rename_columns(dataset_id: str, rename_map: Dict[str, str], sheet_name: Optional[str] = None) -> Dict[str, Any]:
    sheets = _require_dataset(dataset_id)
    sheet_name = sheet_name or next(iter(sheets))
    sheets[sheet_name] = _rename_columns_in_sheet(sheets[sheet_name], rename_map)
    DatasetStore.update(dataset_id, sheets)
    return _build_preview(dataset_id, sheets, sheet_name)


def _rename_columns_in_sheet(df: pd.DataFrame, rename_map: Dict[str, str]) -> pd.DataFrame:
    missing = [c for c in rename_map if c not in df.columns]
    if missing:
        raise ValueError(f"Columns not found: {missing}")
    return df.rename(columns=rename_map)


def delete_rows(dataset_id: str, mode: str, count: Optional[int] = None, row: Optional[int] = None, sheet_name: Optional[str] = None) -> Dict[str, Any]:
    sheets = _require_dataset(dataset_id)
    sheet_name = sheet_name or next(iter(sheets))
    sheets[sheet_name] = _delete_rows_from_sheet(sheets[sheet_name], mode, count, row)
    DatasetStore.update(dataset_id, sheets)
    return _build_preview(dataset_id, sheets, sheet_name)


def _delete_rows_from_sheet(df: pd.DataFrame, mode: str, count: Optional[int], row: Optional[int]) -> pd.DataFrame:
    if mode not in {"first", "last", "custom"}:
        raise ValueError("Invalid delete mode. Expected 'first', 'last', or 'custom'.")
    if mode in {"first", "last"}:
        if count is None or count < 1:
            raise ValueError("Count must be a positive integer for first/last row deletion.")
        if count >= len(df):
            raise ValueError("Count must be less than the total number of rows.")
        return df.iloc[count:] if mode == "first" else df.iloc[:-count]
    if row is None or row < 1 or row > len(df):
        raise ValueError("Row must be a valid 1-based row index.")
    return df.drop(df.index[row - 1])


def use_first_row_as_header(dataset_id: str, sheet_name: Optional[str] = None) -> Dict[str, Any]:
    sheets = _require_dataset(dataset_id)
    sheet_name = sheet_name or next(iter(sheets))
    sheets[sheet_name] = _use_first_row_as_header_in_sheet(sheets[sheet_name])
    DatasetStore.update(dataset_id, sheets)
    return _build_preview(dataset_id, sheets, sheet_name)


def _use_first_row_as_header_in_sheet(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        raise ValueError("Dataset is empty.")
    df = df.copy()
    df.columns = df.iloc[0].astype(str).tolist()
    return df.iloc[1:].reset_index(drop=True)


def remove_duplicates(dataset_id: str, columns: List[str], sheet_name: Optional[str] = None) -> Dict[str, Any]:
    sheets = _require_dataset(dataset_id)
    sheet_name = sheet_name or next(iter(sheets))
    df = sheets[sheet_name]
    missing = [c for c in columns if c not in df.columns]
    if missing:
        raise ValueError(f"Columns not found: {missing}")

    original_rows = len(df)
    df_clean = df.drop_duplicates(subset=columns, keep="first")
    removed_rows = original_rows - len(df_clean)
    sheets[sheet_name] = df_clean

    DatasetStore.update(dataset_id, sheets)
    preview = _build_preview(dataset_id, sheets, sheet_name)

    return {
        "dataset_id": dataset_id,
        "original_rows": original_rows,
        "removed_rows": removed_rows,
        "remaining_rows": len(df_clean),
        "preview": preview,
    }


def apply_auto_clean(dataset_id: str, mode: str, sheet_name: Optional[str] = None) -> Dict[str, Any]:
    sheets = _require_dataset(dataset_id)
    sheet_name = sheet_name or next(iter(sheets))

    # Accept modes that have either a legacy txt rule file or a programmatic cleaner module.
    if mode not in AUTO_CLEAN_RULES_FILES and mode not in CLEANER_MODULES:
        raise ValueError(f"Auto clean mode '{mode}' is not implemented yet.")

    df = sheets[sheet_name].copy()
    # Prefer programmatic cleaner modules; fall back to legacy text-based rules
    rules = get_rules_for_mode(mode) or _load_auto_clean_rules(mode)

    if rules["skiprows"]:
        df = df.iloc[rules["skiprows"] :].reset_index(drop=True)

    if rules["delete_rows_null_columns"]:
        mask = pd.Series(True, index=df.index)
        for position in rules["delete_rows_null_columns"]:
            if 1 <= position <= len(df.columns):
                mask &= df.iloc[:, position - 1].notna()
        df = df[mask].reset_index(drop=True)

    category_source = {
        "Sitasi Es.III": "Keterangan",
        "Sitasi Es.III (Lite)": "Keterangan",
        "Sitasi Es.IV": "Pertimbangan",
    }.get(mode)
    if mode == "Sitasi Es.IV":
        source_column = next(
            (
                column
                for column in df.columns
                if "".join(char for char in str(column).casefold() if char.isalnum()) == "pertimbangan"
            ),
            None,
        )
        if source_column is None and len(df.columns) >= 14:
            source_column = df.columns[13]
        if source_column is not None and source_column != "Pertimbangan":
            df = df.rename(columns={source_column: "Pertimbangan"})

    if rules["rename_columns"]:
        rename_map = {}
        for position, new_name in rules["rename_columns"].items():
            if 1 <= position <= len(df.columns):
                current_name = df.columns[position - 1]
                rename_map[current_name] = new_name
        if rename_map:
            df = df.rename(columns=rename_map)

    if rules["delete_positions"]:
        columns_to_drop = [
            df.columns[position - 1]
            for position in rules["delete_positions"]
            if 1 <= position <= len(df.columns) and df.columns[position - 1] != category_source
        ]
        if columns_to_drop:
            df = df.drop(columns=columns_to_drop)

    if mode in {"Sitasi Es.III", "Sitasi Es.III (Lite)"} and "Keterangan" in df.columns:
        df = df.assign(
            Keterangan=df["Keterangan"].map(
                lambda value: _to_proper_case(
                    value[6:].replace("Latar Belakang: -", "").strip()
                    if mode == "Sitasi Es.III"
                    else value[6:]
                )
                if isinstance(value, str)
                else value
            )
        )
    if mode == "Sitasi Es.III" and "Jabatan Baru" in df.columns:
        df = df.assign(
            **{
                "Jabatan Baru": df["Jabatan Baru"].map(
                    lambda value: value.replace("Ex Officio: -", "").strip()
                    if isinstance(value, str)
                    else value
                )
            }
        )
    elif mode == "Sitasi Es.IV" and "Pertimbangan" in df.columns:
        df = df.assign(
            Pertimbangan=df["Pertimbangan"].map(_to_proper_case)
        )

    cleaning_warnings: List[str] = []
    if mode == "PBN Open + Edu + HB":
        df = df.map(
            lambda value: value.replace("'", "").replace("`", "")
            if isinstance(value, str)
            else value
        )
        for column in PBN_EDU_HB_DATE_COLUMNS:
            if column not in df.columns:
                continue
            parsed_values = []
            invalid_rows = []
            for row_number, value in enumerate(df[column], start=1):
                parsed, valid = _parse_pbn_date(value)
                parsed_values.append(parsed)
                if not valid:
                    invalid_rows.append(row_number)
            df[column] = pd.Series(parsed_values, index=df.index)
            if invalid_rows:
                shown_rows = ", ".join(str(row) for row in invalid_rows[:10])
                remaining = len(invalid_rows) - min(len(invalid_rows), 10)
                extra_rows = f", and {remaining} more" if remaining else ""
                cleaning_warnings.append(
                    f'{column}: {len(invalid_rows)} value(s) could not be parsed and were preserved '
                    f"(cleaned row(s) {shown_rows}{extra_rows})."
                )

    if category_source:
        if category_source not in df.columns:
            raise ValueError(f"Cannot create 'Kategori': the selected dataset does not contain '{category_source}'.")
        df = add_sitasi_category(df, category_source)

    df.attrs["sitasi_esiii_lite"] = mode == "Sitasi Es.III (Lite)"
    sheets[sheet_name] = df
    DatasetStore.update(dataset_id, sheets)
    preview = _build_preview(dataset_id, sheets, sheet_name)
    if cleaning_warnings:
        preview["cleaning_warnings"] = cleaning_warnings
    return preview


def _parse_pbn_date(value: Any) -> Tuple[Any, bool]:
    if value is None or pd.isna(value):
        return pd.NaT, True
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value, True
    if isinstance(value, Real) and not isinstance(value, bool):
        if 10_000 <= value <= 100_000:
            return datetime(1899, 12, 30) + timedelta(days=float(value)), True
        if float(value).is_integer():
            try:
                return datetime.strptime(str(int(value)), "%Y%m%d"), True
            except ValueError:
                pass
        return value, False
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return pd.NaT, True
        try:
            return datetime.fromisoformat(cleaned.replace("Z", "+00:00")), True
        except ValueError:
            pass
        for date_format in ("%d/%m/%Y", "%d-%m-%Y", "%Y%m%d"):
            try:
                return datetime.strptime(cleaned, date_format), True
            except ValueError:
                continue
        return cleaned, False
    return value, False


def _to_proper_case(value: Any) -> Any:
    return value.title() if isinstance(value, str) else value


def add_sitasi_category(df: pd.DataFrame, source_column: str = "Keterangan") -> pd.DataFrame:
    if source_column not in df.columns:
        raise ValueError(f"The selected dataset does not contain a '{source_column}' column.")

    remarks = df[source_column].fillna("").astype(str)
    has_mutasi = remarks.str.contains(r"\bMutasi\b", case=False, regex=True)
    has_promosi = remarks.str.contains(r"\bPromosi\b", case=False, regex=True)
    categories = [
        "Mutasi" if is_mutasi else "Promosi" if is_promosi else ""
        for is_mutasi, is_promosi in zip(has_mutasi, has_promosi)
    ]
    return df.assign(Kategori=categories)


def _load_auto_clean_rules(mode: str) -> Dict[str, Any]:
    rules_file = AUTO_CLEAN_RULES_FILES.get(mode)
    if not rules_file or not rules_file.exists():
        return {"delete_positions": [], "rename_columns": {}}

    content = rules_file.read_text(encoding="utf-8")
    skiprows = 0
    delete_positions: List[int] = []
    delete_rows_null_columns: List[int] = []
    rename_columns: Dict[int, str] = {}

    skiprows_match = re.search(r"Skiprows\s*:\s*(\d+)", content, re.IGNORECASE)
    if skiprows_match:
        try:
            skiprows = int(skiprows_match.group(1))
        except ValueError:
            skiprows = 0

    delete_match = re.search(r"Delete(?:\s+Column)?\s*:\s*(.+)", content, re.IGNORECASE)
    if delete_match:
        delete_section = delete_match.group(1)
        for token in delete_section.split(","):
            token = token.strip()
            if not token:
                continue
            if "-" in token:
                start_str, end_str = [part.strip() for part in token.split("-", 1)]
                try:
                    start = int(start_str)
                    end = int(end_str)
                except ValueError:
                    continue
                delete_positions.extend(range(start, end + 1))
            else:
                try:
                    delete_positions.append(int(token))
                except ValueError:
                    continue

    rename_matches = re.findall(r"Col\s+(\d+)\s*->\s*(.+)", content)
    for position, new_name in rename_matches:
        try:
            rename_columns[int(position)] = new_name.strip()
        except ValueError:
            continue

    null_delete_matches = re.findall(r"if\s+null\s+in\s+column\s+(\d+)", content, re.IGNORECASE)
    for match in null_delete_matches:
        try:
            delete_rows_null_columns.append(int(match))
        except ValueError:
            continue

    return {
        "skiprows": skiprows,
        "delete_positions": sorted(delete_positions),
        "delete_rows_null_columns": sorted(delete_rows_null_columns),
        "rename_columns": rename_columns,
    }


def filter_dataframe(df: pd.DataFrame, filters: Optional[Dict[str, Any]]) -> pd.DataFrame:
    if not filters:
        return df

    filtered = df.copy()
    for column, raw_values in filters.items():
        if not column or column not in filtered.columns:
            continue

        if isinstance(raw_values, list):
            values = {str(value).strip().lower() for value in raw_values}
            filtered = filtered[filtered[column].map(
                lambda cell: ('' if cell is None or pd.isna(cell) else str(cell).strip().lower()) in values
            )]
        else:
            value = str(raw_values).strip().lower()
            if value:
                filtered = filtered[filtered[column].map(
                    lambda cell: value in str(cell).strip().lower() if cell is not None and not pd.isna(cell) else False
                )]

    return filtered


def export_csv(dataset_id: str, sheet_name: Optional[str] = None, filters: Optional[Dict[str, str]] = None) -> bytes:
    sheets = _require_dataset(dataset_id)
    sheet_name = sheet_name or next(iter(sheets))
    df = filter_dataframe(sheets[sheet_name], filters)
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    return buf.getvalue()


def export_excel(dataset_id: str, sheet_name: Optional[str] = None, filters: Optional[Dict[str, str]] = None) -> bytes:
    sheets = _require_dataset(dataset_id)
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        if sheet_name:
            df = filter_dataframe(sheets[sheet_name], filters)
            df.to_excel(writer, index=False, sheet_name=sheet_name)
            if df.attrs.get("sitasi_esiii_lite"):
                _merge_sitasi_lite_heading_rows(writer, sheet_name, df)
        else:
            for name, df in sheets.items():
                filtered = filter_dataframe(df, filters)
                sheet_title = name[:31]
                filtered.to_excel(writer, index=False, sheet_name=sheet_title)
                if filtered.attrs.get("sitasi_esiii_lite"):
                    _merge_sitasi_lite_heading_rows(writer, sheet_title, filtered)
    return buf.getvalue()


def _merge_sitasi_lite_heading_rows(
    writer: pd.ExcelWriter,
    sheet_name: str,
    dataframe: pd.DataFrame,
) -> None:
    worksheet = writer.sheets[sheet_name]
    no_column = next(
        (
            index
            for index, column in enumerate(dataframe.columns, start=1)
            if "".join(char for char in str(column).casefold() if char.isalnum()) == "no"
        ),
        None,
    )
    if no_column is None or len(dataframe.columns) < 2:
        return

    last_column = get_column_letter(len(dataframe.columns))
    for row_number, row in enumerate(dataframe.itertuples(index=False, name=None), start=2):
        number_value = row[no_column - 1]
        if number_value is None or pd.isna(number_value) or not str(number_value).strip():
            continue
        if not pd.isna(pd.to_numeric(number_value, errors="coerce")):
            continue
        if all(value is None or pd.isna(value) or not str(value).strip() for index, value in enumerate(row) if index != no_column - 1):
            worksheet.merge_cells(f"A{row_number}:{last_column}{row_number}")


def _require_dataset(dataset_id: str) -> Dict[str, pd.DataFrame]:
    sheets = DatasetStore.get(dataset_id)
    if sheets is None:
        raise KeyError(f"Dataset '{dataset_id}' not found. Please upload a file first.")
    return sheets
