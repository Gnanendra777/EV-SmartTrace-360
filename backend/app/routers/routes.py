from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.charging import ChargingStation
from app.models.routes import RouteHistory, RouteChargingStop
from app.schemas.routes import (
    RouteOptimizeRequest, 
    RouteOptimizeResponse,
    RouteCalculateRequest,
    RouteCalculateResponse,
    GeocodeResultOut,
    GeocodeSearchRequest
)
from app.schemas.charging import ChargingStationOut
from app.security.auth import get_current_user
from app.services.route_service import optimize_ev_routes
from app.services.osrm_routing_service import calculate_osrm_route
from app.services.nominatim_geocoding_service import search_destination_nominatim
from app.services.open_charge_map_service import fetch_open_charge_map_stations, haversine_distance

router = APIRouter(prefix="/routes", tags=["AI Smart Route & Navigation Engine"])


@router.get("/geocode", response_model=List[GeocodeResultOut])
async def geocode_destination(
    query: str = Query(..., min_length=2, description="Place or destination to search"),
    limit: int = Query(5, ge=1, le=10)
):
    """
    Search destination places or addresses using OpenStreetMap Nominatim service.
    Follows Nominatim rate limits and caching policies.
    """
    results = await search_destination_nominatim(query=query, limit=limit)
    return [GeocodeResultOut(**item) for item in results]


@router.post("/geocode", response_model=List[GeocodeResultOut])
async def geocode_destination_post(req: GeocodeSearchRequest):
    """
    POST variant for geocoding search query.
    """
    results = await search_destination_nominatim(query=req.query, limit=req.limit or 5)
    return [GeocodeResultOut(**item) for item in results]


