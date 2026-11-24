from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.menu_access import require_menu_access
from app.api.mutation_analysis import (
    count_talent_finder_matches,
    get_talent_finder_filter_options,
    search_talent_finder_employees,
)
from app.history_db import get_history_db
from app.models.auth import User
from app.models.candidate_preparation import (
    CandidatePreparationCandidate,
    CandidatePreparationCandidateSnapshot,
    CandidatePreparationWorkspace,
)
from app.schemas.candidate_preparation import (
    CandidatePreparationCandidateCreate,
    CandidatePreparationCandidateRead,
    CandidatePreparationCandidateUpdate,
    CandidatePreparationWorkspaceCreate,
    CandidatePreparationWorkspaceRead,
    CandidatePreparationWorkspaceUpdate,
)
from app.schemas.mutation_analysis import (
    MutationTalentFinderCountResponse,
    MutationTalentFinderFilterOptions,
    MutationTalentFinderSearchRequest,
    MutationTalentFinderSearchResponse,
)
from app.services import candidate_preparation_service as candidate_service


router = APIRouter(
    prefix="/candidate-preparation",
    tags=["candidate preparation"],
    dependencies=[Depends(require_menu_access("penyusunan-kandidat"))],
)


def _get_owned_workspace(
    db: Session,
    workspace_id: str,
    username: str,
) -> CandidatePreparationWorkspace:
    workspace = db.scalar(
        select(CandidatePreparationWorkspace).where(
            CandidatePreparationWorkspace.id == workspace_id,
            CandidatePreparationWorkspace.created_by == username,
        )
    )
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return workspace


def _candidate_read(
    candidate: CandidatePreparationCandidate,
    profile: dict[str, object] | None,
    snapshot: CandidatePreparationCandidateSnapshot | None = None,
) -> dict[str, object]:
    employee = profile or {}
    staged = snapshot
    return {
        "employee_id": candidate.employee_id,
        "sort_order": candidate.sort_order,
        "consideration": candidate.consideration,
        "nip": staged.nip if staged is not None else str(employee.get("nip") or ""),
        "nama": staged.nama if staged is not None else str(employee.get("nama") or ""),
        "eselon_id": staged.eselon_id if staged is not None else employee.get("eselon_id"),
        "eselon": staged.eselon if staged is not None else str(employee.get("eselon") or ""),
        "jabatan": staged.jabatan if staged is not None else str(employee.get("jabatan") or ""),
        "unit_eselon_ii": staged.unit_eselon_ii if staged is not None else str(employee.get("unit_eselon_ii") or ""),
        "unit_eselon_iii": staged.unit_eselon_iii if staged is not None else str(employee.get("unit_eselon_iii") or ""),
        "gol": staged.gol if staged is not None else str(employee.get("gol") or ""),
        "pangkat": staged.pangkat if staged is not None else str(employee.get("pangkat") or ""),
        "pendidikan": staged.pendidikan if staged is not None else str(employee.get("pendidikan") or ""),
        "jurusan": staged.jurusan if staged is not None else str(employee.get("jurusan") or ""),
        "universitas": staged.universitas if staged is not None else str(employee.get("universitas") or ""),
        "tmt_jabatan": staged.tmt_jabatan if staged is not None else str(employee.get("tmt_jabatan") or ""),
        "tanggal_lahir": staged.tanggal_lahir if staged is not None else str(employee.get("tanggal_lahir") or ""),
        "riwayat_jabatan": (
            staged.riwayat_jabatan
            if staged is not None and staged.riwayat_jabatan.strip()
            else str(employee.get("riwayat_jabatan") or "")
        ),
    }


def _snapshot_values(profile: dict[str, object]) -> dict[str, object]:
    return {
        "nip": str(profile.get("nip") or ""),
        "nama": str(profile.get("nama") or ""),
        "eselon_id": profile.get("eselon_id"),
        "eselon": str(profile.get("eselon") or ""),
        "jabatan": str(profile.get("jabatan") or ""),
        "unit_eselon_ii": str(profile.get("unit_eselon_ii") or ""),
        "unit_eselon_iii": str(profile.get("unit_eselon_iii") or ""),
        "gol": str(profile.get("gol") or ""),
        "pangkat": str(profile.get("pangkat") or ""),
        "pendidikan": str(profile.get("pendidikan") or ""),
        "jurusan": str(profile.get("jurusan") or ""),
        "universitas": str(profile.get("universitas") or ""),
        "tmt_jabatan": str(profile.get("tmt_jabatan") or ""),
        "tanggal_lahir": str(profile.get("tanggal_lahir") or ""),
        "riwayat_jabatan": str(profile.get("riwayat_jabatan") or ""),
    }


