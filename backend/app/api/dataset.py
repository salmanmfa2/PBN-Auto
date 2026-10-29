import json
from typing import Optional

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import Response

from app.services import dataset_service, powerpoint_service
from app.schemas.dataset import DatasetPreview

router = APIRouter(tags=["dataset"])


def _parse_filters(raw_filters: Optional[str]) -> Optional[dict[str, object]]:
    if raw_filters is None or raw_filters == '':
        return None

    try:
        parsed = json.loads(raw_filters)
    except json.JSONDecodeError:
        return None

    if not isinstance(parsed, dict):
        return None

    cleaned = {
        str(key): [str(item) for item in value] if isinstance(value, list) else str(value)
        for key, value in parsed.items()
        if value is not None
    }
    return cleaned or None


@router.get("/dataset/{dataset_id}", response_model=DatasetPreview)
def get_dataset(dataset_id: str, sheet_name: Optional[str] = None):
    try:
        return dataset_service.get_dataset_preview(dataset_id, sheet_name)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\""))


@router.get("/export/csv/{dataset_id}")
def export_csv(dataset_id: str, sheet_name: Optional[str] = None, filters: Optional[str] = None):
    try:
        data = dataset_service.export_csv(dataset_id, sheet_name, _parse_filters(filters))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\""))
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="cleaned_data.csv"'},
    )


@router.post("/export/csv/{dataset_id}")
def export_filtered_csv(dataset_id: str, sheet_name: str, filters: Optional[dict[str, list[str]]] = Body(default=None)):
    try:
        data = dataset_service.export_csv(dataset_id, sheet_name, filters)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\""))
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="cleaned_data.csv"'},
    )


@router.get("/export/excel/{dataset_id}")
def export_excel(dataset_id: str, sheet_name: Optional[str] = None, filters: Optional[str] = None):
    try:
        data = dataset_service.export_excel(dataset_id, sheet_name, _parse_filters(filters))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\""))
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="cleaned_data.xlsx"'},
    )


@router.post("/export/excel/{dataset_id}")
def export_filtered_excel(dataset_id: str, sheet_name: str, filters: Optional[dict[str, list[str]]] = Body(default=None)):
    try:
        data = dataset_service.export_excel(dataset_id, sheet_name, filters)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\""))
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="cleaned_data.xlsx"'},
    )


@router.get("/export/powerpoint/{dataset_id}")
def export_sitasi_profiles(
    dataset_id: str,
    mode: str,
    sheet_name: str,
    filters: Optional[str] = None,
    template_variant: str = "standard",
):
    try:
        data = powerpoint_service.build_sitasi_profiles(
            dataset_id,
            sheet_name,
            mode,
            _parse_filters(filters),
            template_variant,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\""))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": 'attachment; filename="sitasi_profiles.pptx"'},
    )


@router.post("/export/powerpoint/{dataset_id}")
def export_filtered_sitasi_profiles(
    dataset_id: str,
    mode: str,
    sheet_name: str,
    filters: Optional[dict[str, list[str]]] = Body(default=None),
    template_variant: str = "standard",
):
    try:
        data = powerpoint_service.build_sitasi_profiles(
            dataset_id,
            sheet_name,
            mode,
            filters,
            template_variant,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'\""))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": 'attachment; filename="sitasi_profiles.pptx"'},
    )
