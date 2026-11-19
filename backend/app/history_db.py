import logging
import os
import re
from decimal import Decimal
from pathlib import Path
from typing import Generator

from dotenv import load_dotenv
from sqlalchemy import (
    MetaData,
    Table,
    case,
    create_engine,
    func,
    inspect,
    insert,
    or_,
    select,
    text,
    update,
)
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker


BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / ".env")


def _build_connection_url() -> str:
    explicit = os.getenv("CLEANING_DB_URL", "").strip()
    if explicit:
        return explicit

    host = os.getenv("MYSQL_HOST", "127.0.0.1")
    port = os.getenv("MYSQL_PORT", "3306")
    user = os.getenv("MYSQL_USER", "root")
    password = os.getenv("MYSQL_PASSWORD", "")
    database = os.getenv("MYSQL_DATABASE", "pbncleaner")
    return f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}"


DATABASE_URL = _build_connection_url()

Base = declarative_base()
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
logger = logging.getLogger(__name__)


def get_history_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _migrate_performance_schema(database_engine: Engine | None = None) -> None:
    from app.models.performance_kinerja import PerformanceKinerjaRecord

    if database_engine is None:
        database_engine = engine
    record_table = PerformanceKinerjaRecord.__table__
    record_columns = {
        column["name"]
        for column in inspect(database_engine).get_columns(record_table.name)
    }
    if "unit_eselon_iv" not in record_columns:
        if database_engine.dialect.name not in {"mysql", "mariadb", "sqlite"}:
            raise RuntimeError(
                f"Cannot add Unit Eselon IV data on {database_engine.dialect.name}."
            )
        with database_engine.begin() as connection:
            connection.execute(
                text(
                    "ALTER TABLE performance_kinerja_records "
                    "ADD COLUMN unit_eselon_iv VARCHAR(255) "
                    "NOT NULL DEFAULT 'Unidentified'"
                )
            )
    if "unit_kerja_id" not in record_columns:
        if database_engine.dialect.name not in {"mysql", "mariadb", "sqlite"}:
            raise RuntimeError(
                f"Cannot add Unit Kerja ID data on {database_engine.dialect.name}."
            )
        with database_engine.begin() as connection:
            connection.execute(
                text(
                    "ALTER TABLE performance_kinerja_records "
                    "ADD COLUMN unit_kerja_id INT NULL"
                )
            )
    performance_columns_to_add = {
        "nkp_perhitungan": "NUMERIC(18, 10) NULL",
        "status_nkp_perhitungan": (
            "VARCHAR(32) NOT NULL DEFAULT 'Tidak tersedia'"
        ),
    }
    for name, column_type in performance_columns_to_add.items():
        if name in record_columns:
            continue
        if database_engine.dialect.name not in {"mysql", "mariadb", "sqlite"}:
            raise RuntimeError(
                f"Cannot add {name} data on {database_engine.dialect.name}."
            )
        with database_engine.begin() as connection:
            connection.execute(
                text(
                    f"ALTER TABLE performance_kinerja_records "
                    f"ADD COLUMN {name} {column_type}"
                )
            )

    primary_key = inspect(database_engine).get_pk_constraint(record_table.name).get(
        "constrained_columns",
        [],
    ) or []
    expected_primary_key = ["dataset_id", "nip"]
    if set(primary_key) != set(expected_primary_key):
        if set(primary_key) != {"nip"}:
            raise RuntimeError(
                "The performance records table has an unsupported primary key; "
                "cannot safely preserve its data."
            )
        if database_engine.dialect.name in {"mysql", "mariadb"}:
            with database_engine.begin() as connection:
                connection.execute(
                    text(
                        "ALTER TABLE performance_kinerja_records "
                        "DROP PRIMARY KEY, ADD PRIMARY KEY (dataset_id, nip)"
                    )
                )
        elif database_engine.dialect.name == "sqlite":
            legacy_name = "performance_kinerja_records__pk_migration"
            with database_engine.begin() as connection:
                if legacy_name in inspect(connection).get_table_names():
                    raise RuntimeError(
                        f"Found {legacy_name}; inspect the interrupted migration before retrying."
                    )
                connection.exec_driver_sql(
                    f"ALTER TABLE {record_table.name} RENAME TO {legacy_name}"
                )
                legacy_table = Table(
                    legacy_name,
                    MetaData(),
                    autoload_with=connection,
                )
                record_table.create(connection)
                column_names = [
                    column.name
                    for column in record_table.columns
                    if column.name in legacy_table.c
                ]
                connection.execute(
                    record_table.insert().from_select(
                        column_names,
                        select(*(legacy_table.c[name] for name in column_names)),
                    )
                )
                legacy_table.drop(connection)
        else:
            raise RuntimeError(
                f"Cannot migrate performance records on {database_engine.dialect.name}."
            )

    inspector = inspect(database_engine)
    has_unique_period = any(
        constraint.get("column_names") == ["period"]
        for constraint in inspector.get_unique_constraints(
            "performance_kinerja_datasets"
        )
    ) or any(
        index.get("unique")
        and index.get("column_names") == ["period"]
        for index in inspector.get_indexes("performance_kinerja_datasets")
    )
    if not has_unique_period:
        with database_engine.begin() as connection:
            connection.execute(
                text(
                    "CREATE UNIQUE INDEX uq_performance_kinerja_dataset_period "
                    "ON performance_kinerja_datasets (period)"
                )
            )

    nkp_awal = record_table.c.nkp_awal
    nko = record_table.c.nko
    nkp_perhitungan_formula = case(
        (
            nkp_awal >= nko,
            nkp_awal * Decimal("0.70") + nko * Decimal("0.30"),
        ),
        else_=nkp_awal * Decimal("0.90") + nko * Decimal("0.10"),
    )
    displayed_nkp_perhitungan = func.round(
        record_table.c.nkp_perhitungan,
        2,
    )
    status_nkp_perhitungan = case(
        (record_table.c.nkp_perhitungan.is_(None), "Tidak tersedia"),
        (displayed_nkp_perhitungan >= Decimal("115"), "Sangat Istimewa"),
        (displayed_nkp_perhitungan >= Decimal("110"), "Istimewa"),
        (displayed_nkp_perhitungan >= Decimal("100"), "Tinggi"),
        (displayed_nkp_perhitungan >= Decimal("90"), "Sedang"),
        else_="Rendah",
    )
    with database_engine.begin() as connection:
        connection.execute(
            update(record_table)
            .where(
                record_table.c.nkp_perhitungan.is_(None),
                nkp_awal.is_not(None),
                nko.is_not(None),
            )
            .values(
                nkp_perhitungan=nkp_perhitungan_formula,
            )
        )
        connection.execute(
            update(record_table)
            .where(
                or_(
                    record_table.c.status_nkp_perhitungan.is_(None),
                    record_table.c.status_nkp_perhitungan != status_nkp_perhitungan,
                )
            )
            .values(status_nkp_perhitungan=status_nkp_perhitungan)
        )


