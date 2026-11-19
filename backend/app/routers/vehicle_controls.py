import json
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.battery import BatteryReading
from app.models.diagnostics import VehicleDiagnostic
from app.models.vehicle_telemetry import VehicleTelemetryState, VehicleCommandLog
from app.schemas.vehicle_telemetry import (
    TyreState,
    TyreStatusOut,
    DoorStatusOut,
    SeatItem,
    SeatbeltStatusOut,
    ClimateStatusOut,
    ComponentHealthDetail,
    VehicleFullHealthOut,
    VehicleCapabilitiesOut,
    VehicleCommandRequest,
    VehicleCommandResponse,
    VehicleCommandLogOut,
)
from app.security.auth import get_current_user

router = APIRouter(prefix="/vehicles", tags=["Vehicle Controls & Telemetry Digital Twin"])


def get_or_create_telemetry(db: Session, vehicle: Vehicle) -> VehicleTelemetryState:
    """Retrieve or initialize persistent digital twin telemetry state for a vehicle."""
    state = db.query(VehicleTelemetryState).filter(VehicleTelemetryState.vehicle_id == vehicle.id).first()
    if not state:
        state = VehicleTelemetryState(
            vehicle_id=vehicle.id,
            tpms_fl_psi=36.0,
            tpms_fr_psi=35.8,
            tpms_rl_psi=36.2,
            tpms_rr_psi=36.0,
            tpms_fl_temp_c=31.5,
            tpms_fr_temp_c=32.0,
            tpms_rl_temp_c=31.2,
            tpms_rr_temp_c=31.8,
            tpms_status="normal",
            door_front_left=False,
            door_front_right=False,
            door_rear_left=False,
            door_rear_right=False,
            trunk_open=False,
            frunk_open=False,
            charge_port_open=False,
            doors_locked=True,
            vehicle_speed_kmh=0.0,
            seat_driver_occupied=True,
            seat_driver_belt=True,
            seat_passenger_occupied=False,
            seat_passenger_belt=False,
            seat_rear_left_occupied=False,
            seat_rear_left_belt=False,
            seat_rear_mid_occupied=False,
            seat_rear_mid_belt=False,
            seat_rear_right_occupied=False,
            seat_rear_right_belt=False,
            climate_power=True,
            target_temp_c=22.0,
            cabin_temp_c=23.0,
            fan_speed=2,
            air_circulation="fresh_air",
            ac_mode="auto",
            defrost_active=False,
            battery_pack_status="normal",
            motor_status="normal",
            brakes_status="normal",
            cooling_status="warning",
            electronics_status="normal",
            charging_port_status="normal"
        )
        db.add(state)
        db.commit()
        db.refresh(state)
    return state


