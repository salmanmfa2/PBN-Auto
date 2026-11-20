from calendar import monthrange
from datetime import date, datetime
import re
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import bindparam, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.menu_access import require_menu_access
from app.api.upload import persist_uploaded_file
from app.history_db import get_history_db
from app.history_db import engine
from app.models.auth import User
from app.models.dataset_run import DatasetRun
from app.models.cleaning_history import CleaningHistory
from app.models.mutation_analysis import (
    MutationAnalysisWorkspace,
    MutationAnalysisWorkspaceDataset,
)
from app.schemas.mutation_analysis import (
    MutationLookupRequest,
    MutationLookupResponse,
    MutationWorkspaceCategoriesUpdate,
    MutationWorkspaceDatasetAnalysis,
    MutationWorkspaceDatasetAnalysisRequest,
    MutationTalentFinderEmployee,
    MutationTalentFinderCountResponse,
    MutationTalentFinderFilterOptions,
    MutationTalentFinderOption,
    MutationTalentFinderSearchRequest,
    MutationTalentFinderSearchResponse,
    MutationWorkspaceCreate,
    MutationWorkspaceDatasetUpdate,
    MutationWorkspaceDatasetState,
    MutationWorkspaceRead,
    MutationWorkspaceUpdate,
)
from app.schemas.dataset import DatasetPreview
from app.services import dataset_service, stored_dataset_service
from app.storage.dataset_store import DatasetStore


router = APIRouter(
    prefix="/mutation-analysis",
    tags=["mutation analysis"],
    dependencies=[Depends(require_menu_access("analisis-mutasi"))],
)

MANUAL_CATEGORY_COLUMN = "__mutation_manual_category"
UNIDENTIFIED_CATEGORY = "Pilih/Unidentified"
MUTATION_CATEGORIES = {
    "Mutasi",
    "Perpindahan dari Fungsional",
    "Promosi",
    "Demosi",
}
PENGAWAS_CATEGORY_BY_ESELON_ID = {
    4: "Mutasi",
    6: "Perpindahan dari Fungsional",
    5: "Promosi",
    7: "Promosi",
    8: "Promosi",
    9: "Promosi",
    10: "Promosi",
    1: "Demosi",
    2: "Demosi",
    3: "Demosi",
    11: "Demosi",
}
ADMINISTRATOR_CATEGORY_BY_ESELON_ID = {
    11: "Mutasi",
    3: "Mutasi",
    4: "Promosi",
    5: "Promosi",
    6: "Promosi",
    2: "Demosi",
}
LOOKUP_BATCH_SIZE = 500
TALENT_FINDER_TMT_COLUMN_BY_ESELON_ID = {
    3: "TMT Es3",
    2: "TMT Es2",
    4: "TMT Es4",
    11: "TMT JF Ahli Madya",
    6: "TMT JF Ahli Muda",
    7: "TMT JF Keterampilan",
    8: "TMT JF Keterampilan",
    10: "TMT JF Keterampilan",
    9: "TMT JF Keahlian",
}
TALENT_FINDER_SORT_COLUMNS = {
    "nama": "LOWER(COALESCE(employee.`Nama Gelar`, ''))",
    "eselon": "LOWER(COALESCE(eselon_ref.`value`, ''))",
    "usia": "employee.`Usia (th.)`",
    "jabatan": "LOWER(COALESCE(employee.`Jabatan`, ''))",
    "pendidikan": "LOWER(COALESCE(pendidikan_ref.`value`, ''))",
    "jurusan": "LOWER(COALESCE(employee.`Jurusan`, ''))",
    "universitas": "LOWER(COALESCE(employee.`Universitas/Sekolah Tinggi`, ''))",
    "homebase": "employee.`Homebase`",
    "lama_jabatan": "employee.`TMT Jabatan`",
    "lama_eselon": """
        CASE employee.`eselon_id`
          WHEN 3 THEN employee.`TMT Es3`
          WHEN 2 THEN employee.`TMT Es2`
          WHEN 4 THEN employee.`TMT Es4`
          WHEN 11 THEN employee.`TMT JF Ahli Madya`
          WHEN 6 THEN employee.`TMT JF Ahli Muda`
          WHEN 7 THEN employee.`TMT JF Keterampilan`
          WHEN 8 THEN employee.`TMT JF Keterampilan`
          WHEN 10 THEN employee.`TMT JF Keterampilan`
          WHEN 9 THEN employee.`TMT JF Keahlian`
          ELSE NULL
        END
    """,
}


