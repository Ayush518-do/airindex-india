"""
Response models for the API.

Two reasons these exist beyond documentation: they pin the contract that the
frontend and any NSO/RBI consumer codes against, and they make the
`available: false` envelope a declared part of every endpoint that can be empty
rather than an undocumented surprise.

Models that can be unavailable inherit from `Availability`, so a client can
branch on one field everywhere instead of guessing per endpoint.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

Reason = Literal[
    "no_index_data", "insufficient_history", "no_official_data", "pending_overlap", "model_untrained"
]


class Availability(BaseModel):
    available: bool = True
    reason: Reason | None = None
    message: str | None = None


# --------------------------------------------------------------------------- #
# Meta / health
# --------------------------------------------------------------------------- #
class SourceProvenance(BaseModel):
    source: str
    last_scraped_at: str | None = None
    snapshots: int | None = None
    records: int | None = None
    synthetic: bool = False


class City(BaseModel):
    code: str = Field(..., description="IATA airport code, e.g. DEL")
    city: str = Field(..., description="City name, e.g. Delhi")
    state: str | None = None
    airport: str | None = None
    label: str = Field(..., description="Display form, e.g. 'Delhi (DEL)'")


class RouteInfo(BaseModel):
    route: str = Field(..., description="e.g. DEL-BOM")
    origin: str
    destination: str
    label: str = Field(..., description="e.g. 'Delhi (DEL) → Mumbai (BOM)'")
    weight: float


class Meta(BaseModel):
    data_mode: Literal["live", "demo"]
    demo_mode: bool
    has_data: bool
    routes: list[str]
    route_details: list[RouteInfo] = []
    weights: dict[str, float]
    windows: list[str]
    window_labels: dict[str, str] = Field(
        default_factory=dict, description="Plain-English gloss, e.g. '0-3' -> 'Booked 0-3 days before travel'"
    )
    window_short: dict[str, str] = Field(
        default_factory=dict, description="Compact form for tables and chart ticks, e.g. '0-3' -> '0–3 days ahead'"
    )
    carriers: list[str]
    n_real_days: int
    n_synthetic_days: int
    snapshot_at: str | None = None
    sources: list[SourceProvenance] = []
    db_path: str | None = None


class SourceHealth(BaseModel):
    source: str
    status: str | None = None
    last_run_at: str | None = None
    last_ok_at: str | None = None
    n_ok: int = 0
    n_failed: int = 0
    n_records: int = 0
    last_error: str | None = None
    stale: bool = Field(False, description="No successful run within the freshness window")


class Health(BaseModel):
    status: Literal["ok", "degraded", "error"]
    time: str
    data_mode: Literal["live", "demo"]
    database: dict
    latest_scrape_date: str | None = None
    scrape_age_hours: float | None = None
    index_days: int = 0
    official_cpi_months: int = 0
    sources: list[SourceHealth] = []
    warnings: list[str] = []


# --------------------------------------------------------------------------- #
# Index
# --------------------------------------------------------------------------- #
class IndexPoint(BaseModel):
    date: str
    value: float
    change_pct: float | None = None
    n_records: int
    coverage: float | None = None
    is_synthetic: bool = False


class IndexLatest(BaseModel):
    date: str
    value: float
    change_pct: float | None = None
    change_abs: float | None = None


class IndexDaily(Availability):
    index_name: str = "APIx"
    base_date: str | None = None
    base_value: float = 100.0
    weights: dict[str, float] = {}
    points: list[IndexPoint] = []
    latest: IndexLatest | None = None
    n_real_days: int = 0
    n_synthetic_days: int = 0


class ForecastPoint(BaseModel):
    date: str
    value: float
    lower: float
    upper: float


class IndexForecast(Availability):
    method: str | None = None
    history_days: int | None = None
    horizon_days: int | None = None
    slope_per_day: float | None = None
    r2: float | None = None
    residual_se: float | None = None
    anchor: dict | None = None
    points: list[ForecastPoint] = []
    have: int | None = None
    need: int | None = None


class HeatmapCell(BaseModel):
    route: str
    window: str
    avg_fare: int
    n: int


class Heatmap(Availability):
    date: str | None = None
    routes: list[str] = []
    windows: list[str] = []
    cells: list[HeatmapCell] = []


# --------------------------------------------------------------------------- #
# Routes / fares
# --------------------------------------------------------------------------- #
class RouteWindow(BaseModel):
    window: str
    label: str | None = None
    actual_avg: float | None = None
    median: float | None = None
    predicted_avg: float | None = None
    min_fare: float | None = None
    max_fare: float | None = None
    n: int = 0


class CarrierAvg(BaseModel):
    carrier: str
    carrier_name: str | None = None
    avg_fare: float
    n: int


class RouteTrend(Availability):
    route: str
    label: str | None = None
    date: str | None = None
    windows: list[RouteWindow] = []
    carriers: list[CarrierAvg] = []
    model: dict | None = None
    best_window: dict | None = Field(
        None, description="Cheapest advance-purchase window: {'window','label','avg_fare','saving_pct'}"
    )


class FareRecord(BaseModel):
    origin: str
    destination: str
    route: str
    carrier: str
    carrier_name: str | None = None
    flight_number: str | None = None
    travel_date: str
    departure_time: str | None = None
    duration_min: int | None = None
    stops: int | None = None
    advance_purchase_days: int
    advance_purchase_window: str
    fare_class: str
    base_fare: float | None = None
    taxes: float | None = None
    total_fare: float
    currency: str = "INR"
    source: str
    scraped_at: str
    scrape_date: str | None = None
    is_outlier: bool = False
    is_synthetic: bool = False


class FaresRaw(Availability):
    count: int = 0
    total: int = 0
    records: list[FareRecord] = []
    offset: int = 0
    limit: int = 0
    has_more: bool = False
    next_offset: int | None = None


class BookingWindow(BaseModel):
    window: str
    label: str
    typical_days: int | None = None
    avg_fare: int
    n: int
    days: int


class BestTime(Availability):
    route: str
    label: str
    best: BookingWindow | None = None
    worst: BookingWindow | None = None
    saving_pct: float | None = None
    windows: list[BookingWindow] = []
    n_days: int = 0
    summary: str | None = Field(None, description="Plain-English, e.g. 'Cheapest to book about 21 days before travel (avg ₹5,420)'")


class Prediction(BaseModel):
    route: str
    carrier: str
    travel_date: str
    as_of: str
    predicted_fare: int
    features: dict
    model: dict


# --------------------------------------------------------------------------- #
# Festivals / official
# --------------------------------------------------------------------------- #
class SurgeRow(BaseModel):
    festival: str
    route: str
    label: str | None = None
    festival_avg: int
    normal_avg: int
    surge_pct: float
    n_festival: int
    n_normal: int
    windows: list[str] = []
    basis: str | None = None


class FestivalSurge(Availability):
    festivals: list[dict] = []
    surge: list[SurgeRow] = []
    n_records: int = 0


class OfficialPoint(BaseModel):
    period: str
    index: float
    inflation_pct: float | None = None
    status: str | None = None


class OfficialCpi(Availability):
    source: str | None = None
    level: str | None = None
    sector: str | None = None
    item_name: str | None = None
    item_code: str | None = None
    n_months: int = 0
    points: list[OfficialPoint] = []


# --------------------------------------------------------------------------- #
# Saved routes / alerts
# --------------------------------------------------------------------------- #
class SaveRouteRequest(BaseModel):
    browser_id: str = Field(..., min_length=6, max_length=64)
    origin: str = Field(..., min_length=3, max_length=3, examples=["DEL"])
    destination: str = Field(..., min_length=3, max_length=3, examples=["BOM"])
    preferred_days: list[str] = Field(default_factory=list, examples=[["Fri", "Sat"]])
    email: EmailStr


class SavedRoute(BaseModel):
    id: int
    browser_id: str
    origin: str
    destination: str
    route: str | None = None
    label: str | None = None
    preferred_days: list[str] = []
    email: str
    created_at: str
    last_notified_at: str | None = None


class SavedRoutes(BaseModel):
    browser_id: str
    routes: list[SavedRoute] = []


class AlertRow(BaseModel):
    route: str
    label: str | None = None
    today_fare: float | None = None
    baseline_fare: float | None = None
    pct_below_baseline: float | None = None
    is_cheap: bool = False
    last_notified_at: str | None = None


class RouteAlerts(BaseModel):
    browser_id: str
    checked_at: str
    any_cheap: bool = False
    threshold_pct: float
    baseline_days: int
    alerts: list[AlertRow] = []


class ErrorResponse(BaseModel):
    error: str
    detail: str
    path: str | None = None
