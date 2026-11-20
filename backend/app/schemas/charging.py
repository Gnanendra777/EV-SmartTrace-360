from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class ChargingStationOut(BaseModel):
    id: int
    station_name: str
    address: str
    latitude: float
    longitude: float
    operator: str
    charging_power: float
    connector_type: str
    connector_types: Optional[List[str]] = []
    availability_status: Optional[str] = "Live availability not provided by the data source."
    pricing_per_kwh: Optional[float] = None
    pricing_text: Optional[str] = "Pricing information unavailable."
    distance_km: Optional[float] = None
    is_operational: Optional[bool] = True
    status_title: Optional[str] = "Operational"
    ac_dc_type: Optional[str] = "AC/DC"
    connections_count: Optional[int] = 1
    data_source: Optional[str] = "Open Charge Map"
    last_updated: Optional[str] = None
    rating: Optional[float] = None
    reviews_count: Optional[int] = None
    review_snippet: Optional[str] = None
    phone_number: Optional[str] = None
    website_url: Optional[str] = None
    opening_hours: Optional[str] = None
    ports_detail: Optional[List[dict]] = None
    is_offline_sample: Optional[bool] = False

    class Config:
        from_attributes = True
        extra = "ignore"


class ChargingSessionCreate(BaseModel):
    vehicle_id: int
    station_id: Optional[int] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    start_soc: float
    end_soc: float
    energy_kwh: float
    charging_power: float
    electricity_tariff: Optional[float] = 0.25
    session_status: Optional[str] = "completed"


class ChargingSessionOut(BaseModel):
    id: int
    vehicle_id: int
    station_id: Optional[int] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    start_soc: float
    end_soc: float
    energy_kwh: float
    charging_power: float
    electricity_tariff: float
    total_cost: float
    session_status: str
    efficiency_estimate: float

    class Config:
        from_attributes = True


class ChargingEstimateRequest(BaseModel):
    target_soc: float = 80.0
    charging_power_kw: Optional[float] = None # Uses vehicle max if None


class ChargingEstimateResponse(BaseModel):
    current_soc: float
    target_soc: float
    battery_capacity_kwh: float
    required_energy_kwh: float
    charging_power_kw: float
    estimated_duration_minutes: int
    estimated_duration_formatted: str
    estimated_cost_usd: float
    electricity_tariff: float
    charging_losses_kwh: float
    effective_power_kw: float