def _normalize_lookup_nip(value: object) -> str | None:
    if value is None:
        return None
    digits = re.sub(r"\D", "", str(value))
    return digits[-18:] if len(digits) >= 18 else None


def _format_job_duration(value: object, today: date | None = None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        start = value.date()
    elif isinstance(value, date):
        start = value
    elif isinstance(value, str):
        try:
            start = datetime.fromisoformat(value.strip().replace("Z", "+00:00")).date()
        except ValueError:
            start = None
            for date_format in ("%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
                try:
                    start = datetime.strptime(value.strip(), date_format).date()
                    break
                except ValueError:
                    continue
            if start is None:
                return None
    else:
        return None

    end = today or date.today()
    if start > end:
        return "0 Tahun 0 Bulan"

    months = (end.year - start.year) * 12 + end.month - start.month
    if end.day < min(start.day, monthrange(end.year, end.month)[1]):
        months -= 1
    months = max(months, 0)
    return f"{months // 12} Tahun {months % 12} Bulan"


def _category_for_eselon_id(
    eselon_id: int | None,
    eselon_choice: str = "Pengawas",
) -> str | None:
    categories = (
        ADMINISTRATOR_CATEGORY_BY_ESELON_ID
        if eselon_choice == "Administrator"
        else PENGAWAS_CATEGORY_BY_ESELON_ID
    )
    return categories.get(eselon_id)


def _lookup_employee_records(
    nips: set[str],
    eselon_choice: str = "Pengawas",
) -> dict[str, dict[str, Any]]:
    if not nips:
        return {}

    statement = text(
        """
        SELECT e.`NIP`, e.`Nama Gelar`, e.`Jabatan`,
               e.`Unit Eselon II`, e.`Unit Eselon III`, e.`Unit Eselon IV`,
               e.`eselon_id`, e.`TMT Jabatan`,
               r.`value` AS Eselon
        FROM pbncleaner.dt_employee AS e
        LEFT JOIN pbncleaner.ref_eselon AS r
          ON e.eselon_id = r.eselon_id
        WHERE TRIM(REPLACE(CAST(e.`NIP` AS CHAR), CHAR(9), '')) IN :nips
        """
    ).bindparams(bindparam("nips", expanding=True))

    matches: dict[str, dict[str, Any]] = {}
    ordered_nips = sorted(nips)
    try:
        with engine.connect() as connection:
            for start in range(0, len(ordered_nips), LOOKUP_BATCH_SIZE):
                requested_nips = ordered_nips[start : start + LOOKUP_BATCH_SIZE]
                rows = connection.execute(
                    statement,
                    {"nips": requested_nips},
                ).mappings().all()
                for row in rows:
                    nip = _normalize_lookup_nip(row["NIP"])
                    if not nip:
                        continue
                    raw_eselon_id = row["eselon_id"]
                    try:
                        eselon_id = int(raw_eselon_id) if raw_eselon_id is not None else None
                    except (TypeError, ValueError):
                        eselon_id = None
                    matches[nip] = {
                        "nip": nip,
                        "nama": str(row["Nama Gelar"] or "").strip(),
                        "jabatan": str(row["Jabatan"] or "").strip(),
                        "unit_eselon_ii": str(row["Unit Eselon II"] or "").strip(),
                        "unit_eselon_iii": str(row["Unit Eselon III"] or "").strip(),
                        "unit_eselon_iv": str(row["Unit Eselon IV"] or "").strip(),
                        "eselon": str(row["Eselon"] or "").strip(),
                        "eselon_id": eselon_id,
                        "kategori": _category_for_eselon_id(
                            eselon_id,
                            eselon_choice,
                        ),
                        "masa_jabatan": _format_job_duration(row["TMT Jabatan"]),
                    }
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not connect to pbncleaner.dt_employee.",
        ) from exc

    return matches


def _hide_manual_category_column(preview: dict) -> dict:
    preview["columns"] = [
        column for column in preview["columns"]
        if column != MANUAL_CATEGORY_COLUMN
    ]
    preview["column_count"] = len(preview["columns"])
    for sheet in preview["sheets"]:
        sheet["columns"] = [
            column for column in sheet["columns"]
            if column != MANUAL_CATEGORY_COLUMN
        ]
        sheet["column_count"] = len(sheet["columns"])
    return preview


def _talent_finder_filter_query_parts(
    request: MutationTalentFinderSearchRequest,
) -> tuple[str, dict[str, Any], list[Any]]:
    filters: list[str] = []
    parameters: dict[str, Any] = {}
    expanding_parameters = []
    if request.eselon_ids:
        filters.append("employee.`eselon_id` IN :eselon_ids")
        parameters["eselon_ids"] = sorted(set(request.eselon_ids))
        expanding_parameters.append(bindparam("eselon_ids", expanding=True))
    if request.rumpun_ids:
        filters.append("employee.`rumpun_id` IN :rumpun_ids")
        parameters["rumpun_ids"] = sorted(set(request.rumpun_ids))
        expanding_parameters.append(bindparam("rumpun_ids", expanding=True))

    name_query = request.name.strip().casefold()
    if name_query:
        escaped_name = (
            name_query.replace("!", "!!")
            .replace("%", "!%")
            .replace("_", "!_")
        )
        filters.append(
            "LOWER(COALESCE(employee.`Nama Gelar`, '')) "
            "LIKE :name_pattern ESCAPE '!'"
        )
        parameters["name_pattern"] = f"%{escaped_name}%"

    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""
    return where_clause, parameters, expanding_parameters


@router.get(
    "/talent-finder/filter-options",
    response_model=MutationTalentFinderFilterOptions,
)
def get_talent_finder_filter_options(
    _: User = Depends(get_current_user),
):
    try:
        with engine.connect() as connection:
            eselon_rows = connection.execute(
                text(
                    "SELECT `eselon_id` AS id, `value` AS label "
                    "FROM pbncleaner.ref_eselon ORDER BY `eselon_id`"
                )
            ).mappings().all()
            rumpun_rows = connection.execute(
                text(
                    "SELECT `rumpun_id` AS id, `value` AS label "
                    "FROM pbncleaner.ref_rumpun_pendidikan ORDER BY `value`"
                )
            ).mappings().all()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not load Talent Finder filter options.",
        ) from exc

    return MutationTalentFinderFilterOptions(
        eselon=[
            MutationTalentFinderOption(id=int(row["id"]), label=str(row["label"] or ""))
            for row in eselon_rows
        ],
        rumpun=[
            MutationTalentFinderOption(id=int(row["id"]), label=str(row["label"] or ""))
            for row in rumpun_rows
        ],
    )


