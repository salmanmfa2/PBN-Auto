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
    from app.models.cleaning_history import CleaningHistory  # noqa: F401
    from app.models.dataset_file import DatasetFile  # noqa: F401
    from app.models.dataset_run import DatasetRun  # noqa: F401

    Base.metadata.create_all(bind=engine)

    columns = {column["name"]: column for column in inspect(engine).get_columns("dataset_files")}
    if "google_drive_file_id" in columns and not columns["google_drive_file_id"]["nullable"]:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE dataset_files MODIFY google_drive_file_id VARCHAR(255) NULL")
            )
