import csv
from datetime import datetime, timezone
from dataclasses import dataclass
from io import BytesIO, StringIO
from typing import Any
from uuid import uuid4

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
EMPLOYEE_TABLE_SOURCES = {
    "dt_employee": "fetch_pbnopen",
    "dt_employee_q2_2026": "fetch_pbnopen_q2_2026",
}


@dataclass(frozen=True)
class TableMaintenanceTarget:
    key: str
    table_name: str
    label: str
    operation: str
    source_table: str | None = None
    primary_key: str | None = None


TABLE_MAINTENANCE_TARGETS = {
    "fetch_pbnopen": TableMaintenanceTarget(
        "fetch_pbnopen",
        "fetch_pbnopen",
        "PBN Open source (current)",
        "replace",
    ),
    "dt_employee": TableMaintenanceTarget(
        "dt_employee",
        "dt_employee",
        "Employee table (current)",
        "sync",
        source_table="fetch_pbnopen",
    ),
    "fetch_pbnopen_q2_2026": TableMaintenanceTarget(
        "fetch_pbnopen_q2_2026",
        "fetch_pbnopen_q2_2026",
        "PBN Open source (Q2 2026)",
        "replace",
    ),
    "dt_employee_q2_2026": TableMaintenanceTarget(
        "dt_employee_q2_2026",
        "dt_employee_q2_2026",
        "Employee table (Q2 2026)",
        "sync",
        source_table="fetch_pbnopen_q2_2026",
    ),
    **{
        reference_name: TableMaintenanceTarget(
            reference_name,
            reference_name,
            f"Reference table: {reference_name}",
            "reference",
            primary_key=reference_id,
        )
        for _, _, reference_name, reference_id in EMPLOYEE_REFERENCE_COLUMNS
    },
}
REFERENCE_EMPLOYEE_COLUMNS = {
    reference_name: tuple(
        (target_table, target_column)
        for target_table in EMPLOYEE_TABLE_SOURCES
        for target_column, _, mapped_reference, _ in EMPLOYEE_REFERENCE_COLUMNS
        if mapped_reference == reference_name
    )
    for _, _, reference_name, _ in EMPLOYEE_REFERENCE_COLUMNS
}


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


def _get_maintenance_target(target_key: str) -> TableMaintenanceTarget:
    target = TABLE_MAINTENANCE_TARGETS.get(target_key)
    if target is None:
        raise ValueError(f"'{target_key}' is not an allowed database-maintenance target.")
    return target


def get_table_maintenance_catalog() -> list[dict[str, str | None]]:
    return [
        {
            "key": target.key,
            "table_name": target.table_name,
            "label": target.label,
            "operation": target.operation,
            "source_table": target.source_table,
        }
        for target in TABLE_MAINTENANCE_TARGETS.values()
    ]


def _table_for(connection: Any, table_name: str) -> Table:
    return Table(
        table_name,
        MetaData(),
        schema=TABLE_SCHEMA,
        autoload_with=connection,
    )


def _validate_source_nips(dataframe: pd.DataFrame, table_name: str) -> None:
    if "NIP" not in dataframe.columns:
        return
    nips = dataframe["NIP"].tolist()
    if any(not str(nip).strip() for nip in nips):
        raise ValueError(f"Cannot replace {table_name} because the CSV contains a blank NIP.")
    if len(nips) != len(set(nips)):
        raise ValueError(f"Cannot replace {table_name} because the CSV contains duplicate NIPs.")


def _employee_reference_label(value: object) -> str | None:
    if value is None:
        return None
    label = str(value)
    return label if label.strip() else None