def _fetch_profiles_or_503(
    employee_ids: list[int],
    *,
    include_history: bool = False,
) -> dict[int, dict[str, object]]:
    try:
        return candidate_service.fetch_employee_profiles(
            employee_ids,
            include_history=include_history,
        )
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not load employee records from pbncleaner.dt_employee.",
        ) from exc


@router.get(
    "/talent-finder/filter-options",
    response_model=MutationTalentFinderFilterOptions,
)
def candidate_talent_finder_filter_options(
    user: User = Depends(get_current_user),
):
    return get_talent_finder_filter_options(user)


@router.post(
    "/talent-finder/count",
    response_model=MutationTalentFinderCountResponse,
)
def candidate_talent_finder_count(
    request: MutationTalentFinderSearchRequest,
    user: User = Depends(get_current_user),
):
    return count_talent_finder_matches(request, user)


@router.post(
    "/talent-finder/search",
    response_model=MutationTalentFinderSearchResponse,
)
def candidate_talent_finder_search(
    request: MutationTalentFinderSearchRequest,
    user: User = Depends(get_current_user),
):
    return search_talent_finder_employees(request, user)


@router.get(
    "/workspaces",
    response_model=list[CandidatePreparationWorkspaceRead],
)
def list_candidate_workspaces(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    priority_order = case(
        (CandidatePreparationWorkspace.priority == "high", 0),
        (CandidatePreparationWorkspace.priority == "med", 1),
        else_=2,
    )
    try:
        return db.scalars(
            select(CandidatePreparationWorkspace)
            .where(CandidatePreparationWorkspace.created_by == user.user)
            .order_by(
                priority_order,
                CandidatePreparationWorkspace.updated_at.desc(),
                CandidatePreparationWorkspace.created_at.desc(),
            )
        ).all()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not load candidate preparation workspaces.",
        ) from exc


