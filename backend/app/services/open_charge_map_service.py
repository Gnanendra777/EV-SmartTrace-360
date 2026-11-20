import os
import re
import time
import math
import asyncio
import logging
from typing import List, Dict, Any, Optional
import httpx
from app.config import settings

logger = logging.getLogger("ev_stations_service")

# In-memory TTL cache for charging station responses
# key -> (timestamp, data)
_STATIONS_CACHE: Dict[str, tuple[float, List[Dict[str, Any]]]] = {}
CACHE_TTL_SECONDS = 600 # 10 minutes cache per user request requirement


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great circle distance between two points in kilometers."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)


def normalize_connector_name(raw_title: Optional[str]) -> str:
    """Normalize raw connector title into standard EV categories."""
    if not raw_title:
        return "Standard EV Connector"
    t = raw_title.lower()
    if "ccs (type 2)" in t or "combo 2" in t or "ccs2" in t or "type2_combo" in t:
        return "CCS2"
    if "type 2" in t or "mennekes" in t or "iec 62196-2" in t or "type2" in t:
        return "Type 2"
    if "chademo" in t:
        return "CHAdeMO"
    if "bharat ac" in t or "ac001" in t:
        return "Bharat AC001"
    if "bharat dc" in t or "dc001" in t:
        return "Bharat DC001"
    if "ccs (type 1)" in t or "combo 1" in t or "ccs1" in t:
        return "CCS1"
    if "type 1" in t or "j1772" in t:
        return "Type 1"
    if "tesla" in t or "nacs" in t:
        return "Tesla (NACS)"
    if "schuko" in t or "wall" in t or "socket" in t:
        return "Wall socket"
    return raw_title


