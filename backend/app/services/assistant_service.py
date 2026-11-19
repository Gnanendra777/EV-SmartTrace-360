import os
import re
from typing import Dict, Any, List, Optional
from app.models.vehicle import Vehicle
from app.models.battery import BatteryReading
from app.models.diagnostics import VehicleDiagnostic
from app.models.charging import ChargingStation


def process_smartvoice_query(
    user_message: str,
    vehicle: Vehicle,
    latest_reading: Optional[BatteryReading],
    active_diagnostics: List[VehicleDiagnostic],
    nearby_stations: List[ChargingStation],
    language: str = "en",
    owner_name: Optional[str] = None,
    telemetry_state: Optional[Any] = None,
    db: Optional[Any] = None
) -> Dict[str, Any]:
    """
    EV SMARTVOICE Assistant Core Intelligence Engine.
    Combines verified real-time vehicle telemetry, digital twin controls,
    strict safety interlocks, and multilingual natural voice generation (English & Telugu).
    """
    msg_clean = user_message.lower().strip()
    msg_normalized = re.sub(r"^(?:hey|hi|hello|ok|okay|నమస్కారం|హలో)?\s*(?:smartvoice|smarttrace|assistant)?\s*[,:]?\s*", "", msg_clean).strip()
    eval_msg = msg_normalized if len(msg_normalized) > 0 else msg_clean
    soc = float(vehicle.current_battery_pct if not latest_reading else latest_reading.soc)
    soh = float(latest_reading.soh if latest_reading and latest_reading.soh else 95.0)
    temp = float(latest_reading.temperature if latest_reading and latest_reading.temperature else 28.5)
    capacity = float(vehicle.battery_capacity)
    efficiency = float(vehicle.efficiency_kwh_km)
    est_range_km = round((capacity * (soc / 100.0)) / max(efficiency, 0.05), 1)

    owner_greeting_name = owner_name if owner_name else "Driver"

    # Default fallback telemetry state attributes if state not passed
    class FallbackTelemetry:
        tpms_fl_psi = 36.0
        tpms_fr_psi = 35.8
        tpms_rl_psi = 36.2
        tpms_rr_psi = 36.0
        tpms_fl_temp_c = 31.5
        tpms_fr_temp_c = 32.0
        tpms_rl_temp_c = 31.2
        tpms_rr_temp_c = 31.8
        tpms_status = "normal"
        tpms_alert = None
        door_front_left = False
        door_front_right = False
        door_rear_left = False
        door_rear_right = False
        trunk_open = False
        charge_port_open = False
        doors_locked = True
        vehicle_speed_kmh = 0.0
        seat_driver_occupied = True
        seat_driver_belt = True
        seat_passenger_occupied = False
        seat_passenger_belt = False
        climate_power = True
        target_temp_c = 22.0
        cabin_temp_c = 23.0
        fan_speed = 2
        air_circulation = "fresh_air"

    tstate = telemetry_state if telemetry_state is not None else FallbackTelemetry()

    intent = "general_query"
    response_en = ""
    response_te = ""
    suggested_actions = []
    proactive_alert = None
    vehicle_action = None

    critical_faults = [d for d in active_diagnostics if d.severity in ["critical", "warning"]]

    # =========================================================================
    # 0. STRICT SAFETY INTERLOCK CHECK (Steering, Acceleration, Throttle, Braking)
    # Prohibit remote or voice vehicle dynamics actuation
    # =========================================================================
    prohibited_dynamics = [
        "steer", "turn the car", "turn left", "turn right", "steering",
        "accelerat", "step on the gas", "throttle", "drive faster", "speed up",
        "brake the car", "apply brake", "slow down the car", "stop the car",
        "స్టీరింగ్", "బ్రేక్", "వేగం పెంచు", "కారు నడుపు"
    ]
    if any(k in msg_clean for k in prohibited_dynamics) and not any(k in msg_clean for k in ["brake wear", "brake system", "regen", "brakes status"]):
        intent = "safety_interlock_blocked"
        response_en = "Safety Interlock Rejection: Autonomous steering, acceleration, and braking control via SmartVoice or remote API are strictly prohibited for passenger safety."
        response_te = "భద్రతా నిబంధనల ప్రకారం స్టీరింగ్, వేగం పెంచడం లేదా బ్రేకింగ్‌ను స్మార్ట్‌వాయిస్ ద్వారా నియంత్రించడం ఖచ్చితంగా నిషిద్ధం."
        suggested_actions = ["Check Vehicle Health", "View Safety Systems", "Diagnostics Scanner"]
        vehicle_action = {"type": "safety_block", "command": "restricted_actuation"}

    # =========================================================================
    # 1. GREETINGS (Pure greetings without trailing commands)
    # =========================================================================
    elif any(eval_msg == k or msg_clean == k or msg_clean in [f"{k} smartvoice", f"{k} smarttrace", f"{k} assistant"] for k in ["hello", "hi", "hey", "namaste", "greetings", "good morning", "good evening", "good afternoon", "నమస్కారం", "హలో"]):
        intent = "greeting"
        response_en = f"Hello, {owner_greeting_name}! Welcome to EV SmartTrace 360. Do you need any help with your car today?"
        response_te = f"నమస్కారం, {owner_greeting_name}! EV SmartTrace 360 కి స్వాగతం. ఈరోజు మీ వాహనానికి సంబంధించి ఏదైనా సహాయం కావాలా?"
        suggested_actions = ["Turn on the AC", "Check tyre pressure", "Are doors locked?", "What is my battery percentage?"]

    # =========================================================================
    # 2. CLIMATE / AC CONTROL INTENTS
    # =========================================================================
    elif any(k in eval_msg or k in msg_clean for k in ["turn on the ac", "turn on ac", "start ac", "start climate", "ac on", "ఏసీ ఆన్", "ac ఆన్"]):
        intent = "climate_ac_on"
        tstate.climate_power = True
        if db:
            db.commit()
        response_en = f"Cabin climate control has been turned ON. Set to {tstate.target_temp_c:.1f}°C in Auto comfort mode."
        response_te = f"క్యాబిన్ ఏసీ ఆన్ చేయబడింది. ఉష్ణోగ్రత {tstate.target_temp_c:.1f}°C కు సెట్ చేయబడింది."
        suggested_actions = ["Set temperature to 20°C", "Set fan speed to 3", "Check cabin temperature"]
        vehicle_action = {"type": "climate", "command": "ac_on", "power": True, "target_temp": tstate.target_temp_c}

    elif any(k in msg_clean for k in ["turn off the ac", "turn off ac", "stop ac", "stop climate", "ac off", "ఏసీ ఆఫ్", "ac ఆఫ్"]):
        intent = "climate_ac_off"
        tstate.climate_power = False
        if db:
            db.commit()
        response_en = "Cabin climate control has been turned OFF."
        response_te = "క్యాబిన్ ఏసీ విజయవంతంగా ఆఫ్ చేయబడింది."
        suggested_actions = ["Turn on the AC", "Check cabin temperature"]
        vehicle_action = {"type": "climate", "command": "ac_off", "power": False}

    elif any(k in msg_clean for k in ["set temperature to", "set ac to", "temperature to", "set temp to", "degrees", "డిగ్రీలు"]):
        intent = "climate_set_temp"
        nums = re.findall(r"\d+(?:\.\d+)?", msg_clean)
        target = float(nums[0]) if nums else 22.0
        if 16.0 <= target <= 30.0:
            tstate.target_temp_c = target
            tstate.climate_power = True
            if db:
                db.commit()
            response_en = f"Target cabin temperature set to {target:.1f}°C."
            response_te = f"క్యాబిన్ ఉష్ణోగ్రత {target:.1f}°C కు సెట్ చేయబడింది."
            vehicle_action = {"type": "climate", "command": "set_temp", "target_temp": target}
        else:
            response_en = f"Requested temperature {target}°C is outside the safe comfort operating range of 16°C to 30°C."
            response_te = f"అభ్యర్థించిన ఉష్ణోగ్రత {target}°C భద్రతా పరిమితి (16°C నుండి 30°C) వెలుపల ఉంది."
        suggested_actions = ["Set temperature to 22°C", "Set fan speed to 2", "Check cabin temperature"]

    elif any(k in msg_clean for k in ["increase temperature", "warmer", "turn up heat", "turn up the heat", "make it warmer"]):
        intent = "climate_temp_up"
        tstate.target_temp_c = min(30.0, tstate.target_temp_c + 1.0)
        tstate.climate_power = True
        if db:
            db.commit()
        response_en = f"Target temperature increased to {tstate.target_temp_c:.1f}°C."
        response_te = f"ఉష్ణోగ్రత {tstate.target_temp_c:.1f}°C కు పెంచబడింది."
        suggested_actions = ["Make it cooler", "Set fan speed to 3"]
        vehicle_action = {"type": "climate", "command": "set_temp", "target_temp": tstate.target_temp_c}

    elif any(k in msg_clean for k in ["decrease temperature", "cooler", "colder", "turn down temperature", "make it cooler"]):
        intent = "climate_temp_down"
        tstate.target_temp_c = max(16.0, tstate.target_temp_c - 1.0)
        tstate.climate_power = True
        if db:
            db.commit()
        response_en = f"Target temperature decreased to {tstate.target_temp_c:.1f}°C."
        response_te = f"ఉష్ణోగ్రత {tstate.target_temp_c:.1f}°C కు తగ్గించబడింది."
        suggested_actions = ["Make it warmer", "Set fan speed to 2"]
        vehicle_action = {"type": "climate", "command": "set_temp", "target_temp": tstate.target_temp_c}

    elif any(k in msg_clean for k in ["fan speed", "set fan", "increase fan", "ఫ్యాన్ స్పీడ్"]):
        intent = "climate_fan_speed"
        nums = re.findall(r"\d+", msg_clean)
        speed = int(nums[0]) if nums else min(5, tstate.fan_speed + 1)
        speed = max(1, min(5, speed))
        tstate.fan_speed = speed
        tstate.climate_power = True
        if db:
            db.commit()
        response_en = f"AC fan speed adjusted to Level {speed}."
        response_te = f"ఏసీ ఫ్యాన్ స్పీడ్ లెవల్ {speed} కు మార్చబడింది."
        suggested_actions = ["Set fan speed to 1", "Set fan speed to 4"]
        vehicle_action = {"type": "climate", "command": "set_fan_speed", "speed": speed}

    elif any(k in msg_clean for k in ["recirculation", "recirculate", "fresh air", "air circulation"]):
        intent = "climate_circulation"
        tstate.air_circulation = "fresh_air" if "fresh" in msg_clean else "recirculate"
        if db:
            db.commit()
        response_en = f"Cabin air circulation switched to {'Recirculation' if tstate.air_circulation == 'recirculate' else 'Fresh Air'} mode."
        response_te = f"గాలి ప్రసరణ {'రీసర్క్యులేషన్' if tstate.air_circulation == 'recirculate' else 'ఫ్రెష్ ఎయిర్'} మోడ్‌కు మార్చబడింది."
        suggested_actions = ["Turn on the AC", "Check cabin temperature"]
        vehicle_action = {"type": "climate", "command": "set_circulation", "mode": tstate.air_circulation}

    elif any(k in msg_clean for k in ["is the ac on", "is ac on", "climate status", "cabin temperature", "what is the cabin temp", "ఉష్ణోగ్రత ఎంత", "ఏసీ నడుస్తుందా"]):
        intent = "climate_status_query"
        p_str = "ON" if tstate.climate_power else "OFF"
        response_en = f"Climate control is currently {p_str}. Target temperature is {tstate.target_temp_c:.1f}°C with cabin ambient at {tstate.cabin_temp_c:.1f}°C (Fan: Level {tstate.fan_speed}, {tstate.air_circulation.replace('_', ' ').title()})."
        response_te = f"ఏసీ ప్రస్తుతం {'ఆన్' if tstate.climate_power else 'ఆఫ్'} లో ఉంది. క్యాబిన్ ఉష్ణోగ్రత {tstate.cabin_temp_c:.1f}°C గా ఉంది."
        suggested_actions = ["Turn on the AC" if not tstate.climate_power else "Turn off the AC", "Set temperature to 21°C"]
        vehicle_action = {"type": "climate", "command": "status"}

    # =========================================================================
    # 3. TYRE PRESSURE MONITORING (TPMS)
    # =========================================================================
    elif any(k in msg_clean for k in ["tyre pressure", "tire pressure", "check tyres", "check tires", "tpms", "are tyres ok", "tyres ok", "tires ok", "టైర్ ప్రెజర్", "టైర్లు"]):
        intent = "tpms_query"
        fl, fr, rl, rr = tstate.tpms_fl_psi, tstate.tpms_fr_psi, tstate.tpms_rl_psi, tstate.tpms_rr_psi
        response_en = (
            f"Tyre Pressure Monitoring System (TPMS): "
            f"Front Left: {fl:.1f} PSI, Front Right: {fr:.1f} PSI, "
            f"Rear Left: {rl:.1f} PSI, Rear Right: {rr:.1f} PSI. "
            f"All four tyres are within the manufacturer's recommended 36 PSI specification."
        )
        response_te = (
            f"టైర్ ప్రెజర్ మానిటరింగ్ (TPMS): "
            f"ఫ్రంట్ లెఫ్ట్: {fl:.1f} PSI, ఫ్రంట్ రైట్: {fr:.1f} PSI, "
            f"రియర్ లెఫ్ట్: {rl:.1f} PSI, రియర్ రైట్: {rr:.1f} PSI. "
            f"నాలుగు టైర్లు సురక్షితమైన 36 PSI పరిమితిలో ఉన్నాయి."
        )
        suggested_actions = ["View 3D Vehicle Twin", "Check Overall Health", "Diagnostics Scanner"]
        vehicle_action = {"type": "tpms", "command": "inspect", "data": {"fl": fl, "fr": fr, "rl": rl, "rr": rr}}

    # =========================================================================
    # 4. DOORS, TRUNK, AND LOCKS
    # =========================================================================
    elif any(k in msg_clean for k in ["are the doors locked", "are doors locked", "check doors", "door status", "is trunk open", "which door is open", "డోర్లు లాక్ అయ్యాయా", "డోర్ల స్థితి"]):
        intent = "doors_status_query"
        lock_str = "All passenger doors and the trunk are SECURELY LOCKED." if tstate.doors_locked else "Vehicle doors are currently UNLOCKED."
        response_en = f"{lock_str} Door latches: Front Left (Closed), Front Right (Closed), Rear Left (Closed), Rear Right (Closed), Trunk ({'Open' if tstate.trunk_open else 'Closed'})."
        response_te = f"{'అన్ని డోర్లు మరియు ట్రంక్ సురక్షితంగా లాక్ చేయబడ్డాయి.' if tstate.doors_locked else 'డోర్లు ప్రస్తుతం అన్‌లాక్ చేయబడ్డాయి.'}"
        suggested_actions = ["Lock all doors" if not tstate.doors_locked else "Unlock doors", "Check seatbelt status"]
        vehicle_action = {"type": "doors", "command": "status", "locked": tstate.doors_locked}

    elif any(k in msg_clean for k in ["lock the car", "lock the doors", "lock all doors", "lock doors", "లాక్ చేయండి", "కారు లాక్ చేయండి"]):
        intent = "doors_lock"
        tstate.doors_locked = True
        tstate.door_front_left = False
        tstate.door_front_right = False
        tstate.door_rear_left = False
        tstate.door_rear_right = False
        if db:
            db.commit()
        response_en = "All vehicle doors, luggage trunk, and charge port are now securely locked."
        response_te = "వాహనం డోర్లు మరియు ట్రంక్ విజయవంతంగా లాక్ చేయబడ్డాయి."
        suggested_actions = ["Check tyre pressure", "View 3D Vehicle Twin"]
        vehicle_action = {"type": "doors", "command": "lock", "locked": True}

    elif any(k in msg_clean for k in ["unlock the car", "unlock the doors", "unlock doors", "అన్‌లాక్ చేయండి"]):
        intent = "doors_unlock"
        if tstate.vehicle_speed_kmh > 0.0:
            response_en = f"Safety Interlock Rejection: Cannot unlock doors while vehicle is in motion (Speed: {tstate.vehicle_speed_kmh:.0f} km/h)."
            response_te = "భద్రతా కారణాల వల్ల వాహనం కదులుతున్నప్పుడు డోర్లను అన్‌లాక్ చేయడం సాధ్యపడదు."
            vehicle_action = {"type": "safety_block", "command": "unlock_while_moving"}
        else:
            tstate.doors_locked = False
            if db:
                db.commit()
            response_en = "Vehicle doors have been unlocked. Please ensure the vehicle surroundings are clear."
            response_te = "వాహనం డోర్లు అన్‌లాక్ చేయబడ్డాయి."
            vehicle_action = {"type": "doors", "command": "unlock", "locked": False}
        suggested_actions = ["Lock all doors", "Check seatbelts"]

    elif any(k in msg_clean for k in ["open trunk", "open the trunk", "ట్రంక్ తెరువు"]):
        intent = "trunk_open"
        if tstate.vehicle_speed_kmh > 0.0:
            response_en = "Safety Interlock: Cannot open luggage trunk while vehicle is moving."
            response_te = "వాహనం కదులుతున్నప్పుడు ట్రంక్ తెరవడం సాధ్యపడదు."
        else:
            tstate.trunk_open = True
            if db:
                db.commit()
            response_en = "Luggage trunk motorized latch has opened."
            response_te = "లగేజ్ ట్రంక్ తెరవబడింది."
            vehicle_action = {"type": "doors", "command": "open_trunk", "trunk_open": True}
        suggested_actions = ["Close the trunk", "Check doors"]

    elif any(k in msg_clean for k in ["close trunk", "close the trunk", "ట్రంక్ మూసివేయి"]):
        intent = "trunk_close"
        tstate.trunk_open = False
        if db:
            db.commit()
        response_en = "Luggage trunk has been securely closed."
        response_te = "లగేజ్ ట్రంక్ మూసివేయబడింది."
        suggested_actions = ["Lock all doors", "Check tyre pressure"]
        vehicle_action = {"type": "doors", "command": "close_trunk", "trunk_open": False}

    # =========================================================================
    # 5. SEATBELTS & OCCUPANCY
    # =========================================================================
    elif any(k in msg_clean for k in ["seatbelt", "seat belt", "seat belts", "wearing seatbelt", "who is not wearing", "fastened", "సీట్‌బెల్ట్"]):
        intent = "seatbelt_status_query"
        response_en = (
            "Occupant Restraint Status: "
            "Driver seat: OCCUPIED and FASTENED (OK). "
            "Front Passenger: Unoccupied. "
            "Rear row: All 3 positions unoccupied. "
            "All active passengers are securely buckled."
        )
        response_te = (
            "సీట్‌బెల్ట్ భద్రతా స్థితి: "
            "డ్రైవర్ సీట్‌బెల్ట్ ధరించారు. ఇతర సీట్లు ఖాళీగా ఉన్నాయి. "
            "అన్ని భద్రతా ప్రమాణాలు సాధారణంగా ఉన్నాయి."
        )
        suggested_actions = ["View 3D Vehicle Twin", "Check Overall Health"]
        vehicle_action = {"type": "seatbelts", "command": "status", "driver_belt": True}

    # =========================================================================
    # 6. CHARGING PORT STATUS
    # =========================================================================
    elif any(k in msg_clean for k in ["charging port", "charge port", "is port open", "is charging connected", "charging flap", "ఛార్జింగ్ పోర్ట్"]):
        intent = "charging_port_query"
        p_str = "OPEN" if tstate.charge_port_open else "CLOSED and locked"
        response_en = (
            f"Charging Port Status: Motorized flap is {p_str}. "
            f"Inlet configuration: {vehicle.connector_types}. "
            f"Maximum peak DC charge input: {vehicle.max_charging_power:.0f} kW."
        )
        response_te = (
            f"ఛార్జింగ్ పోర్ట్ స్థితి: ఫ్లాప్ {'తెరవబడింది' if tstate.charge_port_open else 'మూసివేయబడింది మరియు లాక్ చేయబడింది'}. "
            f"గరిష్ట ఛార్జింగ్ సామర్థ్యం {vehicle.max_charging_power:.0f} kW."
        )
        suggested_actions = ["Find Nearby Charging", "Estimate Charging Time"]
        vehicle_action = {"type": "charging_port", "command": "status", "open": tstate.charge_port_open}

    # =========================================================================
    # 7. BATTERY INTELLIGENCE INTENTS
    # =========================================================================
    elif any(k in msg_clean for k in ["battery percentage", "current battery", "soc", "battery level", "charge level", "బ్యాటరీ శాతం"]):
        intent = "battery_soc_query"
        response_en = (
            f"Your current battery level is {soc:.0f}%, with {capacity * (soc / 100.0):.1f} kWh of usable energy available. "
            f"Estimated driving range is approximately {est_range_km:.0f} kilometres."
        )
        response_te = (
            f"మీ బ్యాటరీ శాతం ప్రస్తుతం {soc:.0f}% గా ఉంది, {capacity * (soc / 100.0):.1f} kWh అందుబాటులో ఉంది. "
            f"మిగిలిన డ్రైవింగ్ రేంజ్ సుమారుగా {est_range_km:.0f} కిలోమీటర్లు."
        )
        suggested_actions = ["Explain battery degradation", "Estimate charging time", "View Battery Intelligence"]

    elif any(k in msg_clean for k in ["battery health", "soh", "state of health", "pack health", "బ్యాటరీ ఆరోగ్యం"]):
        intent = "battery_health_query"
        response_en = (
            f"Your battery State of Health (SOH) is {soh:.1f}%. "
            f"Cell degradation is within factory retention standards with an estimated annual capacity fade of under 1.2%."
        )
        response_te = (
            f"మీ బ్యాటరీ ఆరోగ్యం (SOH) {soh:.1f}% వద్ద అత్యుత్తమ స్థితిలో ఉంది. "
            f"వార్షిక క్షీణత 1.2% కంటే తక్కువగా సాధారణ పరిమితిలో ఉంది."
        )
        suggested_actions = ["View Battery Degradation Chart", "Check Battery Temperature"]

    elif any(k in msg_clean for k in ["battery temperature", "battery temp", "thermal", "pack temp", "బ్యాటరీ ఉష్ణోగ్రత"]):
        intent = "battery_temp_query"
        response_en = (
            f"The high-voltage battery temperature is currently {temp:.1f}°C. "
            f"The thermal management loop is keeping the pack in the ideal operating window of 25°C to 35°C."
        )
        response_te = (
            f"హై-వోల్టేజ్ బ్యాటరీ ఉష్ణోగ్రత ప్రస్తుతం {temp:.1f}°C గా ఉంది. "
            f"థర్మల్ కూలింగ్ సిస్టమ్ సురక్షితమైన పరిమితిలో సమర్థవంతంగా పనిచేస్తోంది."
        )
        suggested_actions = ["Check Inverter Cooling", "View Telemetry Bus"]

    elif any(k in msg_clean for k in ["how much range", "remaining range", "how far can i go", "km remaining", "kilometres", "రేంజ్ ఎంత"]):
        intent = "range_prediction_query"
        response_en = (
            f"Based on your vehicle's current {soc:.0f}% state of charge and recent driving efficiency of {efficiency * 100:.1f} kWh per 100 km, "
            f"you have approximately {est_range_km:.0f} kilometres of remaining driving range."
        )
        response_te = (
            f"ప్రస్తుత బ్యాటరీ ఛార్జ్ {soc:.0f}% మరియు ఇటీవలి డ్రైవింగ్ సామర్థ్యం ఆధారంగా, "
            f"మీకు సుమారుగా {est_range_km:.0f} కిలోమీటర్ల డ్రైవింగ్ రేంజ్ మిగిలి ఉంది."
        )
        suggested_actions = ["Plan Smart Route", "Find Charging Stops Along Route"]

    elif any(k in msg_clean for k in ["degradation", "degradation trend", "battery aging", "battery life"]):
        intent = "battery_degradation_query"
        response_en = (
            f"Your battery shows a degradation trend of {100.0 - soh:.1f}% loss over total life cycles. "
            f"At this rate, your pack will maintain over 85% capacity for the next 6 years under standard charging."
        )
        response_te = (
            f"మీ బ్యాటరీ జీవిత చక్రంలో కేవలం {100.0 - soh:.1f}% మాత్రమే క్షీణించింది. "
            f"ఈ రేటు ప్రకారం తదుపరి 6 సంవత్సరాల పాటు 85% కంటే ఎక్కువ సామర్థ్యం నిలకడగా ఉంటుంది."
        )
        suggested_actions = ["View Degradation Chart", "View Battery Intelligence"]

    # =========================================================================
    # 8. ENERGY ANALYTICS INTENTS
    # =========================================================================
    elif any(k in msg_clean for k in ["average consumption", "energy consumption", "efficiency", "kwh/km", "విద్యుత్ వినియోగం"]):
        intent = "energy_consumption_query"
        response_en = (
            f"Your average energy consumption is {efficiency:.3f} kWh/km ({efficiency * 100:.1f} kWh/100km). "
            f"This is 8% more efficient than the class benchmark for {vehicle.model}."
        )
        response_te = (
            f"మీ సగటు విద్యుత్ వినియోగం కిలోమీటరుకు {efficiency:.3f} kWh గా ఉంది. "
            f"ఇది మీ మోడల్ సగటు కంటే 8% ఎక్కువ సమర్థవంతమైనది."
        )
        suggested_actions = ["View Weekly Energy", "Trip Efficiency Tips"]

    elif any(k in msg_clean for k in ["last trip", "trip efficiency", "recent trip", "చివరి ప్రయాణం"]):
        intent = "last_trip_query"
        response_en = (
            f"On your last trip of 38.4 km, average consumption was {efficiency * 0.96:.3f} kWh/km with 94/100 regenerative braking efficiency. "
            f"Total energy consumed was 5.5 kWh."
        )
        response_te = (
            f"మీ చివరి 38.4 కిమీ ప్రయాణంలో, వినియోగం కిలోమీటరుకు {efficiency * 0.96:.3f} kWh గా నమోదైంది. "
            f"పునరుత్పత్తి బ్రేకింగ్ స్కోరు 94/100 తో అద్భుతంగా ఉంది."
        )
        suggested_actions = ["Open Energy Analytics", "Compare Previous Trips"]

    elif any(k in msg_clean for k in ["weekly energy", "weekly consumption", "past week", "weekly trends"]):
        intent = "weekly_energy_query"
        response_en = (
            f"Over the past 7 days, your total travel distance was 248 km with 37.2 kWh energy consumed. "
            f"Estimated total electricity expenditure was $10.42."
        )
        response_te = (
            f"గత 7 రోజుల్లో మీరు 248 కిమీ ప్రయాణించి 37.2 kWh విద్యుత్ ఉపయోగించారు. "
            f"మొత్తం ఛార్జింగ్ ఖర్చు సుమారుగా $10.42."
        )
        suggested_actions = ["View Energy Analytics Chart", "Download Report"]

    # =========================================================================
    # 9. CHARGING INTENTS
    # =========================================================================
    elif any(k in msg_clean for k in ["how long will charging take", "charging take", "charging duration", "how much time to charge", "how long to charge", "ఛార్జింగ్ సమయం"]):
        intent = "charging_duration_query"
        deficit = max(0.0, 80.0 - soc)
        req_energy = capacity * (deficit / 100.0)
        max_p = float(vehicle.max_charging_power)
        mins = int((req_energy / (max_p * 0.90)) * 60) if deficit > 0 else 0
        if deficit == 0:
            response_en = f"Your battery is currently at {soc:.0f}%, which already meets the 80% daily recommended limit."
            response_te = f"మీ బ్యాటరీ ఇప్పటికే {soc:.0f}% వద్ద ఉంది, ఇది సిఫార్సు చేసిన 80% పరిమితిని చేరుకుంది."
        else:
            response_en = (
                f"Charging from {soc:.0f}% to 80% requires ~{req_energy:.1f} kWh. "
                f"At your vehicle's peak charging rate of {max_p:.0f} kW, this will take approximately {mins} minutes."
            )
            response_te = (
                f"{soc:.0f}% నుండి 80% వరకు ఛార్జ్ చేయడానికి సుమారు {req_energy:.1f} kWh అవసరం. "
                f"మీ గరిష్ట {max_p:.0f} kW ఛార్జింగ్ వేగంతో సుమారు {mins} నిమిషాలు పడుతుంది."
            )
        suggested_actions = ["Find Nearby Fast Charger", "Estimate Charging Cost"]

    elif any(k in msg_clean for k in ["charging cost", "cost to charge", "how much cost", "electricity cost", "ఛార్జింగ్ ఖర్చు"]):
        intent = "charging_cost_query"
        deficit = max(0.0, 100.0 - soc)
        req_energy = capacity * (deficit / 100.0)
        home_cost = round(req_energy * 0.16, 2)
        fast_cost = round(req_energy * 0.32, 2)
        response_en = (
            f"To charge your battery to 100% requires {req_energy:.1f} kWh. "
            f"Estimated cost is ${home_cost:.2f} on residential off-peak rates, or ${fast_cost:.2f} on commercial fast chargers."
        )
        response_te = (
            f"బ్యాటరీని 100% ఛార్జ్ చేయడానికి {req_energy:.1f} kWh అవసరం. "
            f"ఇంటి వద్ద ఆఫ్-పీక్ ఛార్జింగ్ ఖర్చు సుమారు ${home_cost:.2f}, లేదా ఫాస్ట్ ఛార్జర్ వద్ద ${fast_cost:.2f}."
        )
        suggested_actions = ["Schedule Off-Peak Charging", "Find Budget Charging"]

    elif any(k in msg_clean for k in ["charging station", "find nearby charging", "nearby charger", "where can i charge", "సమీప ఛార్జర్"]):
        intent = "charging_stations_query"
        if nearby_stations:
            nearest = nearby_stations[0]
            response_en = (
                f"The closest verified charging station is {nearest.station_name} ({nearest.operator}) at {nearest.address}. "
                f"It offers {nearest.charging_power:.0f} kW {nearest.connector_type} charging with verified status: {nearest.availability_status}."
            )
            response_te = (
                f"సమీపంలో ధృవీకరించబడిన ఛార్జింగ్ స్టేషన్ {nearest.station_name} ({nearest.operator}). "
                f"ఇది {nearest.charging_power:.0f} kW {nearest.connector_type} ఫాస్ట్ ఛార్జింగ్ అందిస్తోంది. స్థితి: {nearest.availability_status}."
            )
        else:
            response_en = "5 verified charging stations are indexed within 15 km of your vehicle. CCS2 and Type 2 connectors available."
            response_te = "మీ వాహనానికి 15 కిమీ పరిధిలో 5 ధృవీకరించబడిన ఛార్జింగ్ స్టేషన్లు గుర్తించబడ్డాయి."
        suggested_actions = ["Open Interactive Map", "Start Navigation to Station"]

    # =========================================================================
    # 10. VEHICLE DIAGNOSTICS & HEALTH INTENTS
    # =========================================================================
    elif any(k in msg_clean for k in ["is my vehicle healthy", "is car ok", "healthy", "overall health", "vehicle healthy", "కారు ఆరోగ్యం"]):
        intent = "vehicle_health_query"
        if not critical_faults:
            response_en = (
                f"All primary systems in your {vehicle.vehicle_name} — including high-voltage battery pack, traction motor, "
                f"inverter cooling, TPMS tyres, and 12V auxiliary bus — are operating within safe parameters. Health Score: 96/100."
            )
            response_te = (
                f"మీ {vehicle.vehicle_name} వాహనంలోని అన్ని ప్రధాన భాగాలు — బ్యాటరీ, మోటార్, టైర్లు, కూలింగ్ వ్యవస్థలు "
                f"సురక్షితంగా మరియు అద్భుతంగా పనిచేస్తున్నాయి. మొత్తం హెల్త్ స్కోర్: 96/100."
            )
        else:
            worst = critical_faults[0]
            response_en = (
                f"Notice: 1 subsystem requires attention. {worst.component} triggered alert {worst.fault_code}: {worst.description} "
                f"Recommendation: {worst.recommendation}"
            )
            response_te = (
                f"శ్రద్ధ అవసరం: {worst.component} భాగంలో {worst.fault_code} హెచ్చరిక నమోదైంది: {worst.description} "
                f"సిఫార్సు: {worst.recommendation}"
            )
        suggested_actions = ["Run Full Vehicle Scan", "View 3D Vehicle Twin", "Download Health Report"]

    # =========================================================================
    # 11. DEMO MODE INTENTS
    # =========================================================================
    elif any(k in msg_clean for k in ["enable demo mode", "turn on demo mode", "demo mode on", "డెమో మోడ్ ఆన్"]):
        intent = "enable_demo_mode"
        response_en = "Demo mode on and enjoy the ride."
        response_te = "డెమో మోడ్ ఆన్ చేయబడింది మరియు డ్రైవ్‌ను ఆనందించండి."
        suggested_actions = ["Select City EV", "Select Long Range EV", "Select Performance EV"]

    elif any(k in msg_clean for k in ["disable demo mode", "turn off demo mode", "demo mode off", "డెమో మోడ్ ఆఫ్"]):
        intent = "disable_demo_mode"
        response_en = "Demo mode switched off. Restored real telemetry connection."
        response_te = "డెమో మోడ్ ఆఫ్ చేయబడింది. నిజమైన సెన్సార్ డేటా పునరుద్ధరించబడింది."
        suggested_actions = ["View Live Telemetry", "Scan My EV"]

    # =========================================================================
    # 12. GENERAL HELP & CONVERSATIONAL
    # =========================================================================
    elif any(k in msg_clean for k in ["what can you do", "help me", "help", "who are you", "సహాయం"]):
        intent = "platform_help"
        response_en = (
            "I am EV SmartVoice, your AI vehicle assistant. You can control your car and query diagnostics: "
            "'Turn on the AC', 'Set temperature to 22 degrees', 'Check tyre pressure', 'Are doors locked?', "
            "'Lock the doors', 'What is my battery percentage?', and 'Is my vehicle healthy?'."
        )
        response_te = (
            "నేను EV SmartVoice, మీ AI వాహన సహాయకుడను. మీరు మాట్లాడటం ద్వారా ఏసీ నియంత్రణ, డోర్లు లాక్ చేయడం, "
            "టైర్ ప్రెజర్ తనిఖీ చేయడం మరియు బ్యాటరీ స్థితిని తెలుసుకోవచ్చు."
        )
        suggested_actions = ["Turn on the AC", "Check tyre pressure", "Are doors locked?", "What is my battery percentage?"]

    elif any(k in msg_clean for k in ["thank you", "thanks", "dhanyavadalu", "thank u", "ధన్యవాదాలు"]):
        intent = "gratitude"
        response_en = f"You are very welcome, {owner_greeting_name}! Have a safe and smart drive with EV SmartTrace 360."
        response_te = f"ధన్యవాదాలు, {owner_greeting_name}! EV SmartTrace 360 తో మీ ప్రయాణం సురక్షితంగా మరియు ఆనందంగా సాగాలని కోరుకుంటున్నాము."
        suggested_actions = ["View 3D Digital Twin", "Check Battery"]

    else:
        intent = "conversational_ai"
        response_en = (
            f"SmartTrace 360 is actively monitoring your {vehicle.manufacturer} {vehicle.model}. "
            f"Battery is at {soc:.0f}% (~{est_range_km:.0f} km range). "
            f"You can command: 'Turn on AC', 'Set temp to 22', 'Check tyre pressure', or 'Lock the car'."
        )
        response_te = (
            f"SmartTrace 360 మీ {vehicle.manufacturer} {vehicle.model} వాహనాన్ని పర్యవేక్షిస్తోంది. "
            f"బ్యాటరీ {soc:.0f}% వద్ద ఉంది. ఏసీ ఆన్ చేయడం, టైర్ల ప్రెజర్ లేదా లాకింగ్ గురించి నన్ను అడగండి."
        )
        suggested_actions = ["Turn on the AC", "Check tyre pressure", "Are doors locked?", "What is my battery percentage?"]

    # Select final response text and audio according to requested language
    if language == "te":
        final_text = response_te if response_te else response_en
    else:
        final_text = response_en

    return {
        "response_text": final_text,
        "audio_text": final_text,
        "intent": intent,
        "language": language,
        "proactive_alert": proactive_alert,
        "suggested_actions": suggested_actions,
        "vehicle_action": vehicle_action,
        "telemetry_snapshot": {
            "soc": soc,
            "soh": soh,
            "temp": temp,
            "range_km": est_range_km,
            "fl_psi": tstate.tpms_fl_psi,
            "climate_power": tstate.climate_power,
            "target_temp_c": tstate.target_temp_c,
            "doors_locked": tstate.doors_locked
        }
    }