@router.get("/{vehicle_id}/health", response_model=VehicleFullHealthOut)
def get_vehicle_full_health(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")

    state = get_or_create_telemetry(db, vehicle)
    latest_reading = db.query(BatteryReading).filter(
        BatteryReading.vehicle_id == vehicle.id
    ).order_by(BatteryReading.timestamp.desc()).first()

    soc = float(vehicle.current_battery_pct if not latest_reading else latest_reading.soc)
    soh = float(latest_reading.soh if latest_reading and latest_reading.soh else 95.5)
    voltage = float(latest_reading.voltage if latest_reading and latest_reading.voltage else 400.0)
    temp = float(latest_reading.temperature if latest_reading and latest_reading.temperature else 28.5)

    diagnostics = db.query(VehicleDiagnostic).filter(VehicleDiagnostic.vehicle_id == vehicle.id).all()
    diag_history = [f"{d.fault_code}: {d.description} ({d.severity})" for d in diagnostics[:5]]

    components = [
        ComponentHealthDetail(
            component_id="battery",
            name="High-Voltage Battery Pack & Modules",
            status=state.battery_pack_status,
            current_reading=f"{soc:.0f}% SOC | {voltage:.1f}V | {temp:.1f}°C | SOH {soh:.1f}%",
            temperature_c=temp,
            voltage_v=voltage,
            severity="normal" if state.battery_pack_status == "normal" else "warning",
            description=f"Lithium-ion energy storage system with {vehicle.battery_capacity} kWh nominal capacity. Active liquid thermal management and BMS balancing delta under 8 mV.",
            recommendation="Maintain standard 20%-80% charging habits for maximum pack lifecycle longevity.",
            diagnostic_history=diag_history
        ),
        ComponentHealthDetail(
            component_id="motor",
            name="Permanent Magnet Traction Motor",
            status=state.motor_status,
            current_reading="Synchronous Drive | Inverter Gate PWM 98.2% | Stator 54.0°C",
            temperature_c=54.0,
            voltage_v=voltage,
            severity="normal",
            description="Permanent magnet synchronous electric motor with dual-channel field-oriented vector control and integrated reduction gearbox.",
            recommendation="Drive unit lubricant scheduled for routine inspection at 80,000 km.",
            diagnostic_history=[]
        ),
        ComponentHealthDetail(
            component_id="tyres",
            name="Tyre Pressure Monitoring System (TPMS)",
            status=state.tpms_status,
            current_reading=f"FL: {state.tpms_fl_psi:.1f} PSI | FR: {state.tpms_fr_psi:.1f} PSI | RL: {state.tpms_rl_psi:.1f} PSI | RR: {state.tpms_rr_psi:.1f} PSI",
            temperature_c=round(state.tpms_fl_temp_c, 1),
            severity="normal" if state.tpms_status == "normal" else "warning",
            description="Direct valve-mounted wheel pressure sensors with real-time temperature telemetry and rolling frequency calibration.",
            recommendation="Cold tyre inflation recommendation: 36 PSI front and rear.",
            diagnostic_history=[state.tpms_alert] if state.tpms_alert else []
        ),
        ComponentHealthDetail(
            component_id="brakes",
            name="Electro-Hydraulic & Regenerative Braking",
            status=state.brakes_status,
            current_reading="Regen Efficiency 94% | Friction Pad Wear 18% | Fluid Level Nominal",
            temperature_c=42.0,
            severity="normal",
            description="Blended regenerative braking with brake-by-wire hydraulic modulation and integrated ABS/ESC safety algorithms.",
            recommendation="Brake fluid moisture content is optimal (<1%). Brake pads have over 65,000 km remaining.",
            diagnostic_history=[]
        ),
        ComponentHealthDetail(
            component_id="cooling",
            name="Thermal Management & Cooling Loop",
            status=state.cooling_status,
            current_reading="Coolant Temp 42.0°C | Inverter Loop 1.4 Bar | Heat Pump Active",
            temperature_c=42.0,
            severity="warning" if state.cooling_status == "warning" else "normal",
            description="Dual-circuit liquid cooling system with chiller heat exchanger, PTC cabin heater, and reversible heat-pump refrigeration loop.",
            recommendation="P0A93-00 advisory: Check inverter coolant reservoir fluid level and ensure active aero shutters are clear.",
            diagnostic_history=["P0A93-00: Inverter cooling loop flow restriction notice"]
        ),
        ComponentHealthDetail(
            component_id="electronics",
            name="Power Electronics & 12V Auxiliary Bus",
            status=state.electronics_status,
            current_reading="12V Aux: 13.8V Float | DC-DC Efficiency 95.8% | Isolation >500 MΩ",
            voltage_v=13.8,
            severity="normal",
            description="Silicon-carbide (SiC) traction inverter, bidirectional onboard AC charger, and HV-to-LV buck converter.",
            recommendation="High-voltage isolation integrity confirmed. Low-voltage battery fully conditioned.",
            diagnostic_history=[]
        ),
        ComponentHealthDetail(
            component_id="charging_port",
            name="High-Power Charging Port & Actuator",
            status=state.charging_port_status,
            current_reading=f"{'Port Flap Open' if state.charge_port_open else 'Port Closed'} | {vehicle.connector_types} | Max {vehicle.max_charging_power:.0f} kW",
            severity="normal",
            description="Motorized locking actuator with contact pin temperature sensors and pilot signal optical isolation.",
            recommendation="Ensure charging inlet pins remain dry and clear of dust or ice.",
            diagnostic_history=[]
        ),
        ComponentHealthDetail(
            component_id="doors",
            name="Doors, Frunk & Seat-Belt Restraints",
            status="normal",
            current_reading=f"{'All Doors Locked' if state.doors_locked else 'Doors Unlocked'} | Driver Belt Fastened",
            severity="normal",
            description="Central safety ECU monitoring latch proximity switches, capacitive locks, and pyrotechnic seat belt tensioners.",
            recommendation="All occupant restraint sensors responding within millisecond tolerances.",
            diagnostic_history=[]
        )
    ]

    return VehicleFullHealthOut(
        vehicle_id=vehicle.id,
        vehicle_name=vehicle.vehicle_name,
        soc=soc,
        soh=soh,
        pack_voltage=voltage,
        pack_temp_c=temp,
        overall_status="Normal Operating Condition",
        health_score=96,
        components=components,
        updated_at=datetime.now(timezone.utc)
    )


@router.get("/{vehicle_id}/tyres", response_model=TyreStatusOut)
def get_tyre_status(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")

    state = get_or_create_telemetry(db, vehicle)

    def to_tyre(psi: float, temp: float) -> TyreState:
        kpa = round(psi * 6.89476, 1)
        stat = "normal"
        alert = None
        if psi < 25.0:
            stat = "critical"
            alert = f"Critical tyre pressure ({psi:.1f} PSI). Immediate inflation required!"
        elif psi < 31.0:
            stat = "warning"
            alert = f"Low tyre pressure detected ({psi:.1f} PSI). Recommended is 36.0 PSI."
        elif psi > 44.0:
            stat = "warning"
            alert = f"High tyre pressure detected ({psi:.1f} PSI)."
        return TyreState(psi=round(psi, 1), kpa=kpa, temp_c=round(temp, 1), status=stat, alert=alert)

    fl = to_tyre(state.tpms_fl_psi, state.tpms_fl_temp_c)
    fr = to_tyre(state.tpms_fr_psi, state.tpms_fr_temp_c)
    rl = to_tyre(state.tpms_rl_psi, state.tpms_rl_temp_c)
    rr = to_tyre(state.tpms_rr_psi, state.tpms_rr_temp_c)

    overall = "normal"
    if any(t.status == "critical" for t in [fl, fr, rl, rr]):
        overall = "critical"
    elif any(t.status == "warning" for t in [fl, fr, rl, rr]):
        overall = "warning"

    alert_summary = state.tpms_alert
    if not alert_summary:
        alerts = [t.alert for t in [fl, fr, rl, rr] if t.alert]
        if alerts:
            alert_summary = alerts[0]

    return TyreStatusOut(
        vehicle_id=vehicle.id,
        fl=fl,
        fr=fr,
        rl=rl,
        rr=rr,
        tpms_status=overall,
        tpms_alert=alert_summary,
        unit="PSI",
        updated_at=datetime.now(timezone.utc)
    )


@router.get("/{vehicle_id}/doors", response_model=DoorStatusOut)
def get_door_status(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")

    state = get_or_create_telemetry(db, vehicle)
    safe = state.vehicle_speed_kmh == 0.0

    return DoorStatusOut(
        vehicle_id=vehicle.id,
        front_left=state.door_front_left,
        front_right=state.door_front_right,
        rear_left=state.door_rear_left,
        rear_right=state.door_rear_right,
        trunk=state.trunk_open,
        frunk=state.frunk_open,
        charge_port=state.charge_port_open,
        locked=state.doors_locked,
        vehicle_speed_kmh=state.vehicle_speed_kmh,
        safe_to_operate=safe,
        updated_at=datetime.now(timezone.utc)
    )


@router.get("/{vehicle_id}/seatbelts", response_model=SeatbeltStatusOut)
def get_seatbelt_status(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")

    state = get_or_create_telemetry(db, vehicle)

    def to_seat(pos: str, occ: bool, belt: bool) -> SeatItem:
        stat = "warning" if (occ and not belt) else "normal"
        return SeatItem(position=pos, occupied=occ, fastened=belt, status=stat)

    driver = to_seat("Driver", state.seat_driver_occupied, state.seat_driver_belt)
    passgr = to_seat("Front Passenger", state.seat_passenger_occupied, state.seat_passenger_belt)
    rl = to_seat("Rear Left", state.seat_rear_left_occupied, state.seat_rear_left_belt)
    rm = to_seat("Rear Middle", state.seat_rear_mid_occupied, state.seat_rear_mid_belt)
    rr = to_seat("Rear Right", state.seat_rear_right_occupied, state.seat_rear_right_belt)

    seats = [driver, passgr, rl, rm, rr]
    warnings = any(s.status == "warning" for s in seats)
    all_fast = all(s.fastened for s in seats if s.occupied)

    return SeatbeltStatusOut(
        vehicle_id=vehicle.id,
        driver=driver,
        passenger=passgr,
        rear_left=rl,
        rear_mid=rm,
        rear_right=rr,
        all_fastened=all_fast,
        warnings_active=warnings,
        updated_at=datetime.now(timezone.utc)
    )


@router.get("/{vehicle_id}/climate", response_model=ClimateStatusOut)
def get_climate_status(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")

    state = get_or_create_telemetry(db, vehicle)
    return ClimateStatusOut(
        vehicle_id=vehicle.id,
        power=state.climate_power,
        target_temp_c=state.target_temp_c,
        cabin_temp_c=state.cabin_temp_c,
        fan_speed=state.fan_speed,
        air_circulation=state.air_circulation,
        ac_mode=state.ac_mode,
        defrost=state.defrost_active,
        updated_at=datetime.now(timezone.utc)
    )


@router.get("/{vehicle_id}/capabilities", response_model=VehicleCapabilitiesOut)
def get_vehicle_capabilities(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")

    return VehicleCapabilitiesOut(vehicle_id=vehicle.id)


@router.post("/{vehicle_id}/commands", response_model=VehicleCommandResponse)
def execute_vehicle_command(
    vehicle_id: int,
    cmd_req: VehicleCommandRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")

    state = get_or_create_telemetry(db, vehicle)
    cmd = cmd_req.command.lower().strip()
    params = cmd_req.parameters or {}

    # 1. CRITICAL SAFETY INTERLOCK
    # Reject steering, acceleration, throttle, friction braking
    prohibited_keywords = ["steer", "turn", "wheel", "accelerat", "gas", "pedal", "throttle", "brake", "braking", "stop_car", "drive"]
    if any(k in cmd for k in prohibited_keywords) and not ("brake_check" in cmd or "regen" in cmd):
        reason = "Autonomous steering, acceleration, and braking control via SmartVoice or remote API are strictly prohibited for passenger safety."
        log = VehicleCommandLog(
            vehicle_id=vehicle.id,
            command_type=cmd,
            parameters=json.dumps(params),
            status="safety_blocked",
            safety_checked=True,
            safety_reason=reason,
            response_message=f"Safety Interlock Rejection: {reason}",
            initiated_by="smartvoice"
        )
        db.add(log)
        db.commit()
        return VehicleCommandResponse(
            command=cmd,
            status="safety_blocked",
            message=f"Safety Interlock Rejection: {reason}",
            safety_checked=True
        )

    # 2. DOORS & SPEED SAFETY CHECK
    # Moving vehicle door unlock prevention
    if cmd in ["door_unlock", "unlock_doors", "open_door", "open_trunk", "open_frunk"] and state.vehicle_speed_kmh > 0.0:
        reason = f"Cannot unlock or open vehicle doors while vehicle is in motion (Speed: {state.vehicle_speed_kmh} km/h)."
        log = VehicleCommandLog(
            vehicle_id=vehicle.id,
            command_type=cmd,
            parameters=json.dumps(params),
            status="safety_blocked",
            safety_checked=True,
            safety_reason=reason,
            response_message=f"Safety Interlock Rejection: {reason}",
            initiated_by="smartvoice"
        )
        db.add(log)
        db.commit()
        return VehicleCommandResponse(
            command=cmd,
            status="safety_blocked",
            message=f"Safety Interlock Rejection: {reason}",
            safety_checked=True
        )

    # 3. COMMAND EXECUTION DISPATCHER
    msg = ""
    status_code = "executed"

    if cmd in ["climate_power", "ac_on", "ac_off", "turn_on_ac", "turn_off_ac"]:
        if "power" in params:
            state.climate_power = bool(params["power"])
        else:
            state.climate_power = False if ("off" in cmd) else True
        msg = f"Climate control has been turned {'ON' if state.climate_power else 'OFF'}."

    elif cmd in ["set_temperature", "temp_up", "temp_down", "set_temp"]:
        target = params.get("temperature")
        if target is None:
            if "up" in cmd:
                target = min(30.0, state.target_temp_c + 1.0)
            elif "down" in cmd:
                target = max(16.0, state.target_temp_c - 1.0)
            else:
                target = 22.0
        target = float(target)
        if target < 16.0 or target > 30.0:
            status_code = "rejected"
            msg = f"Requested temperature {target}°C is outside the safe comfort operating range of 16°C to 30°C."
        else:
            state.target_temp_c = target
            state.climate_power = True
            msg = f"Cabin temperature set to {state.target_temp_c:.1f}°C."

    elif cmd in ["set_fan_speed", "fan_speed"]:
        speed = int(params.get("speed", 3))
        state.fan_speed = max(1, min(5, speed))
        state.climate_power = True
        msg = f"AC Fan speed adjusted to Level {state.fan_speed}."

    elif cmd in ["set_circulation", "air_recirculation", "fresh_air"]:
        mode = params.get("mode", "fresh_air" if "fresh" in cmd else "recirculate")
        state.air_circulation = "recirculate" if mode == "recirculate" else "fresh_air"
        msg = f"Cabin air circulation set to {'Recirculate' if state.air_circulation == 'recirculate' else 'Fresh Air'} mode."

    elif cmd in ["door_lock", "lock_doors", "lock"]:
        state.doors_locked = True
        # Ensure all doors are closed when locked
        state.door_front_left = False
        state.door_front_right = False
        state.door_rear_left = False
        state.door_rear_right = False
        msg = "All vehicle doors and latches are securely locked."

    elif cmd in ["door_unlock", "unlock_doors", "unlock"]:
        state.doors_locked = False
        msg = "Vehicle doors have been unlocked."

    elif cmd in ["trunk_toggle", "open_trunk", "close_trunk"]:
        state.trunk_open = not state.trunk_open
        msg = f"Rear luggage trunk has been {'opened' if state.trunk_open else 'closed'}."

    elif cmd in ["frunk_toggle", "open_frunk", "close_frunk"]:
        state.frunk_open = not state.frunk_open
        msg = f"Front cargo frunk has been {'opened' if state.frunk_open else 'closed'}."

    elif cmd in ["charge_port_toggle", "open_charge_port", "close_charge_port"]:
        state.charge_port_open = not state.charge_port_open
        msg = f"Charging port motorized flap has been {'opened' if state.charge_port_open else 'closed'}."

    elif cmd in ["honk_horn", "flash_lights"]:
        msg = "Vehicle horn and headlights pulsed successfully to assist location."

    elif cmd in ["precondition_battery"]:
        msg = "Battery thermal preconditioning initiated. Optimal cell temperature for high-power DC fast charging will be reached in ~12 minutes."

    else:
        status_code = "rejected"
        msg = f"Unrecognized vehicle command '{cmd}'. Supported commands include climate, doors, and diagnostics queries."

    db.commit()
    db.refresh(state)

    # Log command history
    cmd_log = VehicleCommandLog(
        vehicle_id=vehicle.id,
        command_type=cmd,
        parameters=json.dumps(params),
        status=status_code,
        safety_checked=True,
        response_message=msg,
        initiated_by=params.get("source", "smartvoice")
    )
    db.add(cmd_log)
    db.commit()

    return VehicleCommandResponse(
        command=cmd,
        status=status_code,
        message=msg,
        parameters=params,
        safety_checked=True,
        state={
            "climate_power": state.climate_power,
            "target_temp_c": state.target_temp_c,
            "fan_speed": state.fan_speed,
            "doors_locked": state.doors_locked,
            "trunk_open": state.trunk_open,
            "charge_port_open": state.charge_port_open,
        }
    )


@router.get("/{vehicle_id}/commands/history", response_model=List[VehicleCommandLogOut])
def get_vehicle_command_history(
    vehicle_id: int,
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")

    return db.query(VehicleCommandLog).filter(
        VehicleCommandLog.vehicle_id == vehicle.id
    ).order_by(VehicleCommandLog.created_at.desc()).limit(limit).all()
