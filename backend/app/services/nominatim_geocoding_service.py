import time
import asyncio
import logging
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger("nominatim_geocoding_service")

# In-memory TTL cache for geocoding queries
_GEOCODE_CACHE: Dict[str, tuple[float, List[Dict[str, Any]]]] = {}
GEOCODE_CACHE_TTL = 86400 # 24 hours

# Rate limiting timestamp for Nominatim public usage policy (1 request / second)
_LAST_NOMINATIM_REQUEST_TIME = 0.0


async def search_destination_nominatim(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Query OpenStreetMap Nominatim API for destination suggestions.
    Enforces Nominatim 1-req/sec policy, custom User-Agent, and caching.
    """
    global _LAST_NOMINATIM_REQUEST_TIME
    q_clean = query.strip().lower()
    if not q_clean or len(q_clean) < 2:
        return []

    now = time.time()
    cache_key = f"geo_{q_clean}_{limit}"
    if cache_key in _GEOCODE_CACHE:
        cached_time, cached_res = _GEOCODE_CACHE[cache_key]
        if now - cached_time < GEOCODE_CACHE_TTL:
            return cached_res

    # Respect 1 req/sec policy
    elapsed = now - _LAST_NOMINATIM_REQUEST_TIME
    if elapsed < 1.0:
        await asyncio.sleep(1.0 - elapsed)

    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": query.strip(),
        "format": "json",
        "addressdetails": "1",
        "limit": str(min(limit, 10))
    }
    headers = {
        "User-Agent": "EV-SmartTrace-360-Navigator/1.0 (https://github.com/Gnanendra777/EV-SmartTrace-360)"
    }

    try:
        _LAST_NOMINATIM_REQUEST_TIME = time.time()
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(url, params=params, headers=headers)
            if response.status_code == 200:
                raw_data = response.json()
                results = []
                for item in raw_data:
                    results.append({
                        "display_name": item.get("display_name", ""),
                        "lat": float(item.get("lat", 0.0)),
                        "lon": float(item.get("lon", 0.0)),
                        "type": item.get("type", "destination"),
                        "importance": item.get("importance", 0.0)
                    })
                _GEOCODE_CACHE[cache_key] = (time.time(), results)
                return results

    except Exception as exc:
        logger.warning("Nominatim geocoding exception: %s", type(exc).__name__)

    return []
