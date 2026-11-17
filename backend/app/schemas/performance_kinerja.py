from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


PerformanceEmployeeSource = Literal["fetch_pbnopen", "dt_employee_q2_2026"]


class PerformanceDatasetStatus(BaseModel):
    period: str
    row_count: int
    uploaded_at: datetime
    uploaded_by_user: str
    uploaded_by_name: str


class PerformancePeriodOption(BaseModel):
    period: str
    row_count: int


class PerformanceUploadValidation(BaseModel):
    period: str
    row_count: int
    unidentified_count: int = 0
    normalized_penalty_count: int = 0


class PerformanceHistogramBin(BaseModel):
    start: int
    end: int
    label: str
    count: int


class PerformanceCorrectionStats(BaseModel):
    count: int
    positive_count: int
    negative_count: int
    average: float | None
    minimum: float | None
    maximum: float | None


class PerformanceMetricComparison(BaseModel):
    current: float | None
    previous: float | None
    delta: float | None
    percentage_change: float | None


class PerformanceAnalysisGroup(BaseModel):
    label: str
    employee_count: int
    hukdis_count: int
    dampak_pelanggaran_count: int
    dampak_perilaku_count: int
    correction: PerformanceCorrectionStats
    histogram: list[PerformanceHistogramBin]
    status_counts: dict[str, int]


class PerformanceAnalysisResponse(BaseModel):
    dataset: PerformanceDatasetStatus | None
    group_by: str
    total_employees: int
    groups: list[PerformanceAnalysisGroup]


class PerformanceUnitMetrics(BaseModel):
    label: str
    unit_kerja_id: int | None
    nkp_awal_status_counts: dict[str, int]
    nkp_akhir_status_counts: dict[str, int]
    employee_count: int
    average_npk: float | None
    average_nhk: float | None
    average_nkp_awal: float | None
    nkp_awal_sangat_istimewa_count: int
    nkp_awal_sangat_istimewa_percentage: float
    hukdis_count: int
    dampak_pelanggaran_count: int
    dampak_perilaku_count: int
    correction: PerformanceCorrectionStats
    average_nkp_akhir: float | None
    nkp_akhir_sangat_istimewa_count: int
    nkp_akhir_sangat_istimewa_percentage: float
    status_gap_count: int
    comparison: dict[str, PerformanceMetricComparison]


class PerformanceUnitEselonIVSummary(PerformanceUnitMetrics):
    pass


class PerformanceUnitEselonIIISummary(PerformanceUnitMetrics):
    children: list[PerformanceUnitEselonIVSummary]


class PerformanceUnitSummary(PerformanceUnitMetrics):
    children: list[PerformanceUnitEselonIIISummary]


class PerformanceDashboardResponse(BaseModel):
    dataset: PerformanceDatasetStatus | None
    previous_period: str | None
    available_periods: list[PerformancePeriodOption]
    total_employees: int
    unit_eselon_ii_options: list[str]
    unit_eselon_iii_options: list[str]
    unit_eselon_iv_options: list[str]
    eselon_options: list[str]
    overview: PerformanceAnalysisGroup
    overview_previous: PerformanceAnalysisGroup | None
    overview_comparison: dict[str, PerformanceMetricComparison]
    units: list[PerformanceUnitSummary]


class PerformanceInsightRead(BaseModel):
    content: str
    updated_at: datetime | None
    updated_by_name: str | None


class PerformanceInsightUpdate(BaseModel):
    content: str = Field(max_length=10000)


class PerformanceRecordRead(BaseModel):
    nama: str
    nip: str
    unit_eselon_ii: str
    unit_eselon_iii: str
    unit_eselon_iv: str
    eselon: str
    nhk: float | None
    npk: float | None
    nhk_kalibrasi: float | None
    npk_kalibrasi: float | None
    nkp_awal: float | None
    rating_hasil_kerja_awal: str | None
    rating_perilaku_kerja_awal: str | None
    predikat_kinerja_awal: str | None
    nilai_hukuman_disiplin: float | None
    nilai_dampak_pelanggaran_disiplin: float | None
    nilai_dampak_perilaku: float | None
    nilai_koreksi: float | None
    nko: float | None
    nkp_akhir: float | None
    rating_hasil_kerja: str | None
    rating_perilaku_kerja: str | None
    predikat_kinerja: str | None
    status: str


class PerformanceRecordsResponse(BaseModel):
    period: str | None
    page: int
    page_size: int
    total: int
    records: list[PerformanceRecordRead]
    filter_options: dict[str, list[str]] = Field(default_factory=dict)
    numeric_ranges: dict[str, tuple[float | None, float | None]] = Field(default_factory=dict)