@router.post(
    "/talent-finder/count",
    response_model=MutationTalentFinderCountResponse,
)
def count_talent_finder_matches(
    request: MutationTalentFinderSearchRequest,
    _: User = Depends(get_current_user),
):
    where_clause, parameters, expanding_parameters = _talent_finder_filter_query_parts(request)
    statement = text(
        f"SELECT COUNT(*) FROM pbncleaner.dt_employee AS employee {where_clause}"
    )
    if expanding_parameters:
        statement = statement.bindparams(*expanding_parameters)
    try:
        with engine.connect() as connection:
            total = connection.execute(statement, parameters).scalar_one()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not count matching employees in pbncleaner.dt_employee.",
        ) from exc
    return MutationTalentFinderCountResponse(total=int(total))


@router.post(
    "/talent-finder/search",
    response_model=MutationTalentFinderSearchResponse,
)
def search_talent_finder_employees(
    request: MutationTalentFinderSearchRequest,
    _: User = Depends(get_current_user),
):
    where_clause, parameters, expanding_parameters = _talent_finder_filter_query_parts(request)
    sort_expression = TALENT_FINDER_SORT_COLUMNS[request.sort_by]
    sort_direction = request.sort_order.upper()
    if request.sort_by in {"lama_jabatan", "lama_eselon"}:
        sort_direction = "DESC" if request.sort_order == "asc" else "ASC"
    count_statement = text(
        f"SELECT COUNT(*) FROM pbncleaner.dt_employee AS employee {where_clause}"
    )
    employee_statement = text(
        f"""
        SELECT employee.`employee_id`, employee.`Nama Gelar` AS nama,
               eselon_ref.`value` AS eselon, employee.`Usia (th.)` AS usia,
               employee.`Jabatan` AS jabatan,
               pendidikan_ref.`value` AS pendidikan,
               employee.`Jurusan` AS jurusan,
               employee.`Universitas/Sekolah Tinggi` AS universitas,
               employee.`Homebase` AS homebase,
               employee.`eselon_id`,
               employee.`TMT Es3`, employee.`TMT Es2`, employee.`TMT Es4`,
               employee.`TMT JF Ahli Madya`, employee.`TMT JF Ahli Muda`,
               employee.`TMT JF Keterampilan`, employee.`TMT JF Keahlian`,
               employee.`TMT Jabatan`
        FROM pbncleaner.dt_employee AS employee
        LEFT JOIN pbncleaner.ref_eselon AS eselon_ref
          ON employee.`eselon_id` = eselon_ref.`eselon_id`
        LEFT JOIN pbncleaner.ref_pendidikan_terakhir AS pendidikan_ref
          ON employee.`pendidikan_id` = pendidikan_ref.`pendidikan_id`
        {where_clause}
        ORDER BY {sort_expression} {sort_direction}, employee.`employee_id` ASC
        LIMIT :limit OFFSET :offset
        """
    )
    if expanding_parameters:
        count_statement = count_statement.bindparams(*expanding_parameters)
        employee_statement = employee_statement.bindparams(*expanding_parameters)
    parameters["limit"] = request.page_size
    parameters["offset"] = (request.page - 1) * request.page_size

    try:
        with engine.connect() as connection:
            total = connection.execute(
                count_statement,
                {key: value for key, value in parameters.items() if key not in {"limit", "offset"}},
            ).scalar_one()
            rows = connection.execute(
                employee_statement,
                parameters,
            ).mappings().all()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not search pbncleaner.dt_employee.",
        ) from exc

    employees = []
    for row in rows:
        eselon_id = row["eselon_id"]
        tmt_column = TALENT_FINDER_TMT_COLUMN_BY_ESELON_ID.get(eselon_id)
        usia = row["usia"]
        try:
            normalized_age = int(usia) if usia is not None else None
        except (TypeError, ValueError):
            normalized_age = None
        employees.append(
            MutationTalentFinderEmployee(
                employee_id=int(row["employee_id"]),
                nama=str(row["nama"] or ""),
                eselon=str(row["eselon"] or ""),
                usia=normalized_age,
                jabatan=str(row["jabatan"] or ""),
                pendidikan=str(row["pendidikan"] or ""),
                jurusan=str(row["jurusan"] or ""),
                universitas=str(row["universitas"] or ""),
                lama_eselon=(
                    _format_job_duration(row[tmt_column])
                    if tmt_column is not None
                    else None
                ),
                lama_jabatan=_format_job_duration(row["TMT Jabatan"]),
                homebase=str(row["homebase"] or ""),
            )
        )

    return MutationTalentFinderSearchResponse(
        total=int(total),
        page=request.page,
        page_size=request.page_size,
        employees=employees,
    )


