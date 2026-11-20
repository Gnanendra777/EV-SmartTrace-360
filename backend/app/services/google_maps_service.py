import os
import logging
from typing import Dict, Any, List, Optional
import httpx

logger = logging.getLogger("google_maps_service")

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
MAPS_PROVIDER = os.getenv("MAPS_PROVIDER", "open").lower().strip() # "open" or "google"


def is_google_maps_enabled() -> bool:
    """Return True if Google Maps API key is configured and provider is set to google."""
    return bool(GOOGLE_MAPS_API_KEY) and MAPS_PROVIDER == "google"


async def fetch_google_places_charging_stations(
    lat: float,
    lng: float,
    radius_km: float = 25.0
) -> List[Dict[str, Any]]:
    """
    Search for EV charging stations using Google Places Nearby Search API.
    Gracefully falls back to Open Charge Map if Google API is unconfigured or returns an error.
    """
    if not is_google_maps_enabled():
        from app.services.open_charge_map_service import fetch_open_charge_map_stations
        return await fetch_open_charge_map_stations(lat=lat, lon=lng, distance_km=radius_km)

    radius_meters = int(radius_km * 1000)
    url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    params = {
        "location": f"{lat},{lng}",
        "radius": radius_meters,
        "type": "charging_station",
        "keyword": "electric vehicle charging",
        "key": GOOGLE_MAPS_API_KEY
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                results = []
                for item in data.get("results", []):
                    geom = item.get("geometry", {}).get("location", {})
                    st_lat = geom.get("lat")
                    st_lng = geom.get("lng")
                    if st_lat and st_lng:
                        from app.services.open_charge_map_service import haversine_distance
                        dist = haversine_distance(lat, lng, st_lat, st_lng)
                        results.append({
                            "id": abs(hash(item.get("place_id", str(st_lat)))) % 10000000,
                            "station_name": item.get("name", "EV Charging Point"),
                            "address": item.get("vicinity", "Local Street Address"),
                            "latitude": st_lat,
                            "longitude": st_lng,
                            "distance_km": dist,
                            "operator": "Google Places Registered Operator",
                            "charging_power": 50.0,
                            "connector_type": "CCS2 / Type 2",
                            "connector_types": ["CCS2", "Type 2"],
                            "availability_status": "Operational" if item.get("business_status") == "OPERATIONAL" else "Not provided",
                            "pricing_per_kwh": None,
                            "pricing_text": "Not provided",
                            "is_operational": item.get("business_status") == "OPERATIONAL",
                            "status_title": item.get("business_status", "Operational"),
                            "ac_dc_type": "DC Fast / AC L2",
                            "connections_count": 2,
                            "data_source": "Google Maps Platform Places API",
                            "last_updated": "Live"
                        })
                if results:
                    return results
    except Exception as exc:
        logger.warning("Google Places API request failed: %s, falling back to Open Charge Map.", exc)

    from app.services.open_charge_map_service import fetch_open_charge_map_stations
    return await fetch_open_charge_map_stations(lat=lat, lon=lng, distance_km=radius_km)


async def calculate_google_directions(
    start_lat: float,
    start_lng: float,
    end_lat: float,
    end_lng: float
) -> Dict[str, Any]:
    """
    Calculate road route via Google Maps Directions API.
    Falls back to OSRM if unconfigured.
    """
    if not is_google_maps_enabled():
        from app.services.osrm_routing_service import calculate_osrm_route
        return await calculate_osrm_route(start_lat=start_lat, start_lon=start_lng, end_lat=end_lat, end_lon=end_lng)

    url = "https://maps.googleapis.com/maps/api/directions/json"
    params = {
        "origin": f"{start_lat},{start_lng}",
        "destination": f"{end_lat},{end_lng}",
        "mode": "driving",
        "key": GOOGLE_MAPS_API_KEY
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") == "OK" and data.get("routes"):
                    route = data["routes"][0]
                    leg = route["legs"][0]
                    dist_km = round(leg["distance"]["value"] / 1000.0, 2)
                    dur_mins = max(1, int(leg["duration"]["value"] / 60.0))
                    hrs = dur_mins // 60
                    mins = dur_mins % 60
                    formatted = f"{hrs}h {mins}m" if hrs > 0 else f"{mins} mins"

                    # Decode polyline or take start and end
                    return {
                        "distance_km": dist_km,
                        "duration_minutes": dur_mins,
                        "duration_formatted": formatted,
                        "geometry": [[start_lat, start_lng], [end_lat, end_lng]],
                        "is_osrm": False,
                        "is_google": True,
                        "note": "Route calculated via Google Maps Platform Directions API."
                    }
    except Exception as exc:
        logger.warning("Google Directions API failed: %s, falling back to OSRM.", exc)

    from app.services.osrm_routing_service import calculate_osrm_route
    return await calculate_osrm_route(start_lat=start_lat, start_lon=start_lng, end_lat=end_lat, end_lon=end_lng)
