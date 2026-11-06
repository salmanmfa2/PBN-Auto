from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class SheetPreview(BaseModel):
    name: str
    columns: List[str]
    rows: List[Dict[str, Any]]
    row_count: int
    column_count: int


class DatasetPreview(BaseModel):
    dataset_id: str
    selected_sheet: str
    sheets: List[SheetPreview]
    columns: List[str]
    rows: List[Dict[str, Any]]
    row_count: int
    column_count: int
    cleaning_warnings: List[str] = Field(default_factory=list)


class RemoveColumnsRequest(BaseModel):
    dataset_id: str
    columns_to_keep: List[str]
    sheet_name: Optional[str] = None


class RenameColumnsRequest(BaseModel):
    dataset_id: str
    rename_map: Dict[str, str]
    sheet_name: Optional[str] = None


class RemoveDuplicatesRequest(BaseModel):
    dataset_id: str
    columns: List[str]
    sheet_name: Optional[str] = None


class DeleteRowsRequest(BaseModel):
    dataset_id: str
    mode: Literal['first', 'last', 'custom']
    count: Optional[int] = None
    row: Optional[int] = None
    sheet_name: Optional[str] = None


class UseFirstRowAsHeaderRequest(BaseModel):
    dataset_id: str
    sheet_name: Optional[str] = None


class AutoCleanRequest(BaseModel):
    dataset_id: str
    mode: str
    sheet_name: Optional[str] = None


class CleaningMethodRecommendation(BaseModel):
    dataset_id: str
    sheet_name: str
    recommended_mode: Optional[str] = None
    template_name: Optional[str] = None
    confidence: str
    reason: str


class RemoveDuplicatesResponse(BaseModel):
    dataset_id: str
    original_rows: int
    removed_rows: int
    remaining_rows: int
    preview: DatasetPreview


class ErrorResponse(BaseModel):
    detail: str