def _auth_level_constraint_is_current(expression: str) -> bool:
    normalized = re.sub(r"[`\"()\s]", "", expression.casefold())
    return normalized == "auth_levelin1,2,3,4"


def _rebuild_sqlite_users_table_for_god_user(database_engine: Engine) -> None:
    from app.models.auth import User

    with database_engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys = OFF")
        connection.commit()
        try:
            with connection.begin():
                legacy_table = Table("users", MetaData(), autoload_with=connection)
                migrated_metadata = MetaData()
                migrated_table = User.__table__.to_metadata(
                    migrated_metadata,
                    name="users__god_user_migration",
                )
                legacy_columns = set(legacy_table.c.keys())
                migrated_columns = set(migrated_table.c.keys())
                if legacy_columns != migrated_columns:
                    missing_columns = sorted(migrated_columns - legacy_columns)
                    unexpected_columns = sorted(legacy_columns - migrated_columns)
                    details = []
                    if missing_columns:
                        details.append(f"missing columns: {', '.join(missing_columns)}")
                    if unexpected_columns:
                        details.append(f"unexpected columns: {', '.join(unexpected_columns)}")
                    raise RuntimeError(
                        "Cannot rebuild the users table without risking data loss; "
                        + "; ".join(details)
                        + "."
                    )

                migrated_table.create(connection)
                copied_columns = [column.name for column in migrated_table.columns]
                connection.execute(
                    insert(migrated_table).from_select(
                        copied_columns,
                        select(*(legacy_table.c[name] for name in copied_columns)),
                    )
                )
                connection.exec_driver_sql("DROP TABLE users")
                connection.exec_driver_sql(
                    "ALTER TABLE users__god_user_migration RENAME TO users"
                )
                violations = connection.exec_driver_sql("PRAGMA foreign_key_check").all()
                if violations:
                    raise RuntimeError(
                        "The users role migration found broken foreign-key references."
                    )
        finally:
            if connection.in_transaction():
                connection.rollback()
            connection.exec_driver_sql("PRAGMA foreign_keys = ON")
            connection.commit()


