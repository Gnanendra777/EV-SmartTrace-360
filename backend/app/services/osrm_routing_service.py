import os
import time
import math
import logging
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger("osrm_routing_service")

# In-memory TTL cache for calculated routes
_ROUTE_CACHE: Dict[str, tuple[float, Dict[str, Any]]] = {}
ROUTE_CACHE_TTL = 3600 # 1 hour


def format_duration(minutes: int) -> str:
    """Format total minutes into human-readable hours and minutes."""
    hrs = minutes // 60
    mins = minutes % 60
    if hrs > 0 and mins > 0:
        return f"{hrs}h {mins}m"
    elif hrs > 0:
        return f"{hrs}h"
    else:
        return f"{mins} mins"


def interpolate_fallback_geometry(start_lat: float, start_lon: float, end_lat: float, end_lon: float, steps: int = 12) -> List[List[float]]:
    """Generate intermediate road-like coordinates if OSRM is momentarily unreachable."""
    coords = []
    for i in range(steps + 1):
        ratio = i / steps
        lat = start_lat + (end_lat - start_lat) * ratio
        lon = start_lon + (end_lon - start_lon) * ratio
        # Add slight natural curvature
        curvature = math.sin(ratio * math.pi) * 0.015
        coords.append([round(lat + curvature, 6), round(lon, 6)])
    return coords


async def calculate_osrm_route(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    waypoints: Optional[List[List[float]]] = None,
    osrm_base_url: Optional[str] = None
) -> Dict[str, Any]:
    """
    Calculate driving road route using OSRM service.
    NOTE: OSRM expects coordinates in {longitude},{latitude} order!
    Returns distance in km, duration in minutes, and geometry as list of [lat, lon] for Leaflet.
    """
    # 1. Validate coordinate boundaries
    if not (-90.0 <= start_lat <= 90.0 and -90.0 <= end_lat <= 90.0):
        raise ValueError("Latitude must be between -90 and 90 degrees.")
    if not (-180.0 <= start_lon <= 180.0 and -180.0 <= end_lon <= 180.0):
        raise ValueError("Longitude must be between -180 and 180 degrees.")

    from app.services.open_charge_map_service import haversine_distance
    direct_km = haversine_distance(start_lat, start_lon, end_lat, end_lon)

    # 2. Check for identical or sub-20m locations
    if direct_km < 0.02:
        return {
            "distance_km": 0.0,
            "duration_minutes": 0,
            "duration_formatted": "0 mins (At destination)",
            "geometry": [[start_lat, start_lon], [end_lat, end_lon]],
            "is_osrm": True,
            "note": "Starting location and destination are at the same point."
        }

    base_url = osrm_base_url or os.getenv("OSRM_ROUTING_SERVICE_URL", "https://router.project-osrm.org").rstrip("/")
    
    # Build coordinate string: lon1,lat1;lon_via,lat_via;...;lon2,lat2
    coord_parts = [f"{start_lon:.6f},{start_lat:.6f}"]
    
    if waypoints:
        for wp in waypoints:
            # wp is [lat, lon]
            if len(wp) >= 2 and -90.0 <= wp[0] <= 90.0 and -180.0 <= wp[1] <= 180.0:
                coord_parts.append(f"{wp[1]:.6f},{wp[0]:.6f}")

    coord_parts.append(f"{end_lon:.6f},{end_lat:.6f}")
    coords_param = ";".join(coord_parts)

    cache_key = f"osrm_{coords_param}"
    now = time.time()

    if cache_key in _ROUTE_CACHE:
        cached_time, cached_res = _ROUTE_CACHE[cache_key]
        if now - cached_time < ROUTE_CACHE_TTL:
            return cached_res

    url = f"{base_url}/route/v1/driving/{coords_param}?overview=full&geometries=geojson"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {"User-Agent": "EV-SmartTrace-360-Navigator/1.0"}
            response = await client.get(url, headers=headers)

            if response.status_code == 200:
                data = response.json()
                code = data.get("code")
                if code == "Ok" and data.get("routes"):
                    route_obj = data["routes"][0]
                    distance_km = round(route_obj["distance"] / 1000.0, 2)
                    duration_mins = max(1, int(math.ceil(route_obj["duration"] / 60.0)))
                    
                    # Convert OSRM GeoJSON geometry [lon, lat] into Leaflet [lat, lon]
                    raw_coords = route_obj.get("geometry", {}).get("coordinates", [])
                    leaflet_coords = [[round(pt[1], 6), round(pt[0], 6)] for pt in raw_coords]

                    result = {
                        "distance_km": distance_km,
                        "duration_minutes": duration_mins,
                        "duration_formatted": format_duration(duration_mins),
                        "geometry": leaflet_coords if leaflet_coords else [[start_lat, start_lon], [end_lat, end_lon]],
                        "is_osrm": True,
                        "note": "Route calculated via OpenStreetMap OSRM routing service."
                    }
                    _ROUTE_CACHE[cache_key] = (now, result)
                    return result
                elif code == "NoRoute":
                    raise ValueError("No drivable road route connects these two locations (e.g. crossing oceans or isolated regions). Please choose a reachable road destination.")
                elif code == "NoSegment":
                    raise ValueError("One or both coordinates cannot be matched to a navigable road network. Please select coordinates near a public road.")
                elif code == "InvalidQuery":
                    raise ValueError("Invalid coordinate query format provided to routing engine.")

    except ValueError:
        raise
    except Exception as exc:
        logger.warning("OSRM routing service request exception: %s", type(exc).__name__)

    # Fallback to Haversine computation if external service is momentarily unreachable and distance is reasonable (< 1500 km)
    if direct_km > 2000.0:
        raise ValueError("Could not compute driving route. Locations appear to be on different continents or separated by unbridgeable water.")

    road_km = round(direct_km * 1.25, 2)
    est_mins = max(2, int(road_km / 65.0 * 60))

    fallback_result = {
        "distance_km": road_km,
        "duration_minutes": est_mins,
        "duration_formatted": format_duration(est_mins),
        "geometry": interpolate_fallback_geometry(start_lat, start_lon, end_lat, end_lon),
        "is_osrm": False,
        "note": "Estimated corridor distance (OSRM public service unreachable)."
    }
    return fallback_result