@router.post("/lookup-nips", response_model=MutationLookupResponse)
def lookup_nips(
    request: MutationLookupRequest,
    _: User = Depends(get_current_user),
):
    nips: list[str] = []
    invalid_count = 0
    for raw_nip in request.nips:
        normalized = _normalize_lookup_nip(raw_nip)
        if normalized is None:
            invalid_count += 1
        elif normalized not in nips:
            nips.append(normalized)

    if not nips:
        return MutationLookupResponse(
            matched_count=0,
            unmatched_count=0,
            invalid_count=invalid_count,
            matches={},
        )

    matches = _lookup_employee_records(set(nips))
    unmatched_count = len(nips) - len(matches)
    return MutationLookupResponse(
        matched_count=len(matches),
        unmatched_count=unmatched_count,
        invalid_count=invalid_count,
        matches=matches,
    )


def _save_workspace_dataset_version(
    db: Session,
    dataset_id: str,
    previous_sheets: dict[str, Any],
) -> None:
    try:
        stored_dataset_service.save_cleaned_version(
            db,
            dataset_id=dataset_id,
            content=dataset_service.export_excel(dataset_id),
        )
    except (KeyError, OSError, RuntimeError, SQLAlchemyError):
        DatasetStore.update(dataset_id, previous_sheets)
        raise


