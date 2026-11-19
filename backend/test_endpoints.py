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

        # --- 360 DEGREE DIGITAL TWIN & VEHICLE TELEMETRY TESTS ---
        print("\n--- Testing 360° Vehicle Digital Twin Endpoints ---")
        health_res = await client.get(f"/api/vehicles/{vehicle_id}/health", headers=headers)
        assert health_res.status_code == 200
        tyre_res = await client.get(f"/api/vehicles/{vehicle_id}/tyres", headers=headers)
        assert tyre_res.status_code == 200
        door_res = await client.get(f"/api/vehicles/{vehicle_id}/doors", headers=headers)
        assert door_res.status_code == 200
        seat_res = await client.get(f"/api/vehicles/{vehicle_id}/seatbelts", headers=headers)
        assert seat_res.status_code == 200
        clim_res = await client.get(f"/api/vehicles/{vehicle_id}/climate", headers=headers)
        assert clim_res.status_code == 200

        print("\n--- Testing 15 Individual Sample Cockpit Queries in SmartVoice ---")

        # 1. Hello
        q1 = await client.post("/api/assistant/chat", json={"vehicle_id": vehicle_id, "message": "Hello", "language": "en"}, headers=headers)
        assert q1.status_code == 200
        assert "Hello! Have a nice day. Welcome to EV SmartTrace 360. Do you need any help with your car today?" in q1.json()["response_text"]
        print("1. 'Hello' -> PASS:", q1.json()["response_text"][:50])

        # 2. What is my battery percentage?
        q2 = await client.post("/api/assistant/chat", json={"vehicle_id": vehicle_id, "message": "What is my battery percentage?", "language": "en"}, headers=headers)
        assert q2.status_code == 200
        assert "Your current battery charge is" in q2.json()["response_text"]
        print("2. 'What is my battery percentage?' -> PASS:", q2.json()["response_text"])

        # 3. What is my battery health?
        q3 = await client.post("/api/assistant/chat", json={"vehicle_id": vehicle_id, "message": "What is my battery health?", "language": "en"}, headers=headers)
        assert q3.status_code == 200
        assert "Your battery health is currently" in q3.json()["response_text"]
        print("3. 'What is my battery health?' -> PASS:", q3.json()["response_text"])

        # 4. What is the battery temperature?
        q4 = await client.post("/api/assistant/chat", json={"vehicle_id": vehicle_id, "message": "What is the battery temperature?", "language": "en"}, headers=headers)
        assert q4.status_code == 200
        assert "Your battery temperature is currently" in q4.json()["response_text"]
        print("4. 'What is the battery temperature?' -> PASS:", q4.json()["response_text"])

        # 5. How much range is remaining?
        q5 = await client.post("/api/assistant/chat", json={"vehicle_id": vehicle_id, "message": "How much range is remaining?", "language": "en"}, headers=headers)
        assert q5.status_code == 200
        assert "Your estimated remaining driving range is" in q5.json()["response_text"]
        print("5. 'How much range is remaining?' -> PASS:", q5.json()["response_text"])

        # 6. Explain my battery degradation trend.
        q6 = await client.post("/api/assistant/chat", json={"vehicle_id": vehicle_id, "message": "Explain my battery degradation trend.", "language": "en"}, headers=headers)
        assert q6.status_code == 200
        assert "battery degradation trend is currently stable" in q6.json()["response_text"]
        print("6. 'Explain my battery degradation trend.' -> PASS:", q6.json()["response_text"][:60])

        # 7. What is my average energy consumption?
        q7 = await client.post("/api/assistant/chat", json={"vehicle_id": vehicle_id, "message": "What is my average energy consumption?", "language": "en"}, headers=headers)
        assert q7.status_code == 200
        assert "Your average energy consumption is" in q7.json()["response_text"]
        print("7. 'What is my average energy consumption?' -> PASS:", q7.json()["response_text"][:60])

        # 8. How long will charging take?
        q8 = await client.post("/api/assistant/chat", json={"vehicle_id": vehicle_id, "message": "How long will charging take?", "language": "en"}, headers=headers)
        assert q8.status_code == 200
        assert ("Charging from" in q8.json()["response_text"] or "already meets the 80" in q8.json()["response_text"])
        print("8. 'How long will charging take?' -> PASS:", q8.json()["response_text"][:60])

        # 9. What is my estimated charging cost?
        q9 = await client.post("/api/assistant/chat", json={"vehicle_id": vehicle_id, "message": "What is my estimated charging cost?", "language": "en"}, headers=headers)
        assert q9.status_code == 200
        assert "Estimated cost is" in q9.json()["response_text"]
        print("9. 'What is my estimated charging cost?' -> PASS:", q9.json()["response_text"][:60])

        # 10. Which connector does my vehicle support?
        q10 = await client.post("/api/assistant/chat", json={"vehicle_id": vehicle_id, "message": "Which connector does my vehicle support?", "language": "en"}, headers=headers)
        assert q10.status_code == 200
        assert "supports" in q10.json()["response_text"]
        print("10. 'Which connector does my vehicle support?' -> PASS:", q10.json()["response_text"][:60])

        # 11. Find nearby charging stations.
        q11 = await client.post("/api/assistant/chat", json={"vehicle_id": vehicle_id, "message": "Find nearby charging stations.", "language": "en"}, headers=headers)
        assert q11.status_code == 200
        assert ("charging stations" in q11.json()["response_text"])
        print("11. 'Find nearby charging stations.' -> PASS:", q11.json()["response_text"][:60])

        # 12. Is my vehicle healthy?
        q12 = await client.post("/api/assistant/chat", json={"vehicle_id": vehicle_id, "message": "Is my vehicle healthy?", "language": "en"}, headers=headers)
        assert q12.status_code == 200
        assert "Subsystem Health Summary" in q12.json()["response_text"]
        print("12. 'Is my vehicle healthy?' -> PASS:", q12.json()["response_text"][:60])

        # 13. Calculate a route to my destination.
        q13 = await client.post("/api/assistant/chat", json={"vehicle_id": vehicle_id, "message": "Calculate a route to my destination.", "language": "en"}, headers=headers)
        assert q13.status_code == 200
        assert "Please specify your destination address or city" in q13.json()["response_text"]
        print("13. 'Calculate a route to my destination.' -> PASS:", q13.json()["response_text"][:60])

        # 14. Which route consumes less energy?
        q14 = await client.post("/api/assistant/chat", json={"vehicle_id": vehicle_id, "message": "Which route consumes less energy?", "language": "en"}, headers=headers)
        assert q14.status_code == 200
        assert "The Lowest Energy Eco Route consumes approximately 14% to 18% less energy" in q14.json()["response_text"]
        print("14. 'Which route consumes less energy?' -> PASS:", q14.json()["response_text"][:60])

        # 15. Enable Demo Mode.
        q15 = await client.post("/api/assistant/chat", json={"vehicle_id": vehicle_id, "message": "Enable Demo Mode.", "language": "en"}, headers=headers)
        assert q15.status_code == 200
        assert "Demo mode on and enjoy the ride" in q15.json()["response_text"]
        print("15. 'Enable Demo Mode.' -> PASS:", q15.json()["response_text"][:60])

        print("\n--- Testing Strict Multilingual Support (Telugu & Hindi) ---")
        # Telugu test
        q_te = await client.post("/api/assistant/chat", json={"vehicle_id": vehicle_id, "message": "What is my battery percentage?", "language": "te"}, headers=headers)
        assert q_te.status_code == 200
        assert "మీ ప్రస్తుత బ్యాటరీ ఛార్జ్" in q_te.json()["response_text"]
        print("Telugu SOC -> PASS:", q_te.json()["response_text"])

        # Hindi test
        q_hi = await client.post("/api/assistant/chat", json={"vehicle_id": vehicle_id, "message": "What is my battery percentage?", "language": "hi"}, headers=headers)
        assert q_hi.status_code == 200
        assert "आपकी वर्तमान बैटरी चार्ज" in q_hi.json()["response_text"]
        print("Hindi SOC -> PASS:", q_hi.json()["response_text"])

        print("\n--- Testing Unsupported Questions Fallback ---")
        # Non-EV question
        q_unsupported = await client.post("/api/assistant/chat", json={"vehicle_id": vehicle_id, "message": "What is the capital of France?", "language": "en"}, headers=headers)
        assert q_unsupported.status_code == 200
        assert "Sorry, I can currently assist with the EV SmartTrace 360 cockpit queries only. Please select one of the Sample Cockpit Queries to continue." in q_unsupported.json()["response_text"]
        print("Unsupported Query -> PASS:", q_unsupported.json()["response_text"])

        print("\n--- Testing Open Charge Map & Smart Navigation Endpoints ---")
        # 1. Nearby charging stations with real coordinates
        stations_res = await client.get("/api/stations/nearby?lat=28.6139&lng=77.2090&distance_km=25")
        assert stations_res.status_code == 200
        st_data = stations_res.json()
        assert len(st_data) > 0
        print(f"Nearby Stations -> PASS: Retrieved {len(st_data)} stations. First: {st_data[0]['station_name']} ({st_data[0]['distance_km']} km)")

        # 2. Station search
        st_search = await client.get("/api/stations/search?query=hub&latitude=28.6139&longitude=77.2090")
        assert st_search.status_code == 200
        print(f"Station Search -> PASS: Found {len(st_search.json())} matching stations")

        # 3. Destination geocoding
        geo_res = await client.get("/api/routes/geocode?query=Delhi")
        assert geo_res.status_code == 200
        print(f"Destination Geocode -> PASS: Returned {len(geo_res.json())} results")

        # 4. Smart EV Route Calculation (OSRM + Battery consumption)
        route_calc = await client.post("/api/routes/calculate", json={
            "origin_lat": 28.6139,
            "origin_lng": 77.2090,
            "destination_lat": 28.4595,
            "destination_lng": 77.0266,
            "origin_name": "New Delhi Central",
            "destination_name": "Gurugram Cyber Hub",
            "vehicle_id": vehicle_id,
            "current_battery_pct": 70.0,
            "desired_arrival_pct": 15.0
        }, headers=headers)
        assert route_calc.status_code == 200
        route_data = route_calc.json()
        assert route_data["distance_km"] > 0
        assert len(route_data["geometry"]) > 0
        print(f"Smart EV Route Calculate -> PASS: Distance: {route_data['distance_km']} km, Duration: {route_data['duration_formatted']}, Arrival SOC: {route_data['estimated_arrival_soc']}%, Stops Found: {len(route_data['recommended_charging_stops'])}")

        print("\n=======================================================")
        print("ALL SMARTVOICE COCKPIT QUERIES AND MULTILINGUAL TESTS PASSED!")
        print("ALL CHARGING STATIONS & SMART NAVIGATION TESTS PASSED!")
        print("=======================================================")

if __name__ == "__main__":
    asyncio.run(run_tests())