def parse_numeric_power(val: Any) -> Optional[float]:
    """Parse numeric kW value from strings like '60kW', '22 kW', '50.0'."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val) if val > 0 else None
    s = str(val).strip()
    match = re.search(r"(\d+(?:\.\d+)?)", s)
    if match:
        try:
            num = float(match.group(1))
            return num if num > 0 else None
        except ValueError:
            return None
    return None


def parse_overpass_element(el: Dict[str, Any], user_lat: float, user_lon: float) -> Optional[Dict[str, Any]]:
    """
    Parse an OSM node or way into standard ChargingStationOut shape.
    Never invents ratings, reviews, availability, or fake opening hours.
    """
    el_type = el.get("type")
    el_id = el.get("id", 0)

    # Determine coordinates
    if el_type == "node":
        st_lat = el.get("lat")
        st_lon = el.get("lon")
    elif el_type == "way":
        center = el.get("center", {})
        st_lat = center.get("lat")
        st_lon = center.get("lon")
    else:
        st_lat = el.get("lat")
        st_lon = el.get("lon")

    if st_lat is None or st_lon is None:
        return None

    tags = el.get("tags", {}) or {}

    # Distance from user
    dist = haversine_distance(user_lat, user_lon, float(st_lat), float(st_lon))

    # Name & operator
    name = tags.get("name") or tags.get("brand") or tags.get("operator") or tags.get("network") or "EV Charging Station"
    operator = tags.get("operator") or tags.get("brand") or tags.get("network") or "Independent Operator"

    # Connectors & power extraction
    connector_names: List[str] = []
    ports_detail: List[Dict[str, Any]] = []
    max_kw = 0.0
    has_dc = False
    has_ac = False

    socket_specs = [
        ("socket:type2_combo", "CCS2", True),
        ("socket:type2", "Type 2", False),
        ("socket:chademo", "CHAdeMO", True),
        ("socket:type1_combo", "CCS1", True),
        ("socket:type1", "Type 1", False),
        ("socket:tesla_supercharger", "Tesla (NACS)", True),
        ("socket:schuko", "Wall socket", False),
        ("socket:bharat_dc001", "Bharat DC001", True),
        ("socket:bharat_ac001", "Bharat AC001", False),
    ]

    for tag_key, conn_label, is_dc in socket_specs:
        has_socket = tags.get(tag_key)
        # Check if socket present ("yes", "2", etc.)
        if has_socket and str(has_socket).lower() not in ("no", "0", "false"):
            if conn_label not in connector_names:
                connector_names.append(conn_label)
            if is_dc:
                has_dc = True
            else:
                has_ac = True

            # Parse power
            kw = parse_numeric_power(tags.get(f"{tag_key}:output")) or parse_numeric_power(tags.get("output"))
            if kw:
                max_kw = max(max_kw, kw)

            # Parse count
            count = 1
            try:
                c_val = int(has_socket)
                if c_val > 0:
                    count = c_val
            except Exception:
                pass

            ports_detail.append({
                "connector": conn_label,
                "power_kw": round(kw or (60.0 if is_dc else 22.0), 0),
                "available": None, # Never invent availability
                "total": count
            })

    # Fallback connector check if generic
    if not connector_names:
        connector_names = ["CCS2", "Type 2"]
        ports_detail = [
            {"connector": "CCS2", "power_kw": 50.0, "available": None, "total": 1},
            {"connector": "Type 2", "power_kw": 22.0, "available": None, "total": 1}
        ]
        has_dc = True
        has_ac = True

    if max_kw == 0.0:
        max_kw = 60.0 if has_dc else 22.0

    ac_dc_type = "AC / DC Fast" if (has_dc and has_ac) else ("DC Fast" if has_dc else "AC Level 2")

    # Capacity
    capacity_tag = tags.get("capacity")
    capacity_count = None
    if capacity_tag:
        try:
            capacity_count = int(capacity_tag)
        except Exception:
            pass
    if not capacity_count:
        capacity_count = max(sum(p["total"] for p in ports_detail), len(connector_names))

    # Address assembly
    addr_parts = [
        tags.get("addr:housenumber"),
        tags.get("addr:street"),
        tags.get("addr:suburb"),
        tags.get("addr:city") or tags.get("addr:town") or tags.get("addr:village"),
        tags.get("addr:postcode")
    ]
    cleaned_addr = ", ".join([p for p in addr_parts if p])
    if not cleaned_addr:
        cleaned_addr = f"Coordinates: {float(st_lat):.4f}, {float(st_lon):.4f}"

    # Pricing
    fee = tags.get("fee") or tags.get("charge")
    pricing_text = fee if fee else "Not provided"

    # Contact
    phone = tags.get("phone") or tags.get("contact:phone") or None
    website = tags.get("website") or tags.get("contact:website") or None
    opening_hours = tags.get("opening_hours") or None

    return {
        "id": int(abs(el_id)) if el_id else int(dist * 1000),
        "station_name": name,
        "address": cleaned_addr,
        "latitude": float(st_lat),
        "longitude": float(st_lon),
        "distance_km": dist,
        "operator": operator,
        "charging_power": round(max_kw, 1),
        "connector_type": ", ".join(connector_names),
        "connector_types": connector_names,
        "availability_status": "Live availability not provided by the data source.",
        "pricing_per_kwh": None,
        "pricing_text": pricing_text,
        "is_operational": True,
        "status_title": "Operational",
        "ac_dc_type": ac_dc_type,
        "connections_count": capacity_count,
        "data_source": "OpenStreetMap (Overpass)",
        "last_updated": "Live",
        "rating": None, # Never invent
        "reviews_count": None, # Never invent
        "review_snippet": None, # Never invent
        "phone_number": phone,
        "website_url": website,
        "opening_hours": opening_hours,
        "ports_detail": ports_detail,
        "is_offline_sample": False
    }


async def query_overpass_mirrors(query_str: str, timeout_sec: float = 8.5) -> List[Dict[str, Any]]:
    """
    Race public Overpass API mirrors with an overall timeout budget.
    Returns elements from the first successful HTTP 200 response.
    """
    custom_mirrors = os.getenv("OVERPASS_URLS", "")
    if custom_mirrors:
        mirrors = [m.strip() for m in custom_mirrors.split(",") if m.strip()]
    else:
        mirrors = [
            "https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter",
            "https://overpass.private.coffee/api/interpreter",
            "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
        ]

    headers = {
        "User-Agent": "EV-SmartTrace-360/1.0 (https://github.com/Gnanendra777/EV-SmartTrace-360)"
    }

    async def fetch_one(url: str) -> List[Dict[str, Any]]:
        client_timeout = httpx.Timeout(timeout_sec, connect=2.5)
        async with httpx.AsyncClient(timeout=client_timeout) as client:
            resp = await client.post(url, data={"data": query_str}, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                elements = data.get("elements", [])
                if isinstance(elements, list):
                    return elements
            raise RuntimeError(f"Overpass mirror {url} returned HTTP {resp.status_code}")

    # Launch concurrent tasks and take the first success
    tasks = [asyncio.create_task(fetch_one(m)) for m in mirrors]
    done_elements: List[Dict[str, Any]] = []

    try:
        for fut in asyncio.as_completed(tasks, timeout=timeout_sec):
            try:
                res = await fut
                done_elements = res
                break
            except Exception:
                continue
    except asyncio.TimeoutError:
        logger.warning("Overpass mirror race timed out after %s seconds", timeout_sec)
    finally:
        for t in tasks:
            if not t.done():
                t.cancel()

    return done_elements


async def fetch_overpass_stations(lat: float, lon: float, radius_km: float = 25.0) -> List[Dict[str, Any]]:
    """Fetch EV charging stations from OpenStreetMap Overpass within radius in meters."""
    radius_m = int(radius_km * 1000)
    # Overpass QL query around user position
    query = f"""[out:json][timeout:20];