def _prepare_reference_upload(
    connection: Any,
    target: TableMaintenanceTarget,
    content: bytes,
) -> dict[str, Any]:
    table = _table_for(connection, target.table_name)
    columns = [column.name for column in table.columns]
    primary_key = target.primary_key
    if (
        primary_key is None
        or primary_key not in table.c
        or "value" not in table.c
        or [column.name for column in table.primary_key.columns] != [primary_key]
    ):
        raise RuntimeError(
            f"Reference table '{target.table_name}' does not have the expected stable primary key."
        )

    dataframe = _read_csv(content, columns)
    rows: list[dict[str, object]] = []
    seen_ids: set[int] = set()
    seen_values: set[str] = set()
    for raw_row in dataframe.to_dict(orient="records"):
        raw_id = raw_row[primary_key].strip()
        try:
            row_id = int(raw_id)
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"Reference table '{target.table_name}' contains an invalid {primary_key}."
            ) from exc
        if str(row_id) != raw_id or row_id in seen_ids:
            raise ValueError(
                f"Reference table '{target.table_name}' contains duplicate or invalid {primary_key} values."
            )

        label = _employee_reference_label(raw_row["value"])
        if label is None:
            raise ValueError(f"Reference table '{target.table_name}' cannot contain a blank value.")
        normalized_label = label.casefold()
        if normalized_label in seen_values:
            raise ValueError(f"Reference table '{target.table_name}' contains duplicate values.")

        row: dict[str, object] = {}
        for column in table.columns:
            value = raw_row[column.name]
            if column.name == primary_key:
                row[column.name] = row_id
            elif value == "" and column.nullable:
                row[column.name] = None
            else:
                row[column.name] = value
        rows.append(row)
        seen_ids.add(row_id)
        seen_values.add(normalized_label)

    existing_ids = set(connection.execute(select(table.c[primary_key])).scalars())
    incoming_ids = {row[primary_key] for row in rows}
    removed_ids = existing_ids - incoming_ids
    if removed_ids:
        for employee_table_name, employee_column_name in REFERENCE_EMPLOYEE_COLUMNS[
            target.table_name
        ]:
            if not inspect(connection).has_table(employee_table_name, schema=TABLE_SCHEMA):
                continue
            employee_table = _table_for(connection, employee_table_name)
            if employee_column_name not in employee_table.c:
                raise RuntimeError(
                    f"Cannot verify reference usage because '{employee_table_name}' "
                    f"is missing '{employee_column_name}'."
                )
            used_ids = set(
                connection.execute(
                    select(employee_table.c[employee_column_name])
                    .where(employee_table.c[employee_column_name].in_(removed_ids))
                    .distinct()
                ).scalars()
            )
            if used_ids:
                raise ValueError(
                    f"Cannot remove referenced IDs from {target.table_name}; "
                    f"{employee_table_name}.{employee_column_name} still uses them."
                )

    existing_rows = connection.execute(
        select(table.c[primary_key], table.c.value)
    ).all()
    return {
        "table": table,
        "rows": rows,
        "existing_ids": existing_ids,
        "removed_ids": removed_ids,
        "existing_rows": existing_rows,
        "columns": columns,
    }


def _apply_reference_upload(connection: Any, plan: dict[str, Any], target: TableMaintenanceTarget) -> dict[str, int]:
    table = plan["table"]
    primary_key = target.primary_key
    rows = plan["rows"]
    incoming_ids = {row[primary_key] for row in rows}
    existing_ids = plan["existing_ids"]
    removed_ids = plan["removed_ids"]

    if removed_ids:
        connection.execute(delete(table).where(table.c[primary_key].in_(removed_ids)))

    existing_label_owners = {
        str(row.value).casefold(): row[0]
        for row in plan["existing_rows"]
        if row[0] not in removed_ids and row.value is not None
    }
    new_labels = {str(row["value"]).casefold(): row[primary_key] for row in rows}
    labels_to_stage = {
        existing_label_owners[label]
        for label, incoming_id in new_labels.items()
        if label in existing_label_owners and existing_label_owners[label] != incoming_id
    }
    if labels_to_stage:
        nonce = uuid4().hex[:8]
        value_length = getattr(table.c.value.type, "length", None)
        for row_id in labels_to_stage:
            temporary_value = f"__{nonce}_{row_id}"
            if value_length is not None and len(temporary_value) > value_length:
                raise ValueError(
                    f"Cannot safely update labels in {target.table_name}; "
                    "the value column is too short for a transactional rename."
                )
            connection.execute(
                update(table)
                .where(table.c[primary_key] == row_id)
                .values(value=temporary_value)
            )

    update_columns = [column for column in plan["columns"] if column != primary_key]
    updates = [
        row
        for row in rows
        if row[primary_key] in existing_ids
    ]
    inserts = [
        row
        for row in rows
        if row[primary_key] not in existing_ids
    ]
    for row in updates:
        connection.execute(
            update(table)
            .where(table.c[primary_key] == row[primary_key])
            .values({column: row[column] for column in update_columns})
        )
    if inserts:
        connection.execute(insert(table), inserts)

    return {
        "row_count": len(rows),
        "inserted_count": len(inserts),
        "updated_count": len(updates),
        "deleted_count": len(removed_ids),
    }


def _preview_source_upload(
    connection: Any,
    target: TableMaintenanceTarget,
    content: bytes,
) -> dict[str, Any]:
    table = _table_for(connection, target.table_name)
    columns = [column.name for column in table.columns]
    if not columns:
        raise RuntimeError(f"Database table '{TABLE_SCHEMA}.{target.table_name}' has no columns.")
    dataframe = _read_csv(content, columns)
    _validate_source_nips(dataframe, target.table_name)
    current_row_count = connection.scalar(
        select(func.count()).select_from(table)
    ) or 0
    return {
        "target_key": target.key,
        "table_name": target.table_name,
        "operation": target.operation,
        "columns": columns,
        "row_count": len(dataframe),
        "current_row_count": current_row_count,
        "inserted_count": len(dataframe),
        "updated_count": 0,
        "deleted_count": current_row_count,
    }