def _migrate_auth_level_role(database_engine: Engine | None = None) -> None:
    from app.models.auth import User

    if database_engine is None:
        database_engine = engine
    checks = inspect(database_engine).get_check_constraints("users")
    auth_checks = [
        check
        for check in checks
        if "auth_level" in (check.get("sqltext") or "").casefold()
    ]
    if len(auth_checks) > 1:
        raise RuntimeError("The users table has multiple auth-level checks; inspect them before migration.")
    if auth_checks and _auth_level_constraint_is_current(auth_checks[0].get("sqltext") or ""):
        constraint_is_current = True
    else:
        constraint_is_current = False

    if not constraint_is_current:
        if database_engine.dialect.name == "sqlite":
            _rebuild_sqlite_users_table_for_god_user(database_engine)
        elif database_engine.dialect.name in {"mysql", "mariadb"}:
            with database_engine.begin() as connection:
                actions = []
                if auth_checks:
                    constraint_name = auth_checks[0].get("name")
                    if not constraint_name:
                        raise RuntimeError(
                            "The users auth-level check has no name; inspect it before migration."
                        )
                    quoted_name = connection.dialect.identifier_preparer.quote(
                        constraint_name
                    )
                    drop_keyword = (
                        "DROP CONSTRAINT"
                        if getattr(connection.dialect, "is_mariadb", False)
                        else "DROP CHECK"
                    )
                    actions.append(f"{drop_keyword} {quoted_name}")
                actions.append(
                    "ADD CONSTRAINT chk_users_auth_level "
                    "CHECK (auth_level IN (1, 2, 3, 4))"
                )
                connection.execute(
                    text(f"ALTER TABLE users {', '.join(actions)}")
                )
        else:
            raise RuntimeError(
                f"Cannot migrate the Level 4 role on {database_engine.dialect.name}."
            )

    with database_engine.begin() as connection:
        owner_exists = connection.execute(
            select(User.user).where(User.user == "salmanmfa")
        ).first()
        if owner_exists is None:
            logger.warning(
                "The Level 4 role is enabled, but account 'salmanmfa' does not exist yet."
            )
            return
        connection.execute(
            update(User)
            .where(User.user == "salmanmfa")
            .values(auth_level=4)
        )


def _migrate_mutation_analysis_schema(database_engine: Engine | None = None) -> None:
    if database_engine is None:
        database_engine = engine
    workspace_table = "mutation_analysis_workspaces"
    if not inspect(database_engine).has_table(workspace_table):
        return
    columns = {
        column["name"]
        for column in inspect(database_engine).get_columns(workspace_table)
    }
    additions = {
        "tmt": "DATE NULL",
        "status": "VARCHAR(16) NOT NULL DEFAULT 'Aktif'",
    }
    missing_columns = {
        name: definition
        for name, definition in additions.items()
        if name not in columns
    }
    if not missing_columns:
        return
    if database_engine.dialect.name not in {"mysql", "mariadb", "sqlite"}:
        raise RuntimeError(
            "Cannot add TMT and status fields to mutation analysis workspaces "
            f"on {database_engine.dialect.name}."
        )
    with database_engine.begin() as connection:
        for name, definition in missing_columns.items():
            connection.execute(
                text(
                    f"ALTER TABLE {workspace_table} "
                    f"ADD COLUMN {name} {definition}"
                )
            )


