import os

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, URL


def _create_epride_engine() -> Engine:
    host = os.getenv("EPRIDE_DB_HOST", "").strip()
    user = os.getenv("EPRIDE_DB_USER", "").strip()
    password = os.getenv("EPRIDE_DB_PASSWORD", "")
    database = os.getenv("EPRIDE_DB_NAME", "epride").strip()
    try:
        port = int(os.getenv("EPRIDE_DB_PORT", "3306"))
    except ValueError as exc:
        raise RuntimeError("EPRIDE_DB_PORT must be a valid port number.") from exc

    if not host or not user or not password or not database:
        raise RuntimeError("EPRIDE database connection settings are incomplete.")
    if not 1 <= port <= 65535:
        raise RuntimeError("EPRIDE_DB_PORT must be between 1 and 65535.")

    return create_engine(
        URL.create(
            "mysql+pymysql",
            username=user,
            password=password,
            host=host,
            port=port,
            database=database,
        ),
        connect_args={"connect_timeout": 8, "read_timeout": 20},
    )


def fetch_available_source_periods() -> list[dict[str, object]]:
    source_engine = _create_epride_engine()
    try:
        with source_engine.connect() as connection:
            rows = connection.execute(
                text(
                    "SELECT DISTINCT f.year, f.tw "
                    "FROM dt_nkp_form AS f "
                    "JOIN dt_nkp_detil AS d ON d.nkp_form_id = f.id "
                    "WHERE f.status = 'kirim' "
                    "AND CHAR_LENGTH(TRIM(CAST(f.idUnit AS CHAR))) = 13 "
                    "AND TRIM(CAST(f.idUnit AS CHAR)) REGEXP '^[0-9]{13}$' "
                    "ORDER BY f.year DESC, f.tw"
                )
            ).mappings()
            return [dict(row) for row in rows]
    finally:
        source_engine.dispose()


def fetch_submitted_correction_rows(
    year: int,
    quarter: int,
) -> list[dict[str, object]]:
    source_engine = _create_epride_engine()
    try:
        with source_engine.connect() as connection:
            rows = connection.execute(
                text(
                    "SELECT f.id AS form_id, f.idUnit AS id_unit, "
                    "f.send_at AS submitted_at, d.nip, d.nilai_koreksi "
                    "FROM dt_nkp_form AS f "
                    "JOIN dt_nkp_detil AS d ON d.nkp_form_id = f.id "
                    "WHERE f.year = :year AND f.tw = :quarter AND f.status = 'kirim'"
                ),
                {"year": year, "quarter": quarter},
            ).mappings()
            return [dict(row) for row in rows]
    finally:
        source_engine.dispose()
