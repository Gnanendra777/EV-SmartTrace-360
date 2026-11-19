import sys
import os
import asyncio
import httpx

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../backend")))

from app.main import app as target_app, seed_initial_data

async def run_tests():
    seed_initial_data()
    transport = httpx.ASGITransport(app=target_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        print("Testing root endpoint...")
        r = await client.get("/")
        print("Root Status:", r.status_code, "Platform:", r.json()["platform"])

        print("Testing Login...")
        login_res = await client.post("/api/auth/login", json={
            "email": "demo@evsmarttrace.com",
            "password": "DemoPassword123!"
        })
        print("Login Status:", login_res.status_code)
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        data = login_res.json()
        token = data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        print("Testing Vehicles List...")
        v_res = await client.get("/api/vehicles", headers=headers)
        print("Vehicles Status:", v_res.status_code, "Count:", len(v_res.json()))
        vehicle_id = v_res.json()[0]["id"]

        print("Testing Dashboard...")
        dash_res = await client.get(f"/api/dashboard/{vehicle_id}", headers=headers)
        print("Dashboard Status:", dash_res.status_code)
        dash = dash_res.json()
        print(f"Vehicle: {dash['vehicle']['vehicle_name']}, SOC: {dash['latest_battery']['soc']}%, Range: {dash['estimated_range_km']} km")

        print("Testing AI Range Prediction...")
        range_res = await client.get(f"/api/battery/{vehicle_id}/range-prediction?speed_kmh=80&ambient_temp_c=25&ac_on=1", headers=headers)
        print("Range Prediction Status:", range_res.status_code, "Pred Range:", range_res.json()["predicted_range_km"])

        print("Testing Diagnostics Scan...")
        diag_res = await client.post("/api/diagnostics/scan", json={"vehicle_id": vehicle_id}, headers=headers)
        print("Diagnostics Scan Status:", diag_res.status_code, "Score:", diag_res.json()["health_score"])

        print("Testing Charging Estimate...")
        charge_res = await client.get(f"/api/charging/{vehicle_id}/estimate?target_soc=80&charging_power_kw=150", headers=headers)
        print("Charging Estimate Status:", charge_res.status_code, "Duration:", charge_res.json()["estimated_duration_formatted"])

        print("Testing Route Optimization...")
        route_res = await client.post("/api/routes/optimize", json={
            "vehicle_id": vehicle_id,
            "origin": "San Francisco",
            "destination": "San Jose",
            "current_battery_pct": 70,
            "desired_arrival_pct": 15
        }, headers=headers)
        print("Route Optimization Status:", route_res.status_code, "Routes count:", len(route_res.json()["routes"]))

        # --- 360 DEGREE DIGITAL TWIN & VEHICLE TELEMETRY TESTS ---
        print("\n--- Testing 360° Vehicle Digital Twin Endpoints ---")
        
        print("1. Vehicle Full Health...")
        health_res = await client.get(f"/api/vehicles/{vehicle_id}/health", headers=headers)
        assert health_res.status_code == 200, f"Health check failed: {health_res.text}"
        health_data = health_res.json()
        print(f"   Vehicle: {health_data['vehicle_name']}, Health Score: {health_data['health_score']}/100, Components: {len(health_data['components'])}")
        
        print("2. Tyre Pressure Monitoring System (TPMS)...")
        tyre_res = await client.get(f"/api/vehicles/{vehicle_id}/tyres", headers=headers)
        assert tyre_res.status_code == 200
        tyre_data = tyre_res.json()
        print(f"   FL: {tyre_data['fl']['psi']} PSI, FR: {tyre_data['fr']['psi']} PSI, Status: {tyre_data['tpms_status']}")

        print("3. Doors & Latches Status...")
        door_res = await client.get(f"/api/vehicles/{vehicle_id}/doors", headers=headers)
        assert door_res.status_code == 200
        door_data = door_res.json()
        print(f"   Doors Locked: {door_data['locked']}, Safe To Operate: {door_data['safe_to_operate']}")

        print("4. Seatbelts & Occupancy Monitoring...")
        seat_res = await client.get(f"/api/vehicles/{vehicle_id}/seatbelts", headers=headers)
        assert seat_res.status_code == 200
        seat_data = seat_res.json()
        print(f"   Driver Fastened: {seat_data['driver']['fastened']}, Warnings: {seat_data['warnings_active']}")

        print("5. Cabin Climate Control...")
        clim_res = await client.get(f"/api/vehicles/{vehicle_id}/climate", headers=headers)
        assert clim_res.status_code == 200
        clim_data = clim_res.json()
        print(f"   Power: {clim_data['power']}, Target Temp: {clim_data['target_temp_c']}°C, Fan: {clim_data['fan_speed']}")

        print("6. Vehicle Capabilities...")
        cap_res = await client.get(f"/api/vehicles/{vehicle_id}/capabilities", headers=headers)
        assert cap_res.status_code == 200
        print(f"   Digital Twin Supported: {cap_res.json()['digital_twin_360_supported']}")

        print("\n--- Testing Command Execution & Safety Interlocks ---")
        print("7. Valid Climate Command (Set Temp to 21°C)...")
        cmd_res = await client.post(f"/api/vehicles/{vehicle_id}/commands", json={
            "command": "set_temperature",
            "parameters": {"temperature": 21.0}
        }, headers=headers)
        assert cmd_res.status_code == 200
        assert cmd_res.json()["status"] == "executed"
        print(f"   Status: {cmd_res.json()['status']}, Message: {cmd_res.json()['message']}")

        print("8. Prohibited Steering / Acceleration Command (Safety Interlock)...")
        steer_cmd = await client.post(f"/api/vehicles/{vehicle_id}/commands", json={
            "command": "steer_left",
            "parameters": {"angle": 30}
        }, headers=headers)
        assert steer_cmd.status_code == 200
        assert steer_cmd.json()["status"] == "safety_blocked"
        print(f"   Interlock Response: {steer_cmd.json()['status']} -> {steer_cmd.json()['message'][:70]}...")

        print("9. Prohibited Braking Command (Safety Interlock)...")
        brake_cmd = await client.post(f"/api/vehicles/{vehicle_id}/commands", json={
            "command": "apply_emergency_brake"
        }, headers=headers)
        assert brake_cmd.status_code == 200
        assert brake_cmd.json()["status"] == "safety_blocked"
        print(f"   Interlock Response: {brake_cmd.json()['status']} -> {brake_cmd.json()['message'][:70]}...")

        print("\n--- Testing Advanced SmartVoice Multilingual & Vehicle Voice Control ---")
        print("10. SmartVoice Voice Command: Turn on AC (English)...")
        voice_ac = await client.post("/api/assistant/chat", json={
            "vehicle_id": vehicle_id,
            "message": "Hey SmartVoice, turn on the AC",
            "language": "en"
        }, headers=headers)
        assert voice_ac.status_code == 200
        assert voice_ac.json()["intent"] == "climate_ac_on"
        print(f"    Intent: {voice_ac.json()['intent']}, Response: {voice_ac.json()['response_text']}")

        print("11. SmartVoice Voice Command: Turn on AC (Telugu - తెలుగు)...")
        voice_te = await client.post("/api/assistant/chat", json={
            "vehicle_id": vehicle_id,
            "message": "AC ఆన్ చేయండి",
            "language": "te"
        }, headers=headers)
        assert voice_te.status_code == 200
        assert voice_te.json()["intent"] == "climate_ac_on"
        print(f"    Telugu Intent: {voice_te.json()['intent']}, Response: {voice_te.json()['response_text']}")

        print("12. SmartVoice Voice Command: Check tyre pressure (English)...")
        voice_tpms = await client.post("/api/assistant/chat", json={
            "vehicle_id": vehicle_id,
            "message": "What is my tyre pressure?",
            "language": "en"
        }, headers=headers)
        assert voice_tpms.status_code == 200
        assert voice_tpms.json()["intent"] == "tpms_query"
        print(f"    TPMS Intent: {voice_tpms.json()['intent']}, Response: {voice_tpms.json()['response_text'][:70]}...")

        print("13. SmartVoice Voice Command: Check tyre pressure (Telugu - తెలుగు)...")
        voice_tpms_te = await client.post("/api/assistant/chat", json={
            "vehicle_id": vehicle_id,
            "message": "టైర్ ప్రెజర్ ఎంత?",
            "language": "te"
        }, headers=headers)
        assert voice_tpms_te.status_code == 200
        assert voice_tpms_te.json()["intent"] == "tpms_query"
        print(f"    TPMS Telugu Intent: {voice_tpms_te.json()['intent']}, Response: {voice_tpms_te.json()['response_text']}")

        print("14. SmartVoice Voice Safety Interlock Rejection...")
        voice_safety = await client.post("/api/assistant/chat", json={
            "vehicle_id": vehicle_id,
            "message": "Accelerate to 100 km/h and steer right",
            "language": "en"
        }, headers=headers)
        assert voice_safety.status_code == 200
        assert voice_safety.json()["intent"] == "safety_interlock_blocked"
        print(f"    Safety Intent: {voice_safety.json()['intent']}, Response: {voice_safety.json()['response_text']}")

        print("15. Command Audit History...")
        hist_res = await client.get(f"/api/vehicles/{vehicle_id}/commands/history", headers=headers)
        assert hist_res.status_code == 200
        history_list = hist_res.json()
        print(f"    Logged Commands count: {len(history_list)}")
        assert len(history_list) >= 3

        print("\n=======================================================")
        print("ALL BACKEND 360° DIGITAL TWIN & SMARTVOICE TESTS PASSED!")
        print("=======================================================")

if __name__ == "__main__":
    asyncio.run(run_tests())
