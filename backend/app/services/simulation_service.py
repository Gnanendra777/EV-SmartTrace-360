import random
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
from app.models.vehicle import Vehicle
from app.models.battery import BatteryReading
from app.models.energy import EnergyConsumption
from app.models.charging import ChargingSession
from app.models.diagnostics import VehicleDiagnostic
from app.models.vehicle_telemetry import VehicleTelemetryState


SAMPLE_EV_PROFILES = [
    {
        "vehicle_name": "City EV (Demo)",
        "manufacturer": "Nissan",
        "model": "Leaf Urban Edition",
        "vehicle_type": "Hatchback",
        "battery_capacity": 40.0,
        "battery_chemistry": "Lithium Iron Phosphate (LFP)",
        "max_charging_power": 50.0,
        "connector_types": "Type 2, CHAdeMO",
        "vehicle_identifier": "EV-CITY-40KWH-DEMO",
        "current_battery_pct": 70.0,
        "efficiency_kwh_km": 0.140,
        "target_soc": 70.0,
        "target_soh": 96.0,
        "target_temp": 29.0,
        "target_voltage": 380.0,
        "est_range": 200.0,
        "diagnostics": [
            {
                "component": "12V Auxiliary System",
                "fault_code": "B1042-01",
                "description": "Auxiliary 12V battery cycle count approaching recommended preventive check interval.",
                "severity": "normal",
                "sensor_value": 13.9,
                "expected_range": "13.2 - 14.4 V",
                "recommendation": "Inspect 12V state of health during annual service inspection."
            }
        ]
    },
    {
        "vehicle_name": "Long Range EV (Demo)",
        "manufacturer": "Hyundai",
        "model": "Ioniq 6 Long Range AWD",
        "vehicle_type": "Sedan",
        "battery_capacity": 75.0,
        "battery_chemistry": "Lithium Nickel Manganese Cobalt (NMC)",
        "max_charging_power": 240.0,
        "connector_types": "CCS2, Type 2",
        "vehicle_identifier": "EV-LR-75KWH-DEMO",
        "current_battery_pct": 85.0,
        "efficiency_kwh_km": 0.160,
        "target_soc": 85.0,
        "target_soh": 98.0,
        "target_temp": 31.0,
        "target_voltage": 680.0,
        "est_range": 398.0,
        "diagnostics": [
            {
                "component": "High-Voltage Battery Subsystem",
                "fault_code": "P0A1F-00",
                "description": "Battery Management System self-test verified. Cell imbalance within 3.2 mV ideal threshold.",
                "severity": "normal",
                "sensor_value": 3.2,
                "expected_range": "0.0 - 15.0 mV",
                "recommendation": "Maintain standard 20% to 80% daily charge profile for optimal battery longevity."
            }
        ]
    },
    {
        "vehicle_name": "Performance EV (Demo)",
        "manufacturer": "Porsche",
        "model": "Taycan 4S Cross Turismo",
        "vehicle_type": "Gran Turismo",
        "battery_capacity": 60.0,
        "battery_chemistry": "High-Rate NMC 811",
        "max_charging_power": 270.0,
        "connector_types": "CCS2, Type 2",
        "vehicle_identifier": "EV-PERF-60KWH-DEMO",
        "current_battery_pct": 45.0,
        "efficiency_kwh_km": 0.190,
        "target_soc": 45.0,
        "target_soh": 91.0,
        "target_temp": 34.0,
        "target_voltage": 720.0,
        "est_range": 142.0,
        "diagnostics": [
            {
                "component": "Cooling System",
                "fault_code": "P0A93-00",
                "description": "Inverter Cooling System Performance Degradation detected under high thermal load.",
                "severity": "warning",
                "sensor_value": 68.4,
                "expected_range": "35.0 - 60.0 °C",
                "recommendation": "Inspect coolant level and radiator fan assembly at next service."
            }
        ]
    }
]