def preview_table_maintenance_csv(target_key: str, content: bytes) -> dict[str, Any]:
    target = _get_maintenance_target(target_key)
    if target.operation == "sync":
        raise ValueError(f"'{target.table_name}' is sync-only and does not accept CSV uploads.")
    with engine.connect() as connection:
        if target.operation == "replace":
            return _preview_source_upload(connection, target, content)
        plan = _prepare_reference_upload(connection, target, content)
        current_count = len(plan["existing_ids"])
        inserted_count = len(plan["rows"]) - len(
            {row[target.primary_key] for row in plan["rows"]} & plan["existing_ids"]
        )
        updated_count = len(plan["rows"]) - inserted_count
        return {
            "target_key": target.key,
            "table_name": target.table_name,
            "operation": target.operation,
            "columns": plan["columns"],
            "row_count": len(plan["rows"]),
            "current_row_count": current_count,
            "inserted_count": inserted_count,
            "updated_count": updated_count,
            "deleted_count": len(plan["removed_ids"]),
        }


def apply_table_maintenance_csv(
    target_key: str,
    content: bytes,
    synced_by_user: str,
    synced_by_name: str,
) -> dict[str, int]:
    target = _get_maintenance_target(target_key)
    if target.operation == "sync":
        raise ValueError(f"'{target.table_name}' is sync-only and does not accept CSV uploads.")

    with engine.begin() as connection:
        if target.operation == "reference":
            plan = _prepare_reference_upload(connection, target, content)
            return _apply_reference_upload(connection, plan, target)

        table = _table_for(connection, target.table_name)
        columns = [column.name for column in table.columns]
        if not columns:
            raise RuntimeError(f"Database table '{TABLE_SCHEMA}.{target.table_name}' has no columns.")
        dataframe = _read_csv(content, columns)
        _validate_source_nips(dataframe, target.table_name)
        current_row_count = connection.scalar(
            select(func.count()).select_from(table)
        ) or 0
        connection.execute(delete(table))
        dataframe.to_sql(
            target.table_name,
            connection,
            schema=TABLE_SCHEMA,
            if_exists="append",
            index=False,
            chunksize=1000,
        )
        if target.table_name == TABLE_NAME:
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

    return {
        "row_count": len(dataframe),
        "inserted_count": len(dataframe),
        "updated_count": 0,
        "deleted_count": current_row_count,
    }


def validate_pbnopen_csv(content: bytes) -> dict[str, Any]:
    result = preview_table_maintenance_csv(TABLE_NAME, content)
    return {"columns": result["columns"], "row_count": result["row_count"]}


def replace_pbnopen_data(
    content: bytes,
    synced_by_user: str,
    synced_by_name: str,
) -> int:
    result = apply_table_maintenance_csv(
        TABLE_NAME,
        content,
        synced_by_user=synced_by_user,
        synced_by_name=synced_by_name,
    )
    return result["row_count"]


