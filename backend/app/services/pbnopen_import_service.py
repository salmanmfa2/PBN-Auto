import csv
from datetime import datetime, timezone
from io import BytesIO, StringIO
from typing import Any

import pandas as pd
from sqlalchemy import MetaData, String, Table, bindparam, delete, func, insert, inspect, select, update

from app.history_db import engine
from app.models.pbnopen_data_source_sync import PbnOpenDataSourceSync


TABLE_NAME = "fetch_pbnopen"
TABLE_SCHEMA = "pbncleaner"
EMPLOYEE_TABLE_NAME = "dt_employee"
EMPLOYEE_DIRECT_COLUMNS = (
    "NIP",
    "Nama Gelar",
    "Gol",
    "TMT JF Keterampilan",
    "TMT JF Keahlian",
    "TMT JF Ahli Muda",
    "TMT JF Ahli Madya",
    "TMT Es4",
    "TMT Es3",
    "TMT Es2",
    "TMT Jabatan",
    "Agama",
    "Tempat Lahir",
    "Tanggal Lahir",
    "Sex",
    "Usia (th.)",
    "Jabatan",
    "Kode Unit",
    "Unit Eselon II",
    "MKerja Unit Eselon II (Th)",
    "MKerja Unit Eselon II (Bl)",
    "Unit Eselon III",
    "MKerja Unit Eselon III (Th)",
    "MKerja Unit Eselon III (Bl)",
    "Unit Eselon IV",
    "MKerja Unit Eselon IV (Th)",
    "MKerja Unit Eselon IV (Bl)",
    "Status",
    "Homebase",
    "Region Homebase",
    "Jurusan",
    "Universitas/Sekolah Tinggi",
    "Pembiayaan",
    "IPK",
)
EMPLOYEE_REFERENCE_COLUMNS = (
    ("pangkat_id", "Pangkat", "ref_pangkat", "pangkat_id"),
    ("eselon_id", "Eselon", "ref_eselon", "eselon_id"),
    ("pendidikan_id", "Pendidikan Terakhir (Short)", "ref_pendidikan_terakhir", "pendidikan_id"),
    ("unit_kerja_id", "Unit Kerja", "ref_unit_kerja", "unit_kerja_id"),
    ("rumpun_id", "Rumpun Pdd Terakhir", "ref_rumpun_pendidikan", "rumpun_id"),
)


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


def replace_pbnopen_data(
    content: bytes,
    synced_by_user: str,
    synced_by_name: str,
) -> int:
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
        sync_table = PbnOpenDataSourceSync.__table__
        connection.execute(delete(sync_table).where(sync_table.c.id == 1))
        connection.execute(
            insert(sync_table).values(
                id=1,
                last_synced_at=datetime.now(timezone.utc).replace(tzinfo=None),
                synced_by_user=synced_by_user,
                synced_by_name=synced_by_name,
            )
        )

    return len(dataframe)


def _employee_reference_label(value: object) -> str | None:
    if value is None:
        return None
    label = str(value)
    return label if label.strip() else None


