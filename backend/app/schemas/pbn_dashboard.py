from pydantic import BaseModel, Field


class PbnDashboardFilters(BaseModel):
    age_min: int | None = None
    age_max: int | None = None
    tenure_min: int | None = None
    tenure_max: int | None = None
    eselon: list[str] = Field(default_factory=list)
    education: list[str] = Field(default_factory=list)
    region: list[str] = Field(default_factory=list)
    unit: list[str] = Field(default_factory=list)
    rumpun: list[str] = Field(default_factory=list)


class PbnDashboardCount(BaseModel):
    label: str
    count: int
    percentage: float


class PbnDashboardRange(BaseModel):
    min: int
    max: int


class PbnDashboardAvailableFilters(BaseModel):
    age: PbnDashboardRange
    tenure: PbnDashboardRange
    eselon: list[str]
    education: list[str]
    region: list[str]
    unit: list[str]
    rumpun: list[str]


class PbnDashboardResponse(BaseModel):
    dataset_id: str
    sheet_name: str
    total_employees: int
    sex_distribution: list[PbnDashboardCount]
    age_group_distribution: list[PbnDashboardCount]
    region_distribution: list[PbnDashboardCount]
    education_level_distribution: list[PbnDashboardCount]
    education_group_distribution: list[PbnDashboardCount]
    unit_distribution: list[PbnDashboardCount]
    religion_distribution: list[PbnDashboardCount]
    available_filters: PbnDashboardAvailableFilters


class PbnDashboardPeopleResponse(BaseModel):
    dataset_id: str
    sheet_name: str
    people: list[dict[str, str | int | None]]
