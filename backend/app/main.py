import os
import sys
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

# Ensure backend directory and root directory are in sys.path
_current_dir = os.path.dirname(os.path.abspath(__file__))
_backend_dir = os.path.dirname(_current_dir)
_root_dir = os.path.dirname(_backend_dir)
for _p in [_backend_dir, _root_dir]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from app.config import settings
from app.database import Base, engine, SessionLocal
from app.models import (
    User, Vehicle, BatteryReading, EnergyConsumption, 
    ChargingStation, ChargingSession, VehicleDiagnostic, 
    RouteHistory, RouteChargingStop, VoiceConversation, 
    Notification, AIPrediction
)
from app.security.auth import get_password_hash
from app.websocket.telemetry_ws import stream_telemetry
from app.routers import (
    auth, vehicles, battery, energy, charging, 
    diagnostics, routes, assistant, notifications, dashboard,
    vehicle_controls
)

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ev_smarttrace")


def seed_initial_data():
    """Auto-seed default user, vehicle, stations, and diagnostics on startup"""
    db = SessionLocal()
    try:
        # Create all tables if not exist
        Base.metadata.create_all(bind=engine)

        # Check if demo user exists
        demo_user = db.query(User).filter(User.email == "demo@evsmarttrace.com").first()
        if not demo_user:
            demo_user = User(
                name="Alex Rivers",
                email="demo@evsmarttrace.com",
                password_hash=get_password_hash("DemoPassword123!")
            )
            db.add(demo_user)
            db.commit()
            db.refresh(demo_user)
            logger.info("Demo user created: demo@evsmarttrace.com (Password: DemoPassword123!)")

        # Seed the 3 standardized sample EV profiles with full historical records
        from app.services.simulation_service import seed_sample_ev_datasets
        seed_sample_ev_datasets(db, demo_user.id)

        # Stations are queried dynamically from live Overpass API / Open Charge Map
        # rather than seeding hardcoded regional coordinates.
        logger.info("Database initial seed check complete.")

    except Exception as e:
        logger.error(f"Error seeding database: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up EV SmartTrace 360 Backend...")
    seed_initial_data()
    yield
    logger.info("Shutting down EV SmartTrace 360 Backend...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Intelligent Electric Vehicle Telemetry, Predictive Range, Diagnostics, and SmartVoice Assistant API",
    lifespan=lifespan
)

# CORS Configuration for Local, Vercel Production, and Preview Deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket Endpoint for Live Telemetry
@app.websocket("/ws/telemetry/{vehicle_id}")
async def websocket_telemetry_endpoint(websocket: WebSocket, vehicle_id: int):
    await stream_telemetry(vehicle_id, websocket)


# Include API Routers (Mount with /api and root prefixes for seamless Vercel / serverless compatibility)
all_routers = [
    auth.router, vehicles.router, battery.router, energy.router, 
    charging.router, diagnostics.router, routes.router, 
    assistant.router, notifications.router, dashboard.router, 
    vehicle_controls.router
]

for r in all_routers:
    app.include_router(r, prefix=settings.API_V1_PREFIX)
    app.include_router(r)


@app.post("/api/geocoding/search", tags=["AI Smart Route & Navigation Engine"])
@app.post("/geocoding/search", tags=["AI Smart Route & Navigation Engine"])
async def geocoding_search_direct(req: dict):
    query = req.get("query", "")
    limit = req.get("limit", 5)
    from app.services.nominatim_geocoding_service import search_destination_nominatim
    results = await search_destination_nominatim(query=query, limit=limit)
    return results


@app.get("/")
@app.get("/api")
def root():
    return {
        "platform": settings.PROJECT_NAME,
        "tagline": "Drive Smart. Charge Smart. Travel Safe.",
        "status": "online",
        "version": settings.VERSION,
        "docs_url": "/docs"
    }
