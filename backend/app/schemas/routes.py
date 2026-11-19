from typing import List, Optional
from pydantic import BaseModel
from app.schemas.charging import ChargingStationOut


class RouteOptimizeRequest(BaseModel):
    vehicle_id: int
    origin: str
    destination: str
    current_battery_pct: Optional[float] = None # Uses vehicle current if None
    desired_arrival_pct: Optional[float] = 15.0


class RouteChargingStopDetail(BaseModel):
    stop_order: int
    station: ChargingStationOut
    estimated_arrival_soc: float
    estimated_charging_duration_min: int
    target_soc: float
    added_range_km: float


class RouteOption(BaseModel):
    route_id: str
    title: str # "Fastest Route", "Lowest Energy Route", "Recommended Balanced Route"
    badge: str
    distance_km: float
    driving_time_minutes: int
    charging_time_minutes: int
    total_time_minutes: int
    estimated_energy_kwh: float
    arrival_battery_pct: float
    charging_stops_count: int
    charging_stops: List[RouteChargingStopDetail]
    co2_saved_kg: float
    summary: str
    waypoints: List[List[float]] # [lat, lng] pairs for map polyline rendering


class RouteOptimizeResponse(BaseModel):
    vehicle_id: int
    origin: str
    destination: str
    current_battery_pct: float
    estimated_available_energy_kwh: float
    routes: List[RouteOption]
    recommended_route_id: str


class GeocodeResultOut(BaseModel):
    display_name: str
    lat: float
    lon: float
    type: str
    importance: Optional[float] = 0.0


class RouteCalculateRequest(BaseModel):
    origin_lat: float
    origin_lng: float
    destination_lat: float
    destination_lng: float
    origin_name: Optional[str] = "Current Location"
    destination_name: Optional[str] = "Destination"
    waypoints: Optional[List[List[float]]] = None # [[lat, lon], ...]
    vehicle_id: Optional[int] = None
    current_battery_pct: Optional[float] = None
    desired_arrival_pct: Optional[float] = 15.0


class RouteCalculateResponse(BaseModel):
    origin_lat: float
    origin_lng: float
    destination_lat: float
    destination_lng: float
    origin_name: str
    destination_name: str
    distance_km: float
    duration_minutes: int
    duration_formatted: str
    geometry: List[List[float]] # [[lat, lng], ...] for Leaflet
    estimated_energy_kwh: float
    estimated_battery_pct_used: float
    estimated_arrival_soc: float
    battery_sufficient: bool
    charging_needed: bool
    reserve_status: str
    assumptions_disclaimer: str
    recommended_charging_stops: List[ChargingStationOut]
    charging_stop_included: Optional[ChargingStationOut] = None