def simulate_live_vehicle_telemetry(vehicle: Vehicle) -> Dict[str, Any]:
    """
    Generate realistic, physically consistent EV telemetry readings.
    """
    soc = float(vehicle.current_battery_pct)
    capacity = float(vehicle.battery_capacity)
    base_eff = float(vehicle.efficiency_kwh_km)

    nominal_voltage = 350.0 + (soc / 100.0) * 65.0
    voltage = round(nominal_voltage + random.uniform(-0.8, 0.8), 1)
    battery_temp = round(28.0 + (soc > 80) * 2.0 + random.uniform(-1.0, 1.2), 1)
    motor_temp = round(52.0 + random.uniform(-2.0, 3.0), 1)
    available_energy = round(capacity * (soc / 100.0), 2)
    live_consumption = round(base_eff + random.uniform(-0.010, 0.015), 3)
    cell_delta_mv = round(random.uniform(3.5, 8.0), 1)

    return {
        "vehicle_id": vehicle.id,
        "vehicle_name": vehicle.vehicle_name,
        "soc": soc,
        "soh": 95.0,
        "voltage": voltage,
        "temperature": battery_temp,
        "motor_temperature": motor_temp,
        "available_energy": available_energy,
        "battery_capacity": capacity,
        "live_consumption_kwh_km": live_consumption,
        "cell_delta_mv": cell_delta_mv,
        "auxiliary_12v_voltage": round(13.8 + random.uniform(-0.1, 0.1), 2),
        "tire_pressure_psi": {"fl": 39.2, "fr": 39.0, "rl": 40.1, "rr": 40.0},
        "data_source": "simulated",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


def seed_sample_ev_datasets(db, user_id: int) -> List[Vehicle]:
    """
    Seeds the 3 standardized sample EV profiles with complete realistic historical records.
    """
    created_vehicles = []
    now = datetime.now(timezone.utc)

    for profile in SAMPLE_EV_PROFILES:
        existing = db.query(Vehicle).filter(
            Vehicle.user_id == user_id,
            Vehicle.vehicle_name == profile["vehicle_name"]
        ).first()

        if not existing:
            vehicle = Vehicle(
                user_id=user_id,
                vehicle_name=profile["vehicle_name"],
                manufacturer=profile["manufacturer"],
                model=profile["model"],
                vehicle_type=profile["vehicle_type"],
                battery_capacity=profile["battery_capacity"],
                battery_chemistry=profile["battery_chemistry"],
                max_charging_power=profile["max_charging_power"],
                connector_types=profile["connector_types"],
                vehicle_identifier=f"{profile['vehicle_identifier']}-{user_id}",
                current_battery_pct=profile["current_battery_pct"],
                efficiency_kwh_km=profile["efficiency_kwh_km"],
                is_demo=True
            )
            db.add(vehicle)
            db.commit()
            db.refresh(vehicle)
        else:
            vehicle = existing

        # Check if historical data exists
        b_count = db.query(BatteryReading).filter(BatteryReading.vehicle_id == vehicle.id).count()
        if b_count < 15:
            # Generate 20 coherent historical battery readings
            for i in range(20, -1, -1):
                read_time = now - timedelta(days=i, hours=random.randint(1, 12))
                # Gentle degradation curve towards target SOH
                soh_val = round(profile["target_soh"] + (i * 0.05), 1)
                soc_val = profile["target_soc"] if i == 0 else round(max(20.0, min(95.0, profile["target_soc"] + (i % 5 - 2) * 6)), 1)
                temp_val = profile["target_temp"] if i == 0 else round(profile["target_temp"] + (i % 3 - 1) * 1.5, 1)

                reading = BatteryReading(
                    vehicle_id=vehicle.id,
                    soc=soc_val,
                    soh=soh_val,
                    voltage=profile["target_voltage"],
                    temperature=temp_val,
                    available_energy=round(profile["battery_capacity"] * (soc_val / 100.0), 2),
                    timestamp=read_time,
                    data_source="simulated"
                )
                db.add(reading)

            # Generate 15 daily energy consumption records
            for i in range(15, 0, -1):
                cons_time = now - timedelta(days=i)
                distance = round(random.uniform(25.0, 68.0), 1)
                eff = round(profile["efficiency_kwh_km"] + (i % 3 - 1) * 0.008, 3)
                energy_used = round(distance * eff, 2)

                db.add(EnergyConsumption(
                    vehicle_id=vehicle.id,
                    distance_km=distance,
                    energy_consumed_kwh=energy_used,
                    consumption_per_km=eff,
                    average_speed=round(random.uniform(42.0, 72.0), 1),
                    ambient_temperature=round(profile["target_temp"] + (i % 4 - 2) * 2.0, 1),
                    timestamp=cons_time
                ))

            # Generate 5 realistic charging sessions
            for i in range(5, 0, -1):
                session_start = now - timedelta(days=i * 3, hours=4)
                start_soc = round(random.uniform(18.0, 32.0), 1)
                end_soc = round(random.uniform(78.0, 85.0), 1)
                energy_kwh = round(profile["battery_capacity"] * ((end_soc - start_soc) / 100.0), 1)
                cost = round(energy_kwh * 0.28, 2)

                db.add(ChargingSession(
                    vehicle_id=vehicle.id,
                    station_id=None,
                    start_time=session_start,
                    end_time=session_start + timedelta(minutes=random.randint(22, 45)),
                    start_soc=start_soc,
                    end_soc=end_soc,
                    energy_kwh=energy_kwh,
                    charging_power=profile["max_charging_power"],
                    electricity_tariff=0.28,
                    total_cost=cost,
                    session_status="completed",
                    efficiency_estimate=93.5
                ))

            # Generate diagnostic observations
            for diag_info in profile["diagnostics"]:
                db.add(VehicleDiagnostic(
                    vehicle_id=vehicle.id,
                    component=diag_info["component"],
                    fault_code=diag_info["fault_code"],
                    description=diag_info["description"],
                    severity=diag_info["severity"],
                    sensor_value=diag_info["sensor_value"],
                    expected_range=diag_info["expected_range"],
                    recommendation=diag_info["recommendation"],
                    detection_source="isolation_forest",
                    detected_at=now - timedelta(days=2)
                ))

            db.commit()

        # Seed or ensure telemetry state exists
        t_state = db.query(VehicleTelemetryState).filter(VehicleTelemetryState.vehicle_id == vehicle.id).first()
        if not t_state:
            t_state = VehicleTelemetryState(
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
                climate_power=True,
                target_temp_c=22.0,
                cabin_temp_c=23.0,
                fan_speed=2,
                air_circulation="fresh_air",
                ac_mode="auto",
                defrost_active=False
            )
            db.add(t_state)
            db.commit()

        created_vehicles.append(vehicle)

    return created_vehicles


def seed_demo_vehicle_if_empty(db, user_id: int) -> Vehicle:
    """
    Ensure the user has all 3 sample EV datasets seeded.
    """
    vehicles = db.query(Vehicle).filter(Vehicle.user_id == user_id).all()
    if not vehicles:
        sample_vehicles = seed_sample_ev_datasets(db, user_id)
        return sample_vehicles[0]
    return vehicles[0]


def reset_demo_datasets(db, user_id: int) -> List[Vehicle]:
    """
    Clears all existing demo vehicles and historical records for user, then re-seeds cleanly.
    """
    demo_vehicles = db.query(Vehicle).filter(Vehicle.user_id == user_id, Vehicle.is_demo == True).all()
    for v in demo_vehicles:
        db.delete(v)
    db.commit()

    return seed_sample_ev_datasets(db, user_id)
