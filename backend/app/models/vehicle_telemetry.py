from sqlalchemy import Column, Integer, Float, String, Boolean, Text, DateTime, ForeignKey, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class VehicleTelemetryState(Base):
    __tablename__ = "vehicle_telemetry_states"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)

    # TPMS (Tyre Pressure & Temperature)
    tpms_fl_psi = Column(Float, default=36.0)
    tpms_fr_psi = Column(Float, default=36.0)
    tpms_rl_psi = Column(Float, default=36.0)
    tpms_rr_psi = Column(Float, default=36.0)
    tpms_fl_temp_c = Column(Float, default=32.0)
    tpms_fr_temp_c = Column(Float, default=32.5)
    tpms_rl_temp_c = Column(Float, default=31.8)
    tpms_rr_temp_c = Column(Float, default=32.1)
    tpms_status = Column(String(50), default="normal") # normal, warning, critical
    tpms_alert = Column(String(255), nullable=True)

    # Doors & Latches
    door_front_left = Column(Boolean, default=False)   # False = closed, True = open
    door_front_right = Column(Boolean, default=False)
    door_rear_left = Column(Boolean, default=False)
    door_rear_right = Column(Boolean, default=False)
    trunk_open = Column(Boolean, default=False)
    frunk_open = Column(Boolean, default=False)
    charge_port_open = Column(Boolean, default=False)
    doors_locked = Column(Boolean, default=True)
    vehicle_speed_kmh = Column(Float, default=0.0)

    # Seatbelts & Occupancy
    seat_driver_occupied = Column(Boolean, default=True)
    seat_driver_belt = Column(Boolean, default=True)
    seat_passenger_occupied = Column(Boolean, default=False)
    seat_passenger_belt = Column(Boolean, default=False)
    seat_rear_left_occupied = Column(Boolean, default=False)
    seat_rear_left_belt = Column(Boolean, default=False)
    seat_rear_mid_occupied = Column(Boolean, default=False)
    seat_rear_mid_belt = Column(Boolean, default=False)
    seat_rear_right_occupied = Column(Boolean, default=False)
    seat_rear_right_belt = Column(Boolean, default=False)

    # Climate Control System
    climate_power = Column(Boolean, default=True)
    target_temp_c = Column(Float, default=22.0)
    cabin_temp_c = Column(Float, default=23.5)
    fan_speed = Column(Integer, default=2) # 1 - 5
    air_circulation = Column(String(50), default="fresh_air") # 'recirculate', 'fresh_air'
    ac_mode = Column(String(50), default="auto") # 'auto', 'eco', 'manual'
    defrost_active = Column(Boolean, default=False)

    # Subsystem Health Status for 3D Model
    battery_pack_status = Column(String(50), default="normal")
    motor_status = Column(String(50), default="normal")
    brakes_status = Column(String(50), default="normal")
    cooling_status = Column(String(50), default="normal")
    electronics_status = Column(String(50), default="normal")
    charging_port_status = Column(String(50), default="normal")

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    vehicle = relationship("Vehicle", back_populates="telemetry_state")


class VehicleCommandLog(Base):
    __tablename__ = "vehicle_command_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True)
    command_type = Column(String(100), nullable=False)
    parameters = Column(Text, nullable=True) # JSON representation
    status = Column(String(50), default="executed") # 'executed', 'rejected', 'safety_blocked'
    safety_checked = Column(Boolean, default=True)
    safety_reason = Column(Text, nullable=True)
    response_message = Column(Text, nullable=False)
    initiated_by = Column(String(50), default="smartvoice") # 'smartvoice', 'dashboard', 'api'
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    vehicle = relationship("Vehicle", back_populates="command_logs")
