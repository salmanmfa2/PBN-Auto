import json
from typing import Optional

from fastapi import APIRouter, Body, File, HTTPException, UploadFile
from fastapi.responses import Response

from app.services import dataset_service, powerpoint_service
from app.schemas.dataset import DatasetPreview

router = APIRouter(tags=["dataset"])
MAX_STAGED_POWERPOINTS = 20
MAX_STAGED_POWERPOINT_SIZE = 25 * 1024 * 1024
MAX_STAGED_POWERPOINT_TOTAL_SIZE = 100 * 1024 * 1024


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


@router.post("/export/powerpoint/merge")
async def merge_sitasi_profiles(files: list[UploadFile] = File(...)):
    try:
        if len(files) < 2:
            raise HTTPException(
                status_code=422,
                detail="Stage at least two PowerPoint files before combining them.",
            )
        if len(files) > MAX_STAGED_POWERPOINTS:
            raise HTTPException(
                status_code=422,
                detail=f"A maximum of {MAX_STAGED_POWERPOINTS} staged presentations can be combined at once.",
            )

        presentation_files = []
        total_size = 0
        for index, file in enumerate(files, start=1):
            if not (file.filename or "").casefold().endswith(".pptx"):
                raise HTTPException(
                    status_code=422,
                    detail=f"Staged item {index} must be a .pptx file.",
                )
            content = await file.read(MAX_STAGED_POWERPOINT_SIZE + 1)
            if len(content) > MAX_STAGED_POWERPOINT_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"Staged item {index} exceeds the 25 MB limit.",
                )
            total_size += len(content)
            if total_size > MAX_STAGED_POWERPOINT_TOTAL_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail="The combined PowerPoint upload exceeds the 100 MB limit.",
                )
            presentation_files.append(content)

        data = powerpoint_service.merge_sitasi_presentations(
            presentation_files
        )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    finally:
        for file in files:
            await file.close()

    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": 'attachment; filename="sitasi_profiles_combined.pptx"'},
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