@router.post(
    "/workspaces/{workspace_id}/dataset/analyze",
    response_model=MutationWorkspaceDatasetAnalysis,
)
def analyze_workspace_dataset(
    workspace_id: str,
    request: MutationWorkspaceDatasetAnalysisRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    workspace = db.get(MutationAnalysisWorkspace, workspace_id)
    if workspace is None or workspace.created_by != user.user:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    assignment = db.get(MutationAnalysisWorkspaceDataset, workspace_id)
    if assignment is None:
        raise HTTPException(
            status_code=404,
            detail="This workspace does not have an uploaded dataset.",
        )

    dataset_id = assignment.dataset_id
    try:
        content, filename = stored_dataset_service.load_run_file(db, dataset_id)
        dataset_service.parse_upload(content, filename, dataset_id=dataset_id)
        sheets = DatasetStore.get(dataset_id)
        if sheets is None:
            raise RuntimeError("The workspace dataset could not be loaded.")
        if request.sheet_name not in sheets:
            raise KeyError(f"Sheet '{request.sheet_name}' not found.")

        previous_sheets = {
            sheet: dataframe.copy()
            for sheet, dataframe in sheets.items()
        }
        dataframe = sheets[request.sheet_name].copy()
        if "Kategori" not in dataframe.columns:
            raise ValueError("The cleaned dataset does not contain a 'Kategori' column.")
        nip_column = next(
            (
                column
                for column in dataframe.columns
                if re.sub(r"[^a-z0-9]", "", str(column).casefold()) == "nip"
            ),
            None,
        )
        if nip_column is None:
            raise ValueError("The cleaned dataset does not contain an NIP column.")

        nips_by_row = [
            _normalize_lookup_nip(value)
            for value in dataframe[nip_column]
        ]
        nips = {nip for nip in nips_by_row if nip is not None}
        employee_records = _lookup_employee_records(
            nips,
            workspace.eselon_choice,
        )

        duration_column = None
        if "TMT Jabatan Lama" in dataframe.columns:
            if "Masa Jabatan" in dataframe.columns:
                dataframe = dataframe.drop(columns=["TMT Jabatan Lama"])
                duration_column = "Masa Jabatan"
            else:
                dataframe = dataframe.rename(
                    columns={"TMT Jabatan Lama": "Masa Jabatan"}
                )
                duration_column = "Masa Jabatan"
        elif "Masa Jabatan" in dataframe.columns:
            duration_column = "Masa Jabatan"

        dataframe["Kategori"] = dataframe["Kategori"].astype(object)
        if duration_column is not None:
            dataframe[duration_column] = dataframe[duration_column].astype(object)

        manual_categories = (
            dataframe[MANUAL_CATEGORY_COLUMN]
            if MANUAL_CATEGORY_COLUMN in dataframe.columns
            else None
        )
        category_column_index = dataframe.columns.get_loc("Kategori")
        duration_column_index = (
            dataframe.columns.get_loc(duration_column)
            if duration_column is not None
            else None
        )
        for row_index, nip in enumerate(nips_by_row):
            employee = employee_records.get(nip) if nip else None
            manual_category = None
            if manual_categories is not None:
                saved_category = manual_categories.iloc[row_index]
                if isinstance(saved_category, str) and saved_category in MUTATION_CATEGORIES:
                    manual_category = saved_category
            dataframe.iat[row_index, category_column_index] = (
                manual_category
                or (employee["kategori"] if employee else None)
                or UNIDENTIFIED_CATEGORY
            )
            if duration_column_index is not None:
                dataframe.iat[row_index, duration_column_index] = (
                    employee["masa_jabatan"] if employee else None
                ) or "—"

        sheets[request.sheet_name] = dataframe
        DatasetStore.update(dataset_id, sheets)
        if not dataframe.equals(previous_sheets[request.sheet_name]):
            _save_workspace_dataset_version(db, dataset_id, previous_sheets)

        preview = _hide_manual_category_column(
            dataset_service.get_dataset_preview(dataset_id, request.sheet_name)
        )
        preview_nips = {
            _normalize_lookup_nip(row.get(nip_column))
            for row in preview["rows"]
        }
        preview_matches = {
            nip: employee_records[nip]
            for nip in preview_nips
            if nip is not None and nip in employee_records
        }
        invalid_count = sum(nip is None for nip in nips_by_row)
        return MutationWorkspaceDatasetAnalysis(
            preview=preview,
            matched_count=len(employee_records),
            unmatched_count=len(nips) - len(employee_records),
            invalid_count=invalid_count,
            matches=preview_matches,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\"")) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not save the workspace dataset analysis.",
        ) from exc