def init_history_db() -> None:
    from app.models.auth import User, UserPreference, UserSession  # noqa: F401
    from app.models.cleaning_history import CleaningHistory  # noqa: F401
    from app.models.dataset_file import DatasetFile  # noqa: F401
    from app.models.dataset_run import DatasetRun  # noqa: F401
    from app.models.menu_access import MenuAccessPolicy  # noqa: F401
    from app.models.mutation_analysis import (  # noqa: F401
        MutationAnalysisWorkspace,
        MutationAnalysisWorkspaceDataset,
    )
    from app.models.pbnopen_data_source_sync import PbnOpenDataSourceSync  # noqa: F401
    from app.models.performance_kinerja import (  # noqa: F401
        PerformanceCorrectionEditLog,
        PerformanceKinerjaDataset,
        PerformanceKinerjaInsight,
        PerformanceKinerjaRecord,
    )
    from app.models.pelantikan_agenda import (  # noqa: F401
        PelantikanAgenda,
        PelantikanAgendaPerson,
    )
    from app.models.plt_plh import PltPlhMonitoringRecord  # noqa: F401
    from app.models.user_feedback import UserFeedback  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _migrate_auth_level_role(engine)
    _migrate_mutation_analysis_schema(engine)

    performance_columns = {
        column["name"]
        for column in inspect(engine).get_columns("performance_kinerja_records")
    }
    performance_columns_to_add = {
        "unit_eselon_ii": "VARCHAR(255) NOT NULL DEFAULT 'Unidentified'",
        "eselon": "VARCHAR(255) NOT NULL DEFAULT 'Unidentified'",
        "unit_eselon_iii": "VARCHAR(255) NOT NULL DEFAULT 'Unidentified'",
    }
    missing_performance_columns = {
        name: column_type
        for name, column_type in performance_columns_to_add.items()
        if name not in performance_columns
    }
    if missing_performance_columns:
        with engine.begin() as connection:
            for name, column_type in missing_performance_columns.items():
                connection.execute(
                    text(
                        f"ALTER TABLE performance_kinerja_records "
                        f"ADD COLUMN {name} {column_type}"
                    )
                )

    _migrate_performance_schema()

    columns = {column["name"]: column for column in inspect(engine).get_columns("dataset_files")}
    if "google_drive_file_id" in columns and not columns["google_drive_file_id"]["nullable"]:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE dataset_files MODIFY google_drive_file_id VARCHAR(255) NULL")
            )

    people_columns = {
        column["name"] for column in inspect(engine).get_columns("pelantikan_agenda_people")
    }
    people_columns_to_add = {
        "source_no": "TEXT NULL",
        "source_nama_nip": "TEXT NULL",
        "source_jabatan_saat_ini": "TEXT NULL",
        "source_usul_jabatan_baru": "TEXT NULL",
        "eselon": "VARCHAR(32) NULL",
    }
    missing_people_columns = {
        name: column_type
        for name, column_type in people_columns_to_add.items()
        if name not in people_columns
    }
    if missing_people_columns:
        with engine.begin() as connection:
            for name, column_type in missing_people_columns.items():
                connection.execute(
                    text(
                        f"ALTER TABLE pelantikan_agenda_people "
                        f"ADD COLUMN {name} {column_type}"
                    )
                )

    agenda_columns = {
        column["name"] for column in inspect(engine).get_columns("pelantikan_agendas")
    }
    if "workflow_mode" not in agenda_columns:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "ALTER TABLE pelantikan_agendas "
                    "ADD COLUMN workflow_mode VARCHAR(16) NOT NULL DEFAULT 'single_sheet'"
                )
            )
    if "import_strategy" not in agenda_columns:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "ALTER TABLE pelantikan_agendas "
                    "ADD COLUMN import_strategy VARCHAR(24) NOT NULL DEFAULT 'single_sheet'"
                )
            )
            connection.execute(
                text(
                    "UPDATE pelantikan_agendas SET import_strategy = 'all_sheets' "
                    "WHERE workflow_mode = 'all_sheets'"
                )
            )

    people_columns = {
        column["name"] for column in inspect(engine).get_columns("pelantikan_agenda_people")
    }
    provenance_columns_to_add = {
        "source_sheet": "VARCHAR(255) NULL",
        "source_row_number": "INT NULL",
    }
    missing_provenance_columns = {
        name: column_type
        for name, column_type in provenance_columns_to_add.items()
        if name not in people_columns
    }
    if missing_provenance_columns:
        with engine.begin() as connection:
            for name, column_type in missing_provenance_columns.items():
                connection.execute(
                    text(
                        f"ALTER TABLE pelantikan_agenda_people "
                        f"ADD COLUMN {name} {column_type}"
                    )
                )

    plt_plh_columns = {
        column["name"]
        for column in inspect(engine).get_columns("plt_plh_monitoring_records")
    }
    if "pejabat_pengganti_nip" not in plt_plh_columns:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "ALTER TABLE plt_plh_monitoring_records "
                    "ADD COLUMN pejabat_pengganti_nip VARCHAR(32) NULL"
                )
            )