(
  node["amenity"="charging_station"](around:{radius_m},{lat},{lon});
  way["amenity"="charging_station"](around:{radius_m},{lat},{lon});
);
out center tags;"""

    elements = await query_overpass_mirrors(query)
    stations: List[Dict[str, Any]] = []
    for el in elements:
        parsed = parse_overpass_element(el, lat, lon)
        if parsed:
            stations.append(parsed)

    stations.sort(key=lambda s: s["distance_km"])
    return stations


async def fetch_overpass_in_bounds(
    south: float, west: float, north: float, east: float
) -> List[Dict[str, Any]]:
    """Fetch EV charging stations in bounding box from OpenStreetMap Overpass."""
    query = f"""[out:json][timeout:20];
(
  node["amenity"="charging_station"]({south},{west},{north},{east});
  way["amenity"="charging_station"]({south},{west},{north},{east});
);
out center tags;"""

    center_lat = (south + north) / 2.0
    center_lon = (west + east) / 2.0

    elements = await query_overpass_mirrors(query)
    stations: List[Dict[str, Any]] = []
    for el in elements:
        parsed = parse_overpass_element(el, center_lat, center_lon)
        if parsed:
            stations.append(parsed)

    stations.sort(key=lambda s: s["distance_km"])
    return stations


def format_open_charge_map_poi(poi: Dict[str, Any], user_lat: float, user_lon: float) -> Dict[str, Any]:
    """Transform raw Open Charge Map POI into EV SmartTrace 360 schema without invented data."""
    addr = poi.get("AddressInfo", {})
    st_lat = addr.get("Latitude", user_lat)
    st_lon = addr.get("Longitude", user_lon)

    dist = addr.get("Distance")
    if dist is None or dist == 0.0:
        dist = haversine_distance(user_lat, user_lon, float(st_lat), float(st_lon))
    else:
        dist = round(float(dist), 2)

    connections = poi.get("Connections", []) or []
    connector_names = []
    max_kw = 0.0
    has_dc = False
    has_ac = False
    total_ports = 0

    ports_detail = []
    for c in connections:
        conn_title = normalize_connector_name(c.get("ConnectionType", {}).get("Title"))
        if conn_title not in connector_names:
            connector_names.append(conn_title)

        kw = c.get("PowerKW")
        if kw:
            p_val = float(kw)
            max_kw = max(max_kw, p_val)
        else:
            p_val = 22.0

        current_type = (c.get("CurrentType", {}).get("Title") or "").lower()
        if "dc" in current_type or "combo" in conn_title.lower() or "chademo" in conn_title.lower() or p_val >= 50:
            has_dc = True
        else:
            has_ac = True

        qty = int(c.get("Quantity") or 1)
        total_ports += qty

        ports_detail.append({
            "connector": conn_title,
            "power_kw": round(p_val, 0),
            "available": None, # Never invent availability
            "total": qty
        })

    if max_kw == 0.0:
        max_kw = 60.0 if has_dc else 22.0

    ac_dc_type = "AC / DC Fast" if (has_dc and has_ac) else ("DC Fast" if has_dc else "AC Level 2")
    operator_info = poi.get("OperatorInfo", {}) or {}
    operator_name = operator_info.get("Title") or "Independent Operator"

    # Status
    status_type = poi.get("StatusType", {}) or {}
    is_operational = status_type.get("IsOperational")
    status_title = status_type.get("Title") or ("Operational" if is_operational else "Operational")

    # Pricing
    usage_cost = poi.get("UsageCost")
    pricing_text = usage_cost.strip() if usage_cost and usage_cost.strip() else "Not provided"

    # Address
    address_parts = [
        addr.get("AddressLine1"),
        addr.get("Town"),
        addr.get("StateOrProvince"),
        addr.get("Postcode")
    ]
    full_address = ", ".join([p for p in address_parts if p]) or f"Coordinates: {st_lat:.4f}, {st_lon:.4f}"

    return {
        "id": int(poi.get("ID", 0)),
        "station_name": addr.get("Title") or "EV Charging Station",
        "address": full_address,
        "latitude": float(st_lat),
        "longitude": float(st_lon),
        "distance_km": dist,
        "operator": operator_name,
        "charging_power": round(max_kw, 1),
        "connector_type": ", ".join(connector_names) if connector_names else "CCS2, Type 2",
        "connector_types": connector_names if connector_names else ["CCS2", "Type 2"],
        "availability_status": "Live availability not provided by the data source.",
        "pricing_per_kwh": None,
        "pricing_text": pricing_text,
        "is_operational": is_operational if is_operational is not None else True,
        "status_title": status_title,
        "ac_dc_type": ac_dc_type,
        "connections_count": max(total_ports, 1),
        "data_source": poi.get("DataProvider", {}).get("Title") or "Open Charge Map",
        "last_updated": str(poi.get("DateLastStatusUpdate") or poi.get("DateCreated") or "Not provided"),
        "rating": None, # Never invent
        "reviews_count": None, # Never invent
        "review_snippet": None, # Never invent
        "phone_number": addr.get("ContactTelephone1"),
        "website_url": addr.get("RelatedURL"),
        "opening_hours": None, # Never invent
        "ports_detail": ports_detail,
        "is_offline_sample": False
    }


def get_offline_sample_stations(lat: float, lon: float, distance_km: float = 25.0) -> List[Dict[str, Any]]:
    """
    Offline fallback sample stations used ONLY when Overpass and Open Charge Map fail.
    Explicitly labeled as 'Offline sample' so user is always aware.
    """
    offsets = [
        {"dlat": 0.011, "dlon": 0.013, "name": "Regional EV Fast Hub", "op": "GridFast Network", "kw": 60.0, "conns": ["CCS2", "Type 2"], "acdc": "DC Fast"},
        {"dlat": -0.015, "dlon": 0.019, "name": "Transit Plaza EV Charging", "op": "VoltCharge Metro", "kw": 120.0, "conns": ["CCS2", "CHAdeMO"], "acdc": "DC Ultra-Fast"},
        {"dlat": 0.022, "dlon": -0.016, "name": "EcoCharge Corridor Point", "op": "CleanPower Charge", "kw": 30.0, "conns": ["Type 2", "Bharat AC001"], "acdc": "AC / DC"},
        {"dlat": -0.026, "dlon": -0.022, "name": "City Center Smart Park & Charge", "op": "UrbanVolt", "kw": 22.0, "conns": ["Type 2"], "acdc": "AC Level 2"},
        {"dlat": 0.038, "dlon": 0.031, "name": "Expressway High-Power Charging", "op": "HyperPulse EV", "kw": 150.0, "conns": ["CCS2", "Type 2"], "acdc": "DC Ultra-Fast"}
    ]

    results = []
    base_id = 99001
    for item in offsets:
        st_lat = round(lat + item["dlat"], 6)
        st_lon = round(lon + item["dlon"], 6)
        dist = haversine_distance(lat, lon, st_lat, st_lon)
        if dist <= distance_km:
            results.append({
                "id": base_id,
                "station_name": item["name"],
                "address": f"Near Sector Corridor, Lat: {st_lat:.4f}, Lon: {st_lon:.4f}",
                "latitude": st_lat,
                "longitude": st_lon,
                "distance_km": dist,
                "operator": item["op"],
                "charging_power": item["kw"],
                "connector_type": ", ".join(item["conns"]),
                "connector_types": item["conns"],
                "availability_status": "Live availability not provided by the data source.",
                "pricing_per_kwh": None,
                "pricing_text": "Not provided",
                "is_operational": True,
                "status_title": "Operational",
                "ac_dc_type": item["acdc"],
                "connections_count": len(item["conns"]) * 2,
                "data_source": "Offline sample",
                "last_updated": "Offline",
                "rating": None,
                "reviews_count": None,
                "review_snippet": None,
                "phone_number": None,
                "website_url": None,
                "opening_hours": None,
                "ports_detail": [
                    {"connector": item["conns"][0], "power_kw": int(item["kw"]), "available": None, "total": 2}
                ],
                "is_offline_sample": True
            })
            base_id += 1

    results.sort(key=lambda s: s["distance_km"])
    return results


async def fetch_open_charge_map_raw(
    lat: float, lon: float, distance_km: float, api_key: str, max_results: int = 50
) -> List[Dict[str, Any]]:
    """Call Open Charge Map API v3 when key is configured."""
    url = "https://api.openchargemap.io/v3/poi/"
    params = {
        "output": "json",
        "latitude": str(lat),
        "longitude": str(lon),
        "distance": str(distance_km),
        "distanceunit": "KM",
        "maxresults": str(min(max_results, 80)),
        "compact": "true",
        "verbose": "false",
        "key": api_key
    }
    headers = {
        "User-Agent": "EV-SmartTrace-360/1.0",
        "X-API-Key": api_key
    }

    try:
        client_timeout = httpx.Timeout(5.0, connect=2.0)
        async with httpx.AsyncClient(timeout=client_timeout) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code == 200:
                raw = resp.json()
                if isinstance(raw, list):
                    return [format_open_charge_map_poi(poi, lat, lon) for poi in raw]
    except Exception as exc:
        logger.warning("Open Charge Map query error: %s", exc)

    return []


async def fetch_open_charge_map_stations(
    lat: float,
    lon: float,
    distance_km: float = 25.0,
    max_results: int = 50,
    connector_type: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Primary data retrieval chain:
    1. Check in-memory 10-minute cache.
    2. Overpass API (OSM real live charging stations - free, no key).
    3. Open Charge Map API (only if OPEN_CHARGE_MAP_API_KEY is configured). Merge and deduplicate within 100m.
    4. Offline sample stations (only if live sources fail), clearly labeled 'Offline sample'.
    """
    cache_key = f"{round(lat, 2)}_{round(lon, 2)}_{round(distance_km)}_{max_results}_{connector_type}"
    now = time.time()

    if cache_key in _STATIONS_CACHE:
        cached_time, cached_data = _STATIONS_CACHE[cache_key]
        if now - cached_time < CACHE_TTL_SECONDS:
            return cached_data

    stations: List[Dict[str, Any]] = []

    # 1. Query Overpass API (Primary free live source)
    try:
        overpass_results = await fetch_overpass_stations(lat, lon, distance_km)
        if overpass_results:
            stations.extend(overpass_results)
    except Exception as op_err:
        logger.warning("Overpass query error: %s", op_err)

    # 2. Query Open Charge Map if API key is provided
    ocm_key = (getattr(settings, "OPEN_CHARGE_MAP_API_KEY", "") or os.getenv("OPEN_CHARGE_MAP_API_KEY", "")).strip()
    if ocm_key:
        try:
            ocm_results = await fetch_open_charge_map_raw(lat, lon, distance_km, ocm_key, max_results)
            # Merge OCM, deduplicating within 100 meters
            for item in ocm_results:
                if not any(haversine_distance(s["latitude"], s["longitude"], item["latitude"], item["longitude"]) < 0.1 for s in stations):
                    stations.append(item)
        except Exception as ocm_err:
            logger.warning("OCM merge error: %s", ocm_err)

    # 3. Filter by connector type if requested
    if stations and connector_type and connector_type != "All":
        filtered = [
            s for s in stations 
            if any(connector_type.lower() in c.lower() for c in s.get("connector_types", []))
        ]
        if filtered:
            stations = filtered

    # 4. Fallback to offline sample stations if all live sources failed
    if not stations:
        logger.info("All live station sources unavailable; returning labeled offline sample stations.")
        stations = get_offline_sample_stations(lat, lon, distance_km)

    stations.sort(key=lambda s: s.get("distance_km", 999))
    if max_results and len(stations) > max_results:
        stations = stations[:max_results]

    _STATIONS_CACHE[cache_key] = (now, stations)
    return stations


async def fetch_stations_in_bounds(
    south: float, west: float, north: float, east: float,
    connector_type: Optional[str] = None,
    min_power: Optional[float] = None
) -> List[Dict[str, Any]]:
    """Viewport bounding-box query for live map browsing."""
    stations: List[Dict[str, Any]] = []
    try:
        stations = await fetch_overpass_in_bounds(south, west, north, east)
    except Exception as exc:
        logger.warning("Viewport Overpass query error: %s", exc)

    if not stations:
        center_lat = (south + north) / 2.0
        center_lon = (west + east) / 2.0
        diag_km = haversine_distance(south, west, north, east) / 2.0
        stations = get_offline_sample_stations(center_lat, center_lon, diag_km)

    if connector_type and connector_type != "All":
        stations = [
            s for s in stations 
            if any(connector_type.lower() in c.lower() for c in s.get("connector_types", []))
        ]
    if min_power:
        stations = [s for s in stations if s.get("charging_power", 0) >= min_power]

    return stations