@router.put(
    "/workspaces/{workspace_id}/categories",
    response_model=DatasetPreview,
)
def update_workspace_categories(
    workspace_id: str,
    request: MutationWorkspaceCategoriesUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    workspace = db.get(MutationAnalysisWorkspace, workspace_id)
    if workspace is None or workspace.created_by != user.user:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    assignment = db.get(MutationAnalysisWorkspaceDataset, workspace_id)
    if assignment is None:
        raise HTTPException(
            status_code=404,
            detail="This workspace does not have an uploaded dataset.",
        )

    dataset_id = assignment.dataset_id
    try:
        content, filename = stored_dataset_service.load_run_file(db, dataset_id)
        dataset_service.parse_upload(content, filename, dataset_id=dataset_id)
        sheets = DatasetStore.get(dataset_id)
        if sheets is None:
            raise RuntimeError("The workspace dataset could not be loaded.")
        if request.sheet_name not in sheets:
            raise KeyError(f"Sheet '{request.sheet_name}' not found.")

        previous_sheets = {
            sheet: dataframe.copy()
            for sheet, dataframe in sheets.items()
        }
        dataframe = sheets[request.sheet_name].copy()
        if "Kategori" not in dataframe.columns:
            raise ValueError("The dataset does not contain a 'Kategori' column.")
        row_indices = [selection.row_index for selection in request.categories]
        if len(row_indices) != len(set(row_indices)):
            raise ValueError("Each category can only be saved once per row.")
        if any(row_index >= len(dataframe) for row_index in row_indices):
            raise ValueError("A selected row is outside the saved dataset.")

        if MANUAL_CATEGORY_COLUMN not in dataframe.columns:
            dataframe[MANUAL_CATEGORY_COLUMN] = None
        dataframe["Kategori"] = dataframe["Kategori"].astype(object)
        dataframe[MANUAL_CATEGORY_COLUMN] = dataframe[
            MANUAL_CATEGORY_COLUMN
        ].astype(object)
        category_column_index = dataframe.columns.get_loc("Kategori")
        manual_category_column_index = dataframe.columns.get_loc(
            MANUAL_CATEGORY_COLUMN
        )
        for selection in request.categories:
            category = selection.category
            dataframe.iat[
                selection.row_index,
                manual_category_column_index,
            ] = category
            dataframe.iat[
                selection.row_index,
                category_column_index,
            ] = category or UNIDENTIFIED_CATEGORY

        sheets[request.sheet_name] = dataframe
        DatasetStore.update(dataset_id, sheets)
        _save_workspace_dataset_version(db, dataset_id, previous_sheets)
        preview = dataset_service.get_dataset_preview(dataset_id, request.sheet_name)
        return _hide_manual_category_column(preview)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\"")) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not save the workspace categories.",
        ) from exc