@router.post("/calculate", response_model=RouteCalculateResponse)
async def calculate_smart_ev_route(
    req: RouteCalculateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Calculate real-world road route via OSRM, estimate vehicle battery consumption,
    and find verified Open Charge Map stations along the travel corridor.
    """
    # 1. Fetch vehicle specifications
    battery_cap = 60.0
    eff_kwh_km = 0.150
    current_soc = req.current_battery_pct if req.current_battery_pct is not None else 70.0
    soh = 96.0

    if req.vehicle_id:
        vehicle = db.query(Vehicle).filter(
            Vehicle.id == req.vehicle_id,
            Vehicle.user_id == current_user.id
        ).first()
        if vehicle:
            battery_cap = float(vehicle.battery_capacity or 60.0)
            eff_kwh_km = float(vehicle.efficiency_kwh_km or 0.150)
            if req.current_battery_pct is None and vehicle.current_battery_pct is not None:
                current_soc = float(vehicle.current_battery_pct)

    # 2. Calculate Road Route with OSRM
    osrm_data = await calculate_osrm_route(
        start_lat=req.origin_lat,
        start_lon=req.origin_lng,
        end_lat=req.destination_lat,
        end_lon=req.destination_lng,
        waypoints=req.waypoints
    )

    distance_km = osrm_data["distance_km"]
    duration_mins = osrm_data["duration_minutes"]
    duration_formatted = osrm_data["duration_formatted"]
    geometry = osrm_data["geometry"]

    # 3. EV Battery-Aware Computations
    usable_kwh = battery_cap * (soh / 100.0)
    # Include 5% HVAC and dynamic road thermal buffer
    energy_needed_kwh = round(distance_km * eff_kwh_km * 1.05, 2)
    pct_used = round((energy_needed_kwh / usable_kwh) * 100.0, 1)
    arrival_soc = round(current_soc - pct_used, 1)

    target_arrival = req.desired_arrival_pct or 15.0
    battery_sufficient = arrival_soc >= target_arrival
    charging_needed = arrival_soc < target_arrival

    if arrival_soc >= target_arrival:
        reserve_status = f"Sufficient Range: Estimated arrival with {arrival_soc:.1f}% reserve (> {target_arrival:.0f}% target)."
    elif arrival_soc >= 5.0:
        reserve_status = f"Low Reserve Warning: Estimated arrival with {arrival_soc:.1f}% reserve. Intermediate charging top-up recommended."
    else:
        deficit_pct = abs(arrival_soc)
        reserve_status = f"Charging Required: Destination unreachable on current battery ({deficit_pct:.1f}% deficit). Please add a charging stop."

    disclaimer = (
        f"Energy estimate calculated using vehicle nominal consumption of {eff_kwh_km:.3f} kWh/km "
        f"and {battery_cap:.0f} kWh capacity with a 5% HVAC/ambient buffer. "
        "Actual range varies with speed, driving style, terrain elevation, weather, and traffic. "
        "Road route provided by OpenStreetMap OSRM routing service."
    )

    # 4. Find Charging Stations along the Route Corridor
    mid_lat = (req.origin_lat + req.destination_lat) / 2.0
    mid_lon = (req.origin_lng + req.destination_lng) / 2.0
    corridor_radius = max(15.0, min(distance_km * 0.5, 45.0))

    candidate_stations = await fetch_open_charge_map_stations(
        lat=mid_lat,
        lon=mid_lon,
        distance_km=corridor_radius,
        max_results=25
    )

    # Format recommended stations
    rec_stops = []
    for s in candidate_stations[:6]:
        rec_stops.append(ChargingStationOut(**s))

    # Identify if a waypoint was already included as a charging stop
    included_stop = None
    if req.waypoints and len(req.waypoints) > 0 and len(rec_stops) > 0:
        included_stop = rec_stops[0]

    # Save to history for user analytics
    try:
        hist = RouteHistory(
            vehicle_id=req.vehicle_id or 1,
            origin=req.origin_name or f"{req.origin_lat:.4f}, {req.origin_lng:.4f}",
            destination=req.destination_name or f"{req.destination_lat:.4f}, {req.destination_lng:.4f}",
            total_distance=distance_km,
            estimated_energy=energy_needed_kwh,
            estimated_duration=duration_mins,
            selected_route="Smart EV OSRM Route"
        )
        db.add(hist)
        db.commit()
    except Exception:
        db.rollback()

    return RouteCalculateResponse(
        origin_lat=req.origin_lat,
        origin_lng=req.origin_lng,
        destination_lat=req.destination_lat,
        destination_lng=req.destination_lng,
        origin_name=req.origin_name or f"Lat: {req.origin_lat:.4f}, Lon: {req.origin_lng:.4f}",
        destination_name=req.destination_name or f"Lat: {req.destination_lat:.4f}, Lon: {req.destination_lng:.4f}",
        distance_km=distance_km,
        duration_minutes=duration_mins,
        duration_formatted=duration_formatted,
        geometry=geometry,
        estimated_energy_kwh=energy_needed_kwh,
        estimated_battery_pct_used=pct_used,
        estimated_arrival_soc=arrival_soc,
        battery_sufficient=battery_sufficient,
        charging_needed=charging_needed,
        reserve_status=reserve_status,
        assumptions_disclaimer=disclaimer,
        recommended_charging_stops=rec_stops,
        charging_stop_included=included_stop
    )


# --- Legacy Backwards Compatibility Endpoints ---

@router.post("/optimize", response_model=RouteOptimizeResponse)
def optimize_routes(
    req: RouteOptimizeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == req.vehicle_id, 
        Vehicle.user_id == current_user.id
    ).first()
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")

    current_soc = req.current_battery_pct if req.current_battery_pct is not None else float(vehicle.current_battery_pct)
    desired_arrival = req.desired_arrival_pct if req.desired_arrival_pct is not None else 15.0

    stations = db.query(ChargingStation).all()
    result = optimize_ev_routes(
        vehicle=vehicle,
        origin=req.origin,
        destination=req.destination,
        current_battery_pct=current_soc,
        desired_arrival_pct=desired_arrival,
        available_stations=stations
    )
    return result


@router.get("/history")
def get_routes_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    routes = (
        db.query(RouteHistory)
        .join(Vehicle, RouteHistory.vehicle_id == Vehicle.id)
        .filter(Vehicle.user_id == current_user.id)
        .order_by(RouteHistory.created_at.desc())
        .limit(20)
        .all()
    )
    return routes