@router.post(
    "/workspaces",
    response_model=CandidatePreparationWorkspaceRead,
    status_code=201,
)
def create_candidate_workspace(
    request: CandidatePreparationWorkspaceCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    workspace = CandidatePreparationWorkspace(
        id=str(uuid4()),
        created_by=user.user,
        **request.model_dump(),
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
            detail="Could not create the candidate preparation workspace.",
        ) from exc


@router.put(
    "/workspaces/{workspace_id}",
    response_model=CandidatePreparationWorkspaceRead,
)
def update_candidate_workspace(
    workspace_id: str,
    request: CandidatePreparationWorkspaceUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    workspace = _get_owned_workspace(db, workspace_id, user.user)
    for field, value in request.model_dump().items():
        setattr(workspace, field, value)
    try:
        db.commit()
        db.refresh(workspace)
        return workspace
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Could not update the candidate preparation workspace.",
        ) from exc


@router.delete("/workspaces/{workspace_id}", status_code=204)
def delete_candidate_workspace(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    workspace = _get_owned_workspace(db, workspace_id, user.user)
    try:
        db.delete(workspace)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Could not delete the candidate preparation workspace.",
        ) from exc
    return Response(status_code=204)


@router.get(
    "/workspaces/{workspace_id}/candidates",
    response_model=list[CandidatePreparationCandidateRead],
)
def list_candidate_workspace_candidates(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    _get_owned_workspace(db, workspace_id, user.user)
    try:
        candidates = db.scalars(
            select(CandidatePreparationCandidate)
            .where(CandidatePreparationCandidate.workspace_id == workspace_id)
            .order_by(
                CandidatePreparationCandidate.sort_order,
                CandidatePreparationCandidate.created_at,
                CandidatePreparationCandidate.employee_id,
            )
        ).all()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not load saved candidates.",
        ) from exc

    profiles = _fetch_profiles_or_503(
        [candidate.employee_id for candidate in candidates],
        include_history=True,
    )
    snapshots = {
        snapshot.employee_id: snapshot
        for snapshot in db.scalars(
            select(CandidatePreparationCandidateSnapshot).where(
                CandidatePreparationCandidateSnapshot.workspace_id == workspace_id,
                CandidatePreparationCandidateSnapshot.employee_id.in_(
                    [candidate.employee_id for candidate in candidates]
                ),
            )
        ).all()
    }
    return [
        _candidate_read(
            candidate,
            profiles.get(candidate.employee_id),
            snapshots.get(candidate.employee_id),
        )
        for candidate in candidates
    ]


@router.post(
    "/workspaces/{workspace_id}/candidates",
    response_model=CandidatePreparationCandidateRead,
    status_code=201,
)
def add_candidate_to_workspace(
    workspace_id: str,
    request: CandidatePreparationCandidateCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    _get_owned_workspace(db, workspace_id, user.user)
    profiles = _fetch_profiles_or_503(
        [request.employee_id],
        include_history=True,
    )
    profile = profiles.get(request.employee_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Employee not found.")
    if profile.get("eselon_id") not in candidate_service.ALLOWED_ESELON_IDS:
        raise HTTPException(
            status_code=422,
            detail="Only employees with Eselon ID 2, 3, 4, or 6 may be selected.",
        )

    existing = db.get(
        CandidatePreparationCandidate,
        (workspace_id, request.employee_id),
    )
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="This employee is already selected in the workspace.",
        )
    last_order = db.scalar(
        select(func.max(CandidatePreparationCandidate.sort_order)).where(
            CandidatePreparationCandidate.workspace_id == workspace_id,
        )
    )
    candidate = CandidatePreparationCandidate(
        workspace_id=workspace_id,
        employee_id=request.employee_id,
        sort_order=(last_order if last_order is not None else -1) + 1,
        consideration=request.consideration,
    )
    db.add(candidate)
    snapshot = CandidatePreparationCandidateSnapshot(
        workspace_id=workspace_id,
        employee_id=request.employee_id,
        **_snapshot_values(profile),
    )
    db.add(snapshot)
    try:
        db.commit()
        db.refresh(candidate)
        db.refresh(snapshot)
        return _candidate_read(candidate, profile, snapshot)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This employee is already selected in the workspace.",
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Could not save the selected candidate.",
        ) from exc


@router.put(
    "/workspaces/{workspace_id}/candidates/{employee_id}",
    response_model=CandidatePreparationCandidateRead,
)
def update_candidate_consideration(
    workspace_id: str,
    employee_id: int,
    request: CandidatePreparationCandidateUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    _get_owned_workspace(db, workspace_id, user.user)
    candidate = db.get(
        CandidatePreparationCandidate,
        (workspace_id, employee_id),
    )
    if candidate is None:
        raise HTTPException(status_code=404, detail="Selected candidate not found.")
    profiles = _fetch_profiles_or_503(
        [employee_id],
        include_history=True,
    )
    candidate.consideration = request.consideration
    snapshot = db.get(
        CandidatePreparationCandidateSnapshot,
        (workspace_id, employee_id),
    )
    if snapshot is None:
        snapshot = CandidatePreparationCandidateSnapshot(
            workspace_id=workspace_id,
            employee_id=employee_id,
        )
        db.add(snapshot)
    for field, value in request.model_dump(
        exclude={"consideration"},
        exclude_unset=True,
    ).items():
        if value is None:
            continue
        setattr(snapshot, field, value)
    try:
        db.commit()
        db.refresh(candidate)
        db.refresh(snapshot)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Could not save the staged candidate details.",
        ) from exc

    return _candidate_read(candidate, profiles.get(employee_id), snapshot)


@router.delete(
    "/workspaces/{workspace_id}/candidates/{employee_id}",
    status_code=204,
)
def remove_candidate_from_workspace(
    workspace_id: str,
    employee_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    _get_owned_workspace(db, workspace_id, user.user)
    candidate = db.get(
        CandidatePreparationCandidate,
        (workspace_id, employee_id),
    )
    if candidate is None:
        raise HTTPException(status_code=404, detail="Selected candidate not found.")
    try:
        db.delete(candidate)
        snapshot = db.get(
            CandidatePreparationCandidateSnapshot,
            (workspace_id, employee_id),
        )
        if snapshot is not None:
            db.delete(snapshot)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Could not remove the selected candidate.",
        ) from exc
    return Response(status_code=204)


@router.post("/workspaces/{workspace_id}/export")
def export_candidate_workspace(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_history_db),
):
    workspace = _get_owned_workspace(db, workspace_id, user.user)
    try:
        candidates = db.scalars(
            select(CandidatePreparationCandidate)
            .where(CandidatePreparationCandidate.workspace_id == workspace_id)
            .order_by(
                CandidatePreparationCandidate.sort_order,
                CandidatePreparationCandidate.created_at,
                CandidatePreparationCandidate.employee_id,
            )
        ).all()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not load selected candidates for export.",
        ) from exc

    if not candidates:
        raise HTTPException(
            status_code=422,
            detail="Select at least one candidate before exporting.",
        )

    employee_ids = [candidate.employee_id for candidate in candidates]
    profiles = _fetch_profiles_or_503(
        employee_ids,
        include_history=workspace.output_style == "Single",
    )
    missing_ids = [employee_id for employee_id in employee_ids if employee_id not in profiles]
    if missing_ids:
        raise HTTPException(
            status_code=422,
            detail=(
                "Some selected employees are no longer available in dt_employee: "
                + ", ".join(str(employee_id) for employee_id in missing_ids)
            ),
        )

    snapshots = {
        snapshot.employee_id: snapshot
        for snapshot in db.scalars(
            select(CandidatePreparationCandidateSnapshot).where(
                CandidatePreparationCandidateSnapshot.workspace_id == workspace_id,
                CandidatePreparationCandidateSnapshot.employee_id.in_(employee_ids),
            )
        ).all()
    }
    blocked_ids = [
        employee_id
        for employee_id in employee_ids
        if profiles[employee_id].get("eselon_id") not in candidate_service.ALLOWED_ESELON_IDS
        or (
            employee_id in snapshots
            and snapshots[employee_id].eselon_id not in candidate_service.ALLOWED_ESELON_IDS
        )
    ]
    if blocked_ids:
        raise HTTPException(
            status_code=422,
            detail=(
                "Only employees with Eselon ID 2, 3, 4, or 6 may be exported. "
                "Blocked employee IDs: "
                + ", ".join(str(employee_id) for employee_id in blocked_ids)
            ),
        )

    ordered_profiles = []
    for candidate in candidates:
        profile = dict(profiles[candidate.employee_id])
        profile["consideration"] = candidate.consideration
        snapshot = snapshots.get(candidate.employee_id)
        if snapshot is not None:
            staged_profile = {
                "nip": snapshot.nip,
                "nama": snapshot.nama,
                "eselon_id": snapshot.eselon_id,
                "eselon": snapshot.eselon,
                "jabatan": snapshot.jabatan,
                "unit_eselon_ii": snapshot.unit_eselon_ii,
                "unit_eselon_iii": snapshot.unit_eselon_iii,
                "gol": snapshot.gol,
                "pangkat": snapshot.pangkat,
                "pendidikan": snapshot.pendidikan,
                "jurusan": snapshot.jurusan,
                "universitas": snapshot.universitas,
                "tmt_jabatan": snapshot.tmt_jabatan,
                "tanggal_lahir": snapshot.tanggal_lahir,
            }
            profile.update(staged_profile)
            if snapshot.riwayat_jabatan.strip():
                profile["riwayat_jabatan"] = snapshot.riwayat_jabatan
        ordered_profiles.append(profile)

    try:
        if workspace.output_style == "Single":
            content = candidate_service.build_single_profiles(
                workspace.target_jabatan,
                ordered_profiles,
            )
            filename = "candidate_profiles_single.pptx"
            media_type = candidate_service.POWERPOINT_MEDIA_TYPE
        else:
            content = candidate_service.build_batch_profiles(
                workspace.target_jabatan,
                ordered_profiles,
            )
            filename = "candidate_profiles_batch.pptx"
            media_type = candidate_service.POWERPOINT_MEDIA_TYPE
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
