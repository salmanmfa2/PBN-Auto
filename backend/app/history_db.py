import os
from pathlib import Path
from typing import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
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


def get_history_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_history_db() -> None:
    from app.models.auth import User, UserPreference, UserSession  # noqa: F401
    from app.models.cleaning_history import CleaningHistory  # noqa: F401
    from app.models.dataset_file import DatasetFile  # noqa: F401
    from app.models.dataset_run import DatasetRun  # noqa: F401
    from app.models.pbnopen_data_source_sync import PbnOpenDataSourceSync  # noqa: F401
    from app.models.performance_kinerja import (  # noqa: F401
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
