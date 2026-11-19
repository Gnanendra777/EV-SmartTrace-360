# EV SMARTTRACE 360
> **Tagline:** Drive Smart. Charge Smart. Travel Safe.

An enterprise-grade, full-stack, AI-powered Electric Vehicle Intelligence and Fleet Management Platform. EV SmartTrace 360 acts as a centralized intelligent automotive co-pilot that monitors battery health, analyzes energy economics, predicts driving range with Random Forest ML, diagnoses vehicle trouble codes with Isolation Forest, locates verified charging facilities, computes optimized travel corridors, and interacts with drivers via an intelligent voice assistant in **English** and **Telugu (తెలుగు)**.

---

## ⚡ Key Highlights & Capabilities

- 🔋 **Advanced Battery Intelligence**: Real-time State of Charge (SOC), State of Health (SOH), pack voltage, cell imbalance tracking, and Random Forest range predictions with 95% confidence intervals.
- 🚗 **3 Persistent Sample EV Datasets**:
  1. **City EV**: 40 kWh battery, 70% SOC, 96% SOH, 0.14 kWh/km consumption, 29°C pack temp, ~200 km range.
  2. **Long Range EV**: 75 kWh battery, 85% SOC, 98% SOH, 0.16 kWh/km consumption, 31°C pack temp, ~398 km range.
  3. **Performance EV**: 60 kWh battery, 45% SOC, 91% SOH, 0.19 kWh/km consumption, 34°C pack temp, ~142 km range.
- ⚡ **Smart Charging & Energy Analytics**: Metered charging duration, CC-CV taper curve modeling, electricity tariff calculations, and Isolation Forest anomaly detection for abnormal consumption spikes.
- 🛡️ **Interactive 360° Vehicle Health Scanner**: Autonomous sensor sweep monitoring traction motor stator temperatures, battery pack delta, inverter coolant flow (P0A93), and auxiliary 12V DC-DC health. Generates complete AI Health Reports.
- 📍 **Live EV Map & Charging Station Discovery**: Leaflet map with verified station pins, browser Geolocation API ("Locate Me"), radius filtering (5 km, 10 km, 25 km, 50 km), connector filters (CCS2, Type 2, CHAdeMO), and Google Maps routing.
- 🧭 **Intelligent EV Route Optimizer**: Evaluates departure SOC and arrival safety buffers to compute:
  1. *Fastest Highway Route*
  2. *Lowest Energy Eco Route* (saves 14–18% energy)
  3. *Recommended Balanced Route* (with automated fast charging stops inserted).
- 🎙️ **Smarter EV SmartVoice Cockpit Assistant**: Siri-style voice interface with speech recognition (Web Speech API), speech synthesis (TTS), text chat fallback, personalized greetings, and native support for **English** and **Telugu (తెలుగు)**.
- 🌌 **Demo Mode Lighting Effect**: Switches to a sleek cyan/green ambient aurora glow with audio announcement *"Demo mode on and enjoy the ride."* and toast notification.
- 👤 **Complete Full-Screen Profile & Fleet Manager**: Two distinct sections for Account Details (name, email, phone, creation date, account type) and Registered Vehicles (nickname, specs, connector, edit & remove with confirmation dialogs).
- 📊 **Reports & Exporting**: Audit statements, carbon emission savings, and one-click CSV & printable PDF reports.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Recharts, Leaflet, Axios |
| **Backend** | Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy ORM, Alembic, WebSockets, JWT, Bcrypt |
| **Database** | MySQL 8.0+ / SQLite auto-fallback, normalized schema with indexing and cascading foreign keys |
| **AI / ML** | Scikit-learn (RandomForestRegressor, IsolationForest), Pandas, NumPy, Joblib |
| **Assistant** | Web Speech API, SpeechSynthesis, contextual natural language reasoning |
| **Deployment** | Vercel (Frontend & Serverless FastAPI via `pyproject.toml`), Render/Railway (Backend & MySQL) |

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js** (v18+ or v20+)
- **Python** (3.11+ or 3.12+)
- **MySQL 8.0+** (optional; SQLite fallback runs automatically out-of-the-box)

### 2. Backend Setup
```bash
cd backend

# Install Python requirements
pip install -r requirements.txt

# Start the FastAPI server (auto-creates tables and seeds 3 sample EV profiles)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
- API Base URL: `http://localhost:8000/api`
- Interactive Swagger Docs: `http://localhost:8000/docs`

### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```
- Application Web UI: `http://localhost:5173`

---

## 🔑 Demo & Account Access

| Mode | Credentials |
|---|---|
| **Quick Demo** | Click **"Quick Demo"** on the Login page (`demo@evsmarttrace.com` / `DemoPassword123!`) |
| **Custom Demo** | Click **"Custom Demo"** on the Login page to enter any display name & email for an isolated session |
| **New Account** | Click **"Register"** to create a secure personal account with optional phone number |

---

## 🌐 Vercel & Production Deployment

### 1. Vercel Configuration
The repository includes root configuration files for Vercel deployment:
- `pyproject.toml`: Defines the FastAPI entrypoint:
  ```toml
  [tool.vercel]
  entrypoint = "backend.app.main:app"
  ```
- `vercel.json`: Directs the frontend build and rewrites `/api/*`, `/docs`, and `/openapi.json` to the FastAPI backend while serving the SPA for client routes.
- `requirements.txt`: Root Python dependencies for the Vercel Python runtime.

### 2. Environment Variables
Copy `.env.example` to `.env`:
- `DATABASE_URL`: Production MySQL connection string (e.g. `mysql+pymysql://user:pass@host:3306/dbname`).
- `JWT_SECRET_KEY`: Secret string for signing auth tokens (minimum 32 characters).
- `GEMINI_API_KEY`: (Optional) Google Gemini API key for external LLM reasoning.
- `VITE_API_BASE_URL`: (Optional) Backend API URL if hosting frontend and backend on separate domains. When deployed on the same Vercel domain, it defaults to `/api`.

---

## 📁 Project Structure

```
ev-smart/
├── frontend/             # React + Vite + TypeScript dashboard
│   ├── src/
│   │   ├── components/   # Navbar, SmartVoice modal, Diagnostic scanner, Interactive map
│   │   ├── pages/        # Dashboard, Battery, Energy, Diagnostics, Stations, Navigation, Voice, Profile
│   │   ├── context/      # AuthContext & fleet state
│   │   ├── services/     # Axios API layer with offline mock resilience
│   │   └── types/        # TypeScript data models
│   ├── package.json
│   └── vite.config.ts
├── backend/              # FastAPI Python backend
│   ├── app/
│   │   ├── main.py       # App entrypoint & auto-seeding
│   │   ├── config.py     # Environment configuration
│   │   ├── database.py   # SQLAlchemy engine with MySQL/SQLite fallback
│   │   ├── models/       # Relational models (users, vehicles, diagnostics, routes)
│   │   ├── routers/      # REST API router endpoints
│   │   ├── services/     # Telemetry simulation, route optimizer, SmartVoice
│   │   └── security/     # JWT authentication & password hashing
│   ├── requirements.txt
│   └── test_endpoints.py # Automated endpoint verification suite
├── pyproject.toml        # Root Vercel FastAPI entrypoint configuration
├── vercel.json           # Vercel build and routing configuration
├── requirements.txt      # Root Python dependency manifest
└── .env.example          # Environment variable template
```

---

## 🛡️ License
Designed and developed for EV SmartTrace 360.
All vehicle diagnostic trouble codes comply with SAE J2012 / ISO 15031 OBD standards.
