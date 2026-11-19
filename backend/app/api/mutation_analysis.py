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
from app.models.mutation_analysis import (
    MutationAnalysisWorkspace,
    MutationAnalysisWorkspaceDataset,
)
from app.schemas.mutation_analysis import (
    MutationLookupRequest,
    MutationLookupResponse,
    MutationWorkspaceCreate,
    MutationWorkspaceDatasetUpdate,
    MutationWorkspaceRead,
    MutationWorkspaceUpdate,
)
from app.schemas.dataset import DatasetPreview


router = APIRouter(
    prefix="/mutation-analysis",
    tags=["mutation analysis"],
    dependencies=[Depends(require_menu_access("analisis-mutasi"))],
)


@router.post("/lookup-nips", response_model=MutationLookupResponse)
def lookup_nips(
    request: MutationLookupRequest,
    _: User = Depends(get_current_user),
):
    nips: list[str] = []
    invalid_count = 0
    for raw_nip in request.nips:
        digits = "".join(character for character in str(raw_nip or "") if character.isdigit())
        normalized = digits[-18:] if len(digits) >= 18 else ""
        if len(normalized) != 18:
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

    statement = text(
        """
        SELECT e.`NIP`, e.`Nama Gelar`, e.`Jabatan`,
               e.`Unit Eselon II`, e.`Unit Eselon III`, e.`Unit Eselon IV`,
               r.`value` AS Eselon
        FROM pbncleaner.dt_employee AS e
        LEFT JOIN pbncleaner.ref_eselon AS r
          ON e.eselon_id = r.eselon_id
        WHERE TRIM(REPLACE(CAST(e.`NIP` AS CHAR), CHAR(9), '')) IN :nips
        """
    ).bindparams(bindparam("nips", expanding=True))

    try:
        with engine.connect() as connection:
            rows = connection.execute(statement, {"nips": nips}).mappings().all()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not connect to pbncleaner.dt_employee.",
        ) from exc

    matches: dict[str, dict[str, str]] = {}
    for row in rows:
        nip = "".join(character for character in str(row["NIP"] or "") if character.isdigit())
        if len(nip) == 18:
            matches[nip] = {
                "nip": nip,
                "nama": str(row["Nama Gelar"] or "").strip(),
                "jabatan": str(row["Jabatan"] or "").strip(),
                "unit_eselon_ii": str(row["Unit Eselon II"] or "").strip(),
                "unit_eselon_iii": str(row["Unit Eselon III"] or "").strip(),
                "unit_eselon_iv": str(row["Unit Eselon IV"] or "").strip(),
                "eselon": str(row["Eselon"] or "").strip(),
            }

    unmatched_count = len(nips) - len(matches)
    return MutationLookupResponse(
        matched_count=len(matches),
        unmatched_count=unmatched_count,
        invalid_count=invalid_count,
        matches=matches,
    )


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
