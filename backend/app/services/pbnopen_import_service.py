import csv
from io import BytesIO, StringIO
from typing import Any

import pandas as pd
from sqlalchemy import MetaData, Table, delete, inspect

from app.history_db import engine


TABLE_NAME = "fetch_pbnopen"
TABLE_SCHEMA = "pbncleaner"


def _read_csv(content: bytes, expected_columns: list[str]) -> pd.DataFrame:
    try:
        text = content.decode("utf-8-sig")
        header = next(csv.reader(StringIO(text)), [])
        if not header:
            raise ValueError("The CSV file must contain a header row.")
        if len(header) != len(set(header)):
            raise ValueError("The CSV file contains duplicate column names.")

        dataframe = pd.read_csv(
            BytesIO(content),
            dtype=str,
            keep_default_na=False,
            encoding="utf-8-sig",
        )
    except (UnicodeDecodeError, csv.Error, pd.errors.EmptyDataError, pd.errors.ParserError) as exc:
        raise ValueError("The uploaded file is not a valid UTF-8 CSV.") from exc

    missing_columns = [column for column in expected_columns if column not in header]
    extra_columns = [column for column in header if column not in expected_columns]
    if missing_columns or extra_columns:
        details = []
        if missing_columns:
            details.append(f"Missing columns: {', '.join(missing_columns)}")
        if extra_columns:
            details.append(f"Unexpected columns: {', '.join(extra_columns)}")
        raise ValueError("CSV columns do not match the data source. " + ". ".join(details) + ".")

    if dataframe.empty:
        raise ValueError("The CSV must contain at least one data row.")
    return dataframe.loc[:, expected_columns]


def validate_pbnopen_csv(content: bytes) -> dict[str, Any]:
    expected_columns = [
        column["name"]
        for column in inspect(engine).get_columns(TABLE_NAME, schema=TABLE_SCHEMA)
    ]
    if not expected_columns:
        raise RuntimeError(f"Database table '{TABLE_SCHEMA}.{TABLE_NAME}' has no columns.")
    dataframe = _read_csv(content, expected_columns)
    return {"columns": expected_columns, "row_count": len(dataframe)}


def replace_pbnopen_data(content: bytes) -> int:
    expected_columns = [
        column["name"]
        for column in inspect(engine).get_columns(TABLE_NAME, schema=TABLE_SCHEMA)
    ]
    if not expected_columns:
        raise RuntimeError(f"Database table '{TABLE_SCHEMA}.{TABLE_NAME}' has no columns.")
    dataframe = _read_csv(content, expected_columns)

    with engine.begin() as connection:
        table = Table(TABLE_NAME, MetaData(), schema=TABLE_SCHEMA, autoload_with=connection)
        connection.execute(delete(table))
        dataframe.to_sql(
            TABLE_NAME,
            connection,
            schema=TABLE_SCHEMA,
            if_exists="append",
            index=False,
            chunksize=1000,
        )

    return len(dataframe)
