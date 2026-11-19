from fastapi import APIRouter, Depends, HTTPException

from app.api.menu_access import require_menu_access
from app.schemas.pbn_dashboard import (
    PbnDashboardFilters,
    PbnDashboardPeopleResponse,
    PbnDashboardResponse,
)
from app.services.pbn_dashboard_service import (
    build_pbnopen_dashboard,
    get_pbnopen_dashboard_people,
)


router = APIRouter(
    prefix="/insights-beta",
    tags=["insights-beta"],
    dependencies=[Depends(require_menu_access("insights-beta", "view"))],
)


@router.post("/pbn/dashboard", response_model=PbnDashboardResponse)
def get_pbnopen_dashboard(filters: PbnDashboardFilters):
    try:
        return build_pbnopen_dashboard(filters)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/pbn/dashboard/people", response_model=PbnDashboardPeopleResponse)
def get_pbnopen_dashboard_people_endpoint(filters: PbnDashboardFilters):
    try:
        return get_pbnopen_dashboard_people(filters)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