def _prepare_employee_sync(connection: Any, target: TableMaintenanceTarget) -> dict[str, Any]:
    source_table_name = target.source_table
    employee_table_name = target.table_name
    if source_table_name is None:
        raise RuntimeError(f"Sync target '{employee_table_name}' has no source table.")
    target_columns = {
        *EMPLOYEE_DIRECT_COLUMNS,
        *(target for target, _, _, _ in EMPLOYEE_REFERENCE_COLUMNS),
        "employee_id",
    }
    source_columns = {
        *EMPLOYEE_DIRECT_COLUMNS,
        *(source for _, source, _, _ in EMPLOYEE_REFERENCE_COLUMNS),
    }

    source_table = _table_for(connection, source_table_name)
    employee_table = _table_for(connection, employee_table_name)
    missing_source = source_columns - set(source_table.c.keys())
    missing_target = target_columns - set(employee_table.c.keys())
    unexpected_source = set(source_table.c.keys()) - source_columns
    unexpected_target = set(employee_table.c.keys()) - target_columns
    if missing_source or missing_target or unexpected_source or unexpected_target:
        details = []
        if missing_source:
            details.append(f"missing {source_table_name} columns: {', '.join(sorted(missing_source))}")
        if missing_target:
            details.append(f"missing {employee_table_name} columns: {', '.join(sorted(missing_target))}")
        if unexpected_source:
            details.append(f"unmapped {source_table_name} columns: {', '.join(sorted(unexpected_source))}")
        if unexpected_target:
            details.append(f"unmapped {employee_table_name} columns: {', '.join(sorted(unexpected_target))}")
        raise RuntimeError("The employee source schemas do not match. " + "; ".join(details))
    if not isinstance(employee_table.c["Unit Eselon III"].type, String) or not isinstance(
        employee_table.c["Unit Eselon IV"].type,
        String,
    ):
        raise RuntimeError(
            f"'{employee_table_name}.Unit Eselon III' and 'Unit Eselon IV' must use text columns."
        )
    if [column.name for column in employee_table.primary_key.columns] != ["employee_id"]:
        raise RuntimeError(f"'{employee_table_name}.employee_id' must remain the table's primary key.")

    source_rows = connection.execute(select(source_table)).mappings().all()
    if not source_rows:
        raise ValueError(
            f"Cannot sync {employee_table_name} because {source_table_name} contains no rows."
        )

    source_nips: set[str] = set()
    for row in source_rows:
        nip = row["NIP"]
        if nip is None or not str(nip).strip():
            raise ValueError(
                f"Cannot sync {employee_table_name} because {source_table_name} contains a blank NIP."
            )
        nip = str(nip)
        if nip in source_nips:
            raise ValueError(
                f"Cannot sync {employee_table_name} because {source_table_name} contains duplicate NIPs."
            )
        source_nips.add(nip)

    reference_maps: dict[str, dict[str, int]] = {}
    for _, _, reference_name, id_column in EMPLOYEE_REFERENCE_COLUMNS:
        reference_table = _table_for(connection, reference_name)
        references: dict[str, int] = {}
        for reference in connection.execute(
            select(reference_table.c[id_column], reference_table.c.value)
        ).mappings():
            label = _employee_reference_label(reference["value"])
            if label is None:
                continue
            if label in references:
                raise ValueError(
                    f"Cannot sync {employee_table_name} because {reference_name}.value contains duplicate labels."
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
        for target_column, source_column, reference_name, _ in EMPLOYEE_REFERENCE_COLUMNS:
            label = _employee_reference_label(source_row[source_column])
            reference_id = reference_maps[reference_name].get(label) if label else None
            if label is not None and reference_id is None:
                unmapped_counts[source_column] += 1
            employee_row[target_column] = reference_id
        employee_rows.append(employee_row)

    missing_references = [
        f"{count} rows for {column}"
        for column, count in unmapped_counts.items()
        if count
    ]
    if missing_references:
        raise ValueError(
            f"Cannot sync {employee_table_name} because reference mappings are missing: "
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
        nip = str(nip)
        if nip in existing_by_nip:
            raise ValueError(f"Cannot sync {employee_table_name} because it contains duplicate NIPs.")
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
        nip = str(employee_row["NIP"])
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
    return {
        "source_table": source_table,
        "employee_table": employee_table,
        "source_count": len(source_rows),
        "existing_count": len(existing_rows),
        "updates": updates,
        "inserts": inserts,
        "update_statement": update_statement,
        "obsolete_employee_ids": obsolete_employee_ids,
    }


def _employee_sync_result(plan: dict[str, Any]) -> dict[str, int]:
    return {
        "row_count": plan["source_count"],
        "current_row_count": plan["existing_count"],
        "inserted_count": len(plan["inserts"]),
        "updated_count": len(plan["updates"]),
        "deleted_count": len(plan["obsolete_employee_ids"]),
    }


def preview_employee_table_sync(target_key: str) -> dict[str, Any]:
    target = _get_maintenance_target(target_key)
    if target.operation != "sync":
        raise ValueError(f"'{target.table_name}' does not support employee synchronization.")
    with engine.connect() as connection:
        plan = _prepare_employee_sync(connection, target)
    return {
        "target_key": target.key,
        "table_name": target.table_name,
        "operation": target.operation,
        "source_table": target.source_table,
        **_employee_sync_result(plan),
    }


def sync_employee_table(target_key: str) -> dict[str, int]:
    target = _get_maintenance_target(target_key)
    if target.operation != "sync":
        raise ValueError(f"'{target.table_name}' does not support employee synchronization.")
    with engine.begin() as connection:
        plan = _prepare_employee_sync(connection, target)
        employee_table = plan["employee_table"]
        if plan["updates"]:
            connection.execute(plan["update_statement"], plan["updates"])
        if plan["inserts"]:
            connection.execute(insert(employee_table), plan["inserts"])
        if plan["obsolete_employee_ids"]:
            connection.execute(
                delete(employee_table).where(
                    employee_table.c.employee_id.in_(plan["obsolete_employee_ids"])
                )
            )

        row_count = connection.scalar(
            select(func.count()).select_from(employee_table)
        ) or 0
        if row_count != plan["source_count"]:
            raise RuntimeError(
                f"{target.table_name} sync produced {row_count} rows for a "
                f"{plan['source_count']}-row source."
            )
    return _employee_sync_result(plan)


def sync_dt_employee_from_pbnopen() -> int:
    return sync_employee_table(EMPLOYEE_TABLE_NAME)["row_count"]