def sync_dt_employee_from_pbnopen() -> int:
    target_columns = {
        *EMPLOYEE_DIRECT_COLUMNS,
        *(target for target, _, _, _ in EMPLOYEE_REFERENCE_COLUMNS),
        "employee_id",
    }
    source_columns = {
        *EMPLOYEE_DIRECT_COLUMNS,
        *(source for _, source, _, _ in EMPLOYEE_REFERENCE_COLUMNS),
    }

    with engine.begin() as connection:
        source_table = Table(
            TABLE_NAME,
            MetaData(),
            schema=TABLE_SCHEMA,
            autoload_with=connection,
        )
        employee_table = Table(
            EMPLOYEE_TABLE_NAME,
            MetaData(),
            schema=TABLE_SCHEMA,
            autoload_with=connection,
        )
        missing_source = source_columns - set(source_table.c.keys())
        missing_target = target_columns - set(employee_table.c.keys())
        unexpected_source = set(source_table.c.keys()) - source_columns
        unexpected_target = set(employee_table.c.keys()) - target_columns
        if missing_source or missing_target or unexpected_source or unexpected_target:
            details = []
            if missing_source:
                details.append(f"missing fetch_pbnopen columns: {', '.join(sorted(missing_source))}")
            if missing_target:
                details.append(f"missing dt_employee columns: {', '.join(sorted(missing_target))}")
            if unexpected_source:
                details.append(f"unmapped fetch_pbnopen columns: {', '.join(sorted(unexpected_source))}")
            if unexpected_target:
                details.append(f"unmapped dt_employee columns: {', '.join(sorted(unexpected_target))}")
            raise RuntimeError("The employee source schemas do not match. " + "; ".join(details))
        if not isinstance(employee_table.c["Unit Eselon III"].type, String) or not isinstance(
            employee_table.c["Unit Eselon IV"].type,
            String,
        ):
            raise RuntimeError(
                "'dt_employee.Unit Eselon III' and 'Unit Eselon IV' must use text columns."
            )
        if [column.name for column in employee_table.primary_key.columns] != ["employee_id"]:
            raise RuntimeError("'dt_employee.employee_id' must remain the table's primary key.")

        source_rows = connection.execute(select(source_table)).mappings().all()
        if not source_rows:
            raise ValueError("Cannot sync dt_employee because fetch_pbnopen contains no rows.")

        source_nips: set[str] = set()
        for row in source_rows:
            nip = row["NIP"]
            if nip is None or not str(nip).strip():
                raise ValueError("Cannot sync dt_employee because fetch_pbnopen contains a blank NIP.")
            if nip in source_nips:
                raise ValueError("Cannot sync dt_employee because fetch_pbnopen contains duplicate NIPs.")
            source_nips.add(nip)

        reference_maps: dict[str, dict[str, int]] = {}
        for _, _, reference_name, id_column in EMPLOYEE_REFERENCE_COLUMNS:
            reference_table = Table(
                reference_name,
                MetaData(),
                schema=TABLE_SCHEMA,
                autoload_with=connection,
            )
            references: dict[str, int] = {}
            for reference in connection.execute(
                select(reference_table.c[id_column], reference_table.c.value)
            ).mappings():
                label = _employee_reference_label(reference["value"])
                if label is None:
                    continue
                if label in references:
                    raise ValueError(
                        f"Cannot sync dt_employee because {reference_name}.value contains duplicate labels."
                    )
                references[label] = reference[id_column]
            reference_maps[reference_name] = references

        employee_rows: list[dict[str, object]] = []
        unmapped_counts = {source: 0 for _, source, _, _ in EMPLOYEE_REFERENCE_COLUMNS}
        for source_row in source_rows:
            employee_row = {
                column: source_row[column]
                for column in EMPLOYEE_DIRECT_COLUMNS
            }
            for target, source, reference_name, _ in EMPLOYEE_REFERENCE_COLUMNS:
                label = _employee_reference_label(source_row[source])
                reference_id = reference_maps[reference_name].get(label) if label else None
                if label is not None and reference_id is None:
                    unmapped_counts[source] += 1
                employee_row[target] = reference_id
            employee_rows.append(employee_row)

        missing_references = [
            f"{count} rows for {column}"
            for column, count in unmapped_counts.items()
            if count
        ]
        if missing_references:
            raise ValueError(
                "Cannot sync dt_employee because reference mappings are missing: "
                + ", ".join(missing_references)
                + ". Update the matching ref_* table and retry."
            )

        existing_rows = connection.execute(
            select(employee_table.c.employee_id, employee_table.c["NIP"])
        ).mappings().all()
        existing_by_nip: dict[str, int] = {}
        for existing in existing_rows:
            nip = existing["NIP"]
            if nip is None or not str(nip).strip():
                continue
            if nip in existing_by_nip:
                raise ValueError("Cannot sync dt_employee because it contains duplicate NIPs.")
            existing_by_nip[nip] = existing["employee_id"]

        update_bindings = {
            column: f"_value_{index}"
            for index, column in enumerate(employee_rows[0])
        }
        update_statement = update(employee_table).where(
            employee_table.c.employee_id == bindparam("_employee_id")
        ).values(
            {
                employee_table.c[column]: bindparam(binding)
                for column, binding in update_bindings.items()
            }
        )
        updates = []
        inserts = []
        for employee_row in employee_rows:
            nip = employee_row["NIP"]
            if nip in existing_by_nip:
                updates.append(
                    {
                        "_employee_id": existing_by_nip[nip],
                        **{
                            update_bindings[column]: value
                            for column, value in employee_row.items()
                        },
                    }
                )
            else:
                inserts.append(employee_row)

        if updates:
            connection.execute(update_statement, updates)
        if inserts:
            connection.execute(insert(employee_table), inserts)

        current_employee_ids = {
            existing_by_nip[nip]
            for nip in source_nips
            if nip in existing_by_nip
        }
        obsolete_employee_ids = [
            row["employee_id"]
            for row in existing_rows
            if row["employee_id"] not in current_employee_ids
        ]
        if obsolete_employee_ids:
            connection.execute(
                delete(employee_table).where(
                    employee_table.c.employee_id.in_(obsolete_employee_ids)
                )
            )

        row_count = connection.scalar(select(func.count()).select_from(employee_table))
        if row_count != len(source_rows):
            raise RuntimeError(
                f"dt_employee sync produced {row_count} rows for a {len(source_rows)}-row source."
            )

    return len(source_rows)