@router.get("/workspaces", response_model=list[MutationWorkspaceRead])
def list_workspaces(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    try:
        rows = db.execute(
            select(MutationAnalysisWorkspace, MutationAnalysisWorkspaceDataset.dataset_id)
            .outerjoin(
                MutationAnalysisWorkspaceDataset,
                MutationAnalysisWorkspaceDataset.workspace_id
                == MutationAnalysisWorkspace.id,
            )
            .where(MutationAnalysisWorkspace.created_by == user.user)
            .order_by(MutationAnalysisWorkspace.created_at.desc())
        ).all()
        return [
            {
                "id": workspace.id,
                "eselon_choice": workspace.eselon_choice,
                "title": workspace.title,
                "description": workspace.description,
                "tmt": workspace.tmt,
                "status": workspace.status,
                "dataset_id": dataset_id,
                "created_at": workspace.created_at,
                "updated_at": workspace.updated_at,
            }
            for workspace, dataset_id in rows
        ]
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not load mutation analysis workspaces.",
        ) from exc


@router.post("/workspaces", response_model=MutationWorkspaceRead, status_code=201)
def create_workspace(
    request: MutationWorkspaceCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    if not request.title.strip():
        raise HTTPException(status_code=422, detail="Workspace title is required.")

    import uuid

    workspace = MutationAnalysisWorkspace(
        id=str(uuid.uuid4()),
        created_by=user.user,
        eselon_choice=request.eselon_choice,
        title=request.title.strip(),
        description=request.description.strip(),
        tmt=request.tmt,
        status=request.status,
    )
    db.add(workspace)
    try:
        db.commit()
        db.refresh(workspace)
        return workspace
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Could not create the mutation analysis workspace.",
        ) from exc


@router.put("/workspaces/{workspace_id}", response_model=MutationWorkspaceRead)
def update_workspace(
    workspace_id: str,
    request: MutationWorkspaceUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    workspace = db.get(MutationAnalysisWorkspace, workspace_id)
    if workspace is None or workspace.created_by != user.user:
        raise HTTPException(status_code=404, detail="Workspace not found.")

    workspace.title = request.title
    workspace.tmt = request.tmt
    workspace.description = request.description
    workspace.status = request.status
    try:
        db.commit()
        db.refresh(workspace)
        assignment = db.get(MutationAnalysisWorkspaceDataset, workspace_id)
        return {
            "id": workspace.id,
            "eselon_choice": workspace.eselon_choice,
            "title": workspace.title,
            "description": workspace.description,
            "tmt": workspace.tmt,
            "status": workspace.status,
            "dataset_id": assignment.dataset_id if assignment else None,
            "created_at": workspace.created_at,
            "updated_at": workspace.updated_at,
        }
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Could not update the mutation analysis workspace.",
        ) from exc


