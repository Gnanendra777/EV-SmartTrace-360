from datetime import datetime
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


class TyreState(BaseModel):
    psi: float
    kpa: float
    temp_c: float
    status: str # 'normal', 'warning', 'critical'
    alert: Optional[str] = None


class TyreStatusOut(BaseModel):
    vehicle_id: int
    fl: TyreState
    fr: TyreState
    rl: TyreState
    rr: TyreState
    tpms_status: str
    tpms_alert: Optional[str] = None
    unit: str = "PSI"
    updated_at: datetime


class DoorStatusOut(BaseModel):
    vehicle_id: int
    front_left: bool # False = closed, True = open
    front_right: bool
    rear_left: bool
    rear_right: bool
    trunk: bool
    frunk: bool
    charge_port: bool
    locked: bool
    vehicle_speed_kmh: float
    safe_to_operate: bool
    updated_at: datetime


class SeatItem(BaseModel):
    position: str
    occupied: bool
    fastened: bool
    status: str # 'normal', 'warning' (occupied but unfastened)


class SeatbeltStatusOut(BaseModel):
    vehicle_id: int
    driver: SeatItem
    passenger: SeatItem
    rear_left: SeatItem
    rear_mid: SeatItem
    rear_right: SeatItem
    all_fastened: bool
    warnings_active: bool
    updated_at: datetime


class ClimateStatusOut(BaseModel):
    vehicle_id: int
    power: bool
    target_temp_c: float
    cabin_temp_c: float
    fan_speed: int
    air_circulation: str # 'fresh_air' or 'recirculate'
    ac_mode: str # 'auto', 'eco', 'manual'
    defrost: bool
    updated_at: datetime


class ComponentHealthDetail(BaseModel):
    component_id: str # 'battery', 'motor', 'tyres', 'brakes', 'cooling', 'electronics', 'charging_port', 'doors'
    name: str
    status: str # 'normal', 'warning', 'critical', 'unavailable'
    current_reading: str
    temperature_c: Optional[float] = None
    voltage_v: Optional[float] = None
    severity: str
    description: str
    recommendation: str
    diagnostic_history: List[str] = []


class VehicleFullHealthOut(BaseModel):
    vehicle_id: int
    vehicle_name: str
    soc: float
    soh: float
    pack_voltage: float
    pack_temp_c: float
    overall_status: str
    health_score: int
    components: List[ComponentHealthDetail]
    updated_at: datetime


class VehicleCapabilitiesOut(BaseModel):
    vehicle_id: int
    voice_control_enabled: bool = True
    remote_climate_control: bool = True
    remote_door_lock: bool = True
    digital_twin_360_supported: bool = True
    tpms_supported: bool = True
    seatbelt_detection_supported: bool = True
    prohibited_controls: List[str] = ["steering", "acceleration", "braking"]


class VehicleCommandRequest(BaseModel):
    command: str # e.g. 'climate_power', 'set_temperature', 'set_fan_speed', 'set_circulation', 'door_lock', 'open_trunk', 'close_trunk'
    parameters: Optional[Dict[str, Any]] = None
    confirmed: Optional[bool] = False


class VehicleCommandResponse(BaseModel):
    command: str
    status: str # 'executed', 'rejected', 'safety_blocked', 'confirmation_required'
    message: str
    parameters: Optional[Dict[str, Any]] = None
    safety_checked: bool = True
    state: Optional[Dict[str, Any]] = None


class VehicleCommandLogOut(BaseModel):
    id: int
    vehicle_id: int
    command_type: str
    parameters: Optional[str] = None
    status: str
    safety_checked: bool
    safety_reason: Optional[str] = None
    response_message: str
    initiated_by: str
    created_at: datetime

    class Config:
        from_attributes = True
