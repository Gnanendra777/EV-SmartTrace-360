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

    primary_osrm = (osrm_base_url or os.getenv("OSRM_ROUTING_SERVICE_URL") or "https://router.project-osrm.org").rstrip("/")
    fallback_osrm = "https://routing.openstreetmap.de/routed-car"
    ors_api_key = os.getenv("ORS_API_KEY")

    # Format coordinate string for OSRM: {start_lon},{start_lat};[{wp_lon},{wp_lat};...]{end_lon},{end_lat}
    coord_parts = [f"{start_lon},{start_lat}"]
    if waypoints:
        for wp in waypoints:
            if len(wp) >= 2:
                # wp is [lat, lon]
                coord_parts.append(f"{wp[1]},{wp[0]}")
    coord_parts.append(f"{end_lon},{end_lat}")
    coords_param = ";".join(coord_parts)

    cache_key = coords_param
    now = time.time()
    if cache_key in _ROUTE_CACHE:
        cached_time, cached_res = _ROUTE_CACHE[cache_key]
        if now - cached_time < ROUTE_CACHE_TTL:
            return cached_res

    provider_urls = [primary_osrm]
    if fallback_osrm != primary_osrm:
        provider_urls.append(fallback_osrm)

    headers = {"User-Agent": "EV-SmartTrace-360-Navigator/1.0"}

    # Attempt primary and secondary OSRM providers
    last_error = None
    no_route_detected = False

    for base in provider_urls:
        url = f"{base}/route/v1/driving/{coords_param}?overview=full&geometries=geojson"
        try:
            client_timeout = httpx.Timeout(5.0, connect=2.0)
            async with httpx.AsyncClient(timeout=client_timeout) as client:
                response = await client.get(url, headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    code = data.get("code")
                    if code == "Ok" and data.get("routes"):
                        route_obj = data["routes"][0]
                        distance_km = round(route_obj["distance"] / 1000.0, 2)
                        duration_mins = max(1, int(math.ceil(route_obj["duration"] / 60.0)))
                        raw_coords = route_obj.get("geometry", {}).get("coordinates", [])
                        leaflet_coords = [[round(pt[1], 6), round(pt[0], 6)] for pt in raw_coords]

                        result = {
                            "distance_km": distance_km,
                            "duration_minutes": duration_mins,
                            "duration_formatted": format_duration(duration_mins),
                            "geometry": leaflet_coords if leaflet_coords else [[start_lat, start_lon], [end_lat, end_lon]],
                            "is_osrm": True,
                            "note": f"Route calculated via OSRM service ({base})."
                        }
                        _ROUTE_CACHE[cache_key] = (now, result)
                        return result
                    elif code == "NoRoute":
                        no_route_detected = True
                        break
                    elif code in ("NoSegment", "InvalidQuery"):
                        raise ValueError("One or both coordinates cannot be matched to a navigable road network. Please select coordinates near a public road.")
        except ValueError:
            raise
        except Exception as exc:
            logger.warning("OSRM provider %s error: %s", base, type(exc).__name__)
            last_error = exc

    if no_route_detected:
        raise ValueError("No road route found between these points (they may be separated by water or unreachable by road).")

    # If OSRM failed and ORS_API_KEY is configured, try OpenRouteService
    if ors_api_key:
        try:
            ors_url = f"https://api.openrouteservice.org/v2/directions/driving-car?api_key={ors_api_key}&start={start_lon},{start_lat}&end={end_lon},{end_lat}"
            async with httpx.AsyncClient(timeout=10.0) as client:
                ors_resp = await client.get(ors_url, headers=headers)
                if ors_resp.status_code == 200:
                    ors_data = ors_resp.json()
                    features = ors_data.get("features", [])
                    if features:
                        feat = features[0]
                        summary = feat.get("properties", {}).get("summary", {})
                        distance_km = round(summary.get("distance", 0) / 1000.0, 2)
                        duration_mins = max(1, int(math.ceil(summary.get("duration", 0) / 60.0)))
                        raw_coords = feat.get("geometry", {}).get("coordinates", [])
                        leaflet_coords = [[round(pt[1], 6), round(pt[0], 6)] for pt in raw_coords]

                        result = {
                            "distance_km": distance_km,
                            "duration_minutes": duration_mins,
                            "duration_formatted": format_duration(duration_mins),
                            "geometry": leaflet_coords if leaflet_coords else [[start_lat, start_lon], [end_lat, end_lon]],
                            "is_osrm": True,
                            "note": "Route calculated via OpenRouteService."
                        }
                        _ROUTE_CACHE[cache_key] = (now, result)
                        return result
        except Exception as ors_err:
            logger.warning("OpenRouteService fallback error: %s", ors_err)

    if direct_km > 2000.0:
        raise ValueError("No road route found between these points (locations are too distant or separated by water).")

    # Resilient fallback geometry when free public routing servers are busy/rate-limited
    fallback_distance = round(direct_km * 1.25, 2)
    fallback_duration = max(2, int(round((fallback_distance / 50.0) * 60.0)))
    fallback_geom = interpolate_fallback_geometry(start_lat, start_lon, end_lat, end_lon)
    return {
        "distance_km": fallback_distance,
        "duration_minutes": fallback_duration,
        "duration_formatted": format_duration(fallback_duration),
        "geometry": fallback_geom,
        "is_osrm": False,
        "note": "Estimated route trajectory (live OSRM public servers currently throttled)."
    }