@router.put("/workspaces/{workspace_id}/dataset", response_model=MutationWorkspaceRead)
def assign_workspace_dataset(
    workspace_id: str,
    request: MutationWorkspaceDatasetUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    workspace = db.get(MutationAnalysisWorkspace, workspace_id)
    if workspace is None or workspace.created_by != user.user:
        raise HTTPException(status_code=404, detail="Workspace not found.")

    dataset = db.get(DatasetRun, request.dataset_id)
    if dataset is None or dataset.is_deleted:
        raise HTTPException(status_code=404, detail="Uploaded dataset not found.")

    existing_assignment = db.get(
        MutationAnalysisWorkspaceDataset,
        workspace_id,
    )
    assigned_elsewhere = db.scalar(
        select(MutationAnalysisWorkspaceDataset).where(
            MutationAnalysisWorkspaceDataset.dataset_id == request.dataset_id,
            MutationAnalysisWorkspaceDataset.workspace_id != workspace_id,
        )
    )
    if assigned_elsewhere is not None:
        raise HTTPException(
            status_code=409,
            detail="This uploaded dataset already belongs to another workspace.",
        )

    if existing_assignment is None:
        existing_assignment = MutationAnalysisWorkspaceDataset(
            workspace_id=workspace_id,
            dataset_id=request.dataset_id,
        )
        db.add(existing_assignment)
    else:
        existing_assignment.dataset_id = request.dataset_id
    try:
        db.commit()
        db.refresh(workspace)
        return {
            "id": workspace.id,
            "eselon_choice": workspace.eselon_choice,
            "title": workspace.title,
            "description": workspace.description,
            "tmt": workspace.tmt,
            "status": workspace.status,
            "dataset_id": request.dataset_id,
            "created_at": workspace.created_at,
            "updated_at": workspace.updated_at,
        }
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Could not assign the uploaded dataset to this workspace.",
        ) from exc


@router.post(
    "/workspaces/{workspace_id}/upload",
    response_model=DatasetPreview,
)
async def upload_workspace_dataset(
    workspace_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    workspace = db.get(MutationAnalysisWorkspace, workspace_id)
    if workspace is None or workspace.created_by != user.user:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return await persist_uploaded_file(
        file,
        db,
        workspace_id=workspace_id,
    )


@router.post(
    "/workspaces/{workspace_id}/dataset/restore",
    response_model=MutationWorkspaceDatasetState,
)
def restore_workspace_dataset(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    workspace = db.get(MutationAnalysisWorkspace, workspace_id)
    if workspace is None or workspace.created_by != user.user:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    assignment = db.get(MutationAnalysisWorkspaceDataset, workspace_id)
    if assignment is None:
        raise HTTPException(
            status_code=404,
            detail="This workspace does not have an uploaded dataset.",
        )
    try:
        original_content, original_filename = stored_dataset_service.load_run_file(
            db,
            assignment.dataset_id,
            file_role="original",
        )
        latest_content, latest_filename = stored_dataset_service.load_run_file(
            db,
            assignment.dataset_id,
        )
        raw_preview = dataset_service.parse_upload(
            original_content,
            original_filename,
            dataset_id=assignment.dataset_id,
        )
        preview = _hide_manual_category_column(
            dataset_service.parse_upload(
                latest_content,
                latest_filename,
                dataset_id=assignment.dataset_id,
            )
        )
        latest_cleaning = (
            db.query(CleaningHistory)
            .filter(
                CleaningHistory.dataset_id == assignment.dataset_id,
                CleaningHistory.action == "apply_auto_clean",
                CleaningHistory.status == "success",
            )
            .order_by(CleaningHistory.created_at.desc(), CleaningHistory.id.desc())
            .first()
        )
        auto_clean_mode = None
        if latest_cleaning and latest_cleaning.detail_json:
            mode = latest_cleaning.detail_json.get("mode")
            auto_clean_mode = str(mode) if mode is not None else None
        return {
            "raw_preview": raw_preview,
            "preview": preview,
            "auto_clean_mode": auto_clean_mode,
        }
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\"")) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=500,
            detail="Could not restore the workspace dataset.",
        ) from exc


@router.delete("/workspaces/{workspace_id}", status_code=204)
def delete_workspace(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    workspace = db.get(MutationAnalysisWorkspace, workspace_id)
    if workspace is None or workspace.created_by != user.user:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    db.query(MutationAnalysisWorkspaceDataset).filter(
        MutationAnalysisWorkspaceDataset.workspace_id == workspace_id
    ).delete(synchronize_session=False)
    db.delete(workspace)
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Could not delete the mutation analysis workspace.",
        ) from exc
