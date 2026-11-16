from fastapi import APIRouter, HTTPException

from app.schemas.pbn_dashboard import (
    PbnDashboardFilters,
    PbnDashboardPeopleResponse,
    PbnDashboardResponse,
)
from app.services.pbn_dashboard_service import build_pbn_dashboard, get_pbn_dashboard_people


router = APIRouter(prefix="/insights", tags=["insights"])


@router.post("/pbn/dashboard/{dataset_id}", response_model=PbnDashboardResponse)
def get_pbn_dashboard(
    dataset_id: str,
    filters: PbnDashboardFilters,
    sheet_name: str | None = None,
):
    try:
        return build_pbn_dashboard(dataset_id, sheet_name, filters)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\"")) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post(
    "/pbn/dashboard/{dataset_id}/people",
    response_model=PbnDashboardPeopleResponse,
)
def get_pbn_dashboard_people_endpoint(
    dataset_id: str,
    filters: PbnDashboardFilters,
    sheet_name: str | None = None,
):
    try:
        return get_pbn_dashboard_people(dataset_id, sheet_name, filters)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\"")) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
