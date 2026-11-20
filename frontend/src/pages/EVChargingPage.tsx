import React, { useState, useEffect, useRef } from 'react';
import { 
  Zap, 
  BatteryCharging, 
  Play, 
  Pause, 
  Square, 
  RotateCcw, 
  Sliders, 
  Clock, 
  DollarSign, 
  Gauge, 
  Info, 
  CheckCircle2, 
  AlertTriangle,
  History,
  TrendingUp,
  Cpu,
  ChevronRight,
  ShieldCheck,
  ZapOff
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { ChargingSession } from '../types';

export const EVChargingPage: React.FC = () => {
  const { activeVehicle, isDemoMode } = useAuth();

  // 1. Vehicle & Battery Configuration State
  const [batteryCapacityKwh, setBatteryCapacityKwh] = useState<number>(
    activeVehicle?.battery_capacity || 75.0
  );
  const [currentSoc, setCurrentSoc] = useState<number>(
    activeVehicle?.current_battery_pct || 42.0
  );
  const [initialSoc, setInitialSoc] = useState<number>(
    activeVehicle?.current_battery_pct || 42.0
  );
  const [targetSoc, setTargetSoc] = useState<number>(80.0);
  const [vehicleEfficiency, setVehicleEfficiency] = useState<number>(5.8); // km/kWh
  const [tariffPerKwh, setTariffPerKwh] = useState<number>(15.0); // ₹/kWh

  // 2. Charging Power & Station Settings
  const [chargingPowerKw, setChargingPowerKw] = useState<number>(
    activeVehicle?.max_charging_power || 50.0
  );
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(10); // 1x, 10x, 60x for demo sim

  // 3. Session Telemetry & State
  type ChargingStatus = 'idle' | 'charging' | 'paused' | 'completed';
  const [status, setStatus] = useState<ChargingStatus>('idle');
  const [energyDeliveredKwh, setEnergyDeliveredKwh] = useState<number>(0);
  const [sessionElapsedSeconds, setSessionElapsedSeconds] = useState<number>(0);
  const [sessionStartTime, setSessionStartTime] = useState<string | null>(null);

  // 4. Past Sessions History
  const [recentSessions, setRecentSessions] = useState<ChargingSession[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Timer reference for simulation loop
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load charging session history on mount
  useEffect(() => {
    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const vehicleId = activeVehicle?.id || 1;
        const sessions = await api.getChargingSessions(vehicleId);
        setRecentSessions(sessions);
      } catch (err) {
        console.warn('Could not load sessions history:', err);
      } finally {
        setIsLoadingHistory(false);
      }
    };
    fetchHistory();
  }, [activeVehicle]);

  // Derived Telemetry Values
  // Current voltage & amperage based on power level
  const voltage = chargingPowerKw > 100 ? 800 : chargingPowerKw > 22 ? 400 : 230; // Volts
  const currentAmps = status === 'charging' 
    ? Math.min(Math.round(((chargingPowerKw * 1000) / voltage) * 10) / 10, 500)
    : 0; // Amperes

  // Exact User Formulas:
  // 1. Charging Cost = Energy Consumed (kWh) × Electricity Tariff (₹/kWh)
  const totalChargingCost = Math.round(energyDeliveredKwh * tariffPerKwh * 100) / 100;

  // 2. Estimated Range = Available Battery Energy (kWh) × Vehicle Efficiency (km/kWh)
  const availableBatteryEnergyKwh = (currentSoc / 100) * batteryCapacityKwh;
  const estimatedAvailableRangeKm = Math.round(availableBatteryEnergyKwh * vehicleEfficiency * 10) / 10;

  // 3. Estimated Distance Added = Energy Delivered (kWh) × Vehicle Efficiency (km/kWh)
  const estimatedDistanceAddedKm = Math.round(energyDeliveredKwh * vehicleEfficiency * 10) / 10;

  // 4. Cost per km = Electricity Tariff (₹/kWh) ÷ Vehicle Efficiency (km/kWh)
  const costPerKm = vehicleEfficiency > 0 
    ? Math.round((tariffPerKwh / vehicleEfficiency) * 100) / 100 
    : 0;

  // Time remaining calculation to reach target SOC
  const remainingSoc = Math.max(0, targetSoc - currentSoc);
  const remainingEnergyNeededKwh = (remainingSoc / 100) * batteryCapacityKwh;
  const remainingHours = chargingPowerKw > 0 ? remainingEnergyNeededKwh / chargingPowerKw : 0;
  const remainingMinutesTotal = Math.round(remainingHours * 60);

  const formatRemainingTime = () => {
    if (status === 'completed' || currentSoc >= targetSoc) return 'Fully Charged';
    if (status === 'idle') {
      const hrs = Math.floor(remainingMinutesTotal / 60);
      const mins = remainingMinutesTotal % 60;
      return hrs > 0 ? `${hrs} hr ${mins} min` : `${mins} min`;
    }
    const hrs = Math.floor(remainingMinutesTotal / 60);
    const mins = remainingMinutesTotal % 60;
    return hrs > 0 ? `${hrs} hr ${mins > 0 ? `${mins} min` : ''}` : `${mins} min`;
  };

  // Format session elapsed time (HH:MM:SS)
  const formatElapsedTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
  };

  // Simulation loop when status === 'charging'
  useEffect(() => {
    if (status === 'charging') {
      if (!sessionStartTime) {
        setSessionStartTime(new Date().toISOString());
      }

      timerRef.current = setInterval(() => {
        setSessionElapsedSeconds((prev) => prev + 1);

        // Calculate energy increment for 1 real second with speedMultiplier
        // kWh delivered in 1 second = power_kw / 3600
        const kwhPerSecond = (chargingPowerKw / 3600) * speedMultiplier;

        setEnergyDeliveredKwh((prevEnergy) => {
          const nextEnergy = prevEnergy + kwhPerSecond;
          const addedSocPct = (kwhPerSecond / batteryCapacityKwh) * 100;

          setCurrentSoc((prevSoc) => {
            const nextSoc = Math.min(targetSoc, prevSoc + addedSocPct);
            if (nextSoc >= targetSoc) {
              // Target reached!
              setStatus('completed');
              handleFinalizeSession(nextEnergy, nextSoc);
            }
            return Math.round(nextSoc * 10) / 10;
          });

          return Math.round(nextEnergy * 1000) / 1000;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [status, chargingPowerKw, speedMultiplier, batteryCapacityKwh, targetSoc]);

  // Handle finalize and save session
  const handleFinalizeSession = async (finalEnergy: number, finalSoc: number) => {
    const vehicleId = activeVehicle?.id || 1;
    const sessionPayload = {
      vehicle_id: vehicleId,
      start_time: sessionStartTime || new Date(Date.now() - sessionElapsedSeconds * 1000).toISOString(),
      end_time: new Date().toISOString(),
      start_soc: initialSoc,
      end_soc: finalSoc,
      energy_kwh: Math.round(finalEnergy * 100) / 100,
      charging_power: chargingPowerKw,
      electricity_tariff: tariffPerKwh,
      session_status: 'completed' as const,
    };

    try {
      const saved = await api.createChargingSession(sessionPayload);
      setRecentSessions((prev) => [saved, ...prev]);
      setSaveSuccessMessage(`Session saved: +${saved.energy_kwh} kWh (₹${saved.total_cost})`);
      setTimeout(() => setSaveSuccessMessage(null), 5000);
    } catch (e) {
      console.warn('Failed to save session to backend:', e);
    }
  };

  // User Actions
  const handleStartCharging = () => {
    if (currentSoc >= targetSoc) {
      setCurrentSoc(Math.max(10, targetSoc - 20));
    }
    setInitialSoc(currentSoc);
    setStatus('charging');
  };

  const handlePauseCharging = () => {
    setStatus('paused');
  };

  const handleResumeCharging = () => {
    setStatus('charging');
  };

  const handleStopCharging = () => {
    setStatus('completed');
    handleFinalizeSession(energyDeliveredKwh, currentSoc);
  };

  const handleResetSession = () => {
    setStatus('idle');
    setEnergyDeliveredKwh(0);
    setSessionElapsedSeconds(0);
    setSessionStartTime(null);
    setCurrentSoc(initialSoc);
  };

  // Power Presets
  const POWER_PRESETS = [
    { label: 'Level 1 Home', kw: 3.3, type: 'AC 16A 230V' },
    { label: 'Wallbox AC', kw: 7.4, type: 'AC 32A 230V' },
    { label: 'Commercial AC', kw: 22.0, type: 'AC 32A 400V' },
    { label: 'DC Fast', kw: 50.0, type: 'DC 125A 400V' },
    { label: 'DC Supercharger', kw: 150.0, type: 'DC 375A 400V' },
    { label: 'Hypercharger', kw: 350.0, type: 'DC 437A 800V' },
  ];

  return (
    <div className="w-full max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-6 space-y-6">
      
      {/* Top Header & Simulation Notification */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-cyan-400" />
              HIGH-VOLTAGE EV CHARGING COCKPIT
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold uppercase">
              DEMO SIMULATION
            </span>
            <span className="text-xs text-slate-400 hidden sm:inline">
              Real-time telemetry, battery thermal state & charging economics
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1.5 tracking-tight flex items-center gap-3">
            <span>Electric Vehicle Charging Monitor</span>
            {status === 'charging' && (
              <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                ACTIVE POWER FLOW
              </span>
            )}
          </h1>
        </div>

        {/* Speed Multiplier & Status Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-xl bg-slate-900 border border-slate-800 p-1 text-xs">
            <span className="px-2 text-slate-400 font-mono text-[11px]">Sim Speed:</span>
            {[1, 10, 60].map((mult) => (
              <button
                key={mult}
                onClick={() => setSpeedMultiplier(mult)}
                className={`px-2.5 py-1 rounded-lg font-mono text-xs font-semibold transition ${
                  speedMultiplier === mult
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {mult}x
              </button>
            ))}
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Session: {formatElapsedTime(sessionElapsedSeconds)}</span>
          </div>
        </div>
      </div>

      {saveSuccessMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs text-emerald-300 flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{saveSuccessMessage}</span>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MAIN INFOTAINMENT SCREEN (Inspired by Tesla/Jalopnik HUD) */}
      {/* ======================================================== */}
      <div className="relative rounded-3xl bg-[#070b13] border-2 border-slate-800/90 shadow-2xl p-6 sm:p-8 lg:p-10 overflow-hidden backdrop-blur-xl">
        
        {/* Subtle Ambient Radial Lighting */}
        <div 
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full blur-[120px] pointer-events-none transition-all duration-700"
          style={{
            background: status === 'charging' 
              ? 'radial-gradient(circle, rgba(16,185,129,0.25) 0%, rgba(6,182,212,0.15) 100%)' 
              : 'radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)'
          }}
        />

        {/* Screen Top Row: Status, Time Remaining, Big SOC % */}
        <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-base tracking-wide">
              <Zap className={`w-5 h-5 ${status === 'charging' ? 'animate-bounce fill-emerald-400' : ''}`} />
              <span className="uppercase font-mono">
                {status === 'charging' ? 'Charging' : status === 'completed' ? 'Fully Charged' : status === 'paused' ? 'Charging Paused' : 'Ready to Charge'}
              </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-400 font-medium">Time Remaining</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-100 font-mono tracking-tight">
              {formatRemainingTime()}
            </p>

            <div className="pt-2">
              <span className="text-6xl sm:text-7xl lg:text-8xl font-black tracking-tight text-white font-mono">
                {Math.round(currentSoc)}%
              </span>
              <span className="text-xs sm:text-sm text-slate-400 font-mono ml-2">
                (Target: {targetSoc}%)
              </span>
            </div>
          </div>

          {/* Quick Simulation Action Buttons on Screen */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {status === 'idle' || status === 'completed' ? (
              <button
                onClick={handleStartCharging}
                className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition-all hover:scale-105 active:scale-95"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                <span>Start Charging</span>
              </button>
            ) : status === 'charging' ? (
              <>
                <button
                  onClick={handlePauseCharging}
                  className="px-4 py-2.5 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold text-sm flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                >
                  <Pause className="w-4 h-4 fill-amber-300" />
                  <span>Pause</span>
                </button>
                <button
                  onClick={handleStopCharging}
                  className="px-4 py-2.5 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-semibold text-sm flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                >
                  <Square className="w-4 h-4 fill-rose-300" />
                  <span>Stop</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleResumeCharging}
                  className="px-4 py-2.5 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-semibold text-sm flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                >
                  <Play className="w-4 h-4 fill-emerald-300" />
                  <span>Resume</span>
                </button>
                <button
                  onClick={handleStopCharging}
                  className="px-4 py-2.5 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-semibold text-sm flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                >
                  <Square className="w-4 h-4 fill-rose-300" />
                  <span>Stop</span>
                </button>
              </>
            )}

            <button
              onClick={handleResetSession}
              className="p-2.5 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:text-white transition-all"
              title="Reset Session"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Screen Center: 3D-Style Cutaway EV Car with Glowing Battery Skateboard Chassis */}
        <div className="relative my-8 sm:my-12 flex items-center justify-center">
          <div className="w-full max-w-4xl relative aspect-[16/8] flex items-center justify-center">
            
            <svg
              viewBox="0 0 900 420"
              className="w-full h-full filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)]"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                {/* Glow Filter */}
                <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>

                {/* Battery Active Gradient */}
                <linearGradient id="batteryFlow" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="50%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#38bdf8" />
                </linearGradient>

                {/* Cable Energy Flow Gradient */}
                <linearGradient id="cableFlow" x1="100%" y1="0%" x2="0%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="50%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#38bdf8" />
                </linearGradient>
              </defs>

              {/* Ground Shadow & Reflection Grid */}
              <ellipse cx="450" cy="365" rx="360" ry="24" fill="rgba(0,0,0,0.6)" filter="blur(8px)" />
              <line x1="120" y1="365" x2="780" y2="365" stroke="rgba(51, 65, 85, 0.4)" strokeWidth="1.5" strokeDasharray="6 6" />

              {/* ======================================================== */}
              {/* VEHICLE WIREFRAME BODY (Translucent High-Tech Sedan) */}
              {/* ======================================================== */}
              {/* Main Body Silhouette */}
              <path
                d="M 180 300 
                   C 170 280, 185 240, 210 220 
                   C 240 200, 310 180, 370 145 
                   C 420 115, 520 115, 600 145 
                   C 660 170, 710 205, 740 230 
                   C 760 250, 765 285, 750 305 
                   L 715 310 
                   C 700 270, 640 270, 625 310 
                   L 330 310 
                   C 315 270, 255 270, 240 310 
                   Z"
                fill="rgba(15, 23, 42, 0.65)"
                stroke="rgba(148, 163, 184, 0.35)"
                strokeWidth="2.5"
              />

              {/* Glasshouse / Roofline & Windows */}
              <path
                d="M 330 200 
                   C 370 155, 430 135, 500 135 
                   C 570 135, 610 160, 650 200 
                   Z"
                fill="rgba(6, 182, 212, 0.08)"
                stroke="rgba(56, 189, 248, 0.4)"
                strokeWidth="1.5"
              />
              {/* Window A-Pillar and B-Pillar */}
              <line x1="485" y1="135" x2="480" y2="200" stroke="rgba(148, 163, 184, 0.3)" strokeWidth="2" />

              {/* Headlights & Taillights Accent */}
              <path d="M 185 240 Q 210 245 220 255" stroke="#38bdf8" strokeWidth="3" fill="none" filter="url(#neon-glow)" />
              <path d="M 740 245 Q 755 250 760 260" stroke="#f43f5e" strokeWidth="3" fill="none" opacity="0.8" />

              {/* ======================================================== */}
              {/* BATTERY SKATEBOARD PACK (Center Chassis Cutaway) */}
              {/* ======================================================== */}
              {/* Outer Battery Housing Frame */}
              <rect
                x="305"
                y="275"
                width="335"
                height="32"
                rx="6"
                fill="rgba(2, 6, 23, 0.9)"
                stroke="rgba(56, 189, 248, 0.6)"
                strokeWidth="2"
              />

              {/* Modular Battery Cells (10 Partitions) */}
              {[...Array(10)].map((_, idx) => {
                const cellX = 311 + idx * 32.5;
                const cellThreshold = (idx + 1) * 10;
                const isCharged = currentSoc >= cellThreshold;
                const isPartiallyCharging = currentSoc >= idx * 10 && currentSoc < cellThreshold;

                return (
                  <g key={idx}>
                    <rect
                      x={cellX}
                      y="280"
                      width="27"
                      height="22"
                      rx="3"
                      fill={
                        isCharged
                          ? 'url(#batteryFlow)'
                          : isPartiallyCharging && status === 'charging'
                          ? 'rgba(6, 182, 212, 0.5)'
                          : 'rgba(30, 41, 59, 0.7)'
                      }
                      stroke={
                        isCharged
                          ? '#10b981'
                          : isPartiallyCharging
                          ? '#38bdf8'
                          : 'rgba(71, 85, 105, 0.5)'
                      }
                      strokeWidth="1.2"
                      className={isPartiallyCharging && status === 'charging' ? 'animate-pulse' : ''}
                    />
                    {isCharged && (
                      <line
                        x1={cellX + 13.5}
                        y1="282"
                        x2={cellX + 13.5}
                        y2="300"
                        stroke="rgba(255,255,255,0.4)"
                        strokeWidth="1"
                      />
                    )}
                  </g>
                );
              })}

              {/* Battery Pack Subtitle Badge */}
              <text
                x="472"
                y="323"
                textAnchor="middle"
                fill="rgba(148, 163, 184, 0.7)"
                fontSize="9"
                fontFamily="monospace"
                letterSpacing="1"
              >
                SKATEBOARD LI-ION ARCHITECTURE · {batteryCapacityKwh} kWh
              </text>

              {/* ======================================================== */}
              {/* WHEELS & BRAKE ROTORS */}
              {/* ======================================================== */}
              {/* Front Wheel (Left) */}
              <g transform="translate(285, 310)">
                <circle cx="0" cy="0" r="42" fill="#0f172a" stroke="#475569" strokeWidth="4" />
                <circle cx="0" cy="0" r="28" fill="#1e293b" stroke="#64748b" strokeWidth="2" />
                <circle cx="0" cy="0" r="14" fill="#334155" stroke="#94a3b8" strokeWidth="1" />
                {[0, 60, 120, 180, 240, 300].map((deg) => (
                  <line
                    key={deg}
                    x1="0"
                    y1="0"
                    x2={24 * Math.cos((deg * Math.PI) / 180)}
                    y2={24 * Math.sin((deg * Math.PI) / 180)}
                    stroke="#94a3b8"
                    strokeWidth="2.5"
                  />
                ))}
              </g>

              {/* Rear Wheel (Right) */}
              <g transform="translate(670, 310)">
                <circle cx="0" cy="0" r="42" fill="#0f172a" stroke="#475569" strokeWidth="4" />
                <circle cx="0" cy="0" r="28" fill="#1e293b" stroke="#64748b" strokeWidth="2" />
                <circle cx="0" cy="0" r="14" fill="#334155" stroke="#94a3b8" strokeWidth="1" />
                {[0, 60, 120, 180, 240, 300].map((deg) => (
                  <line
                    key={deg}
                    x1="0"
                    y1="0"
                    x2={24 * Math.cos((deg * Math.PI) / 180)}
                    y2={24 * Math.sin((deg * Math.PI) / 180)}
                    stroke="#94a3b8"
                    strokeWidth="2.5"
                  />
                ))}
              </g>

              {/* ======================================================== */}
              {/* CHARGING DISPENSER & HIGH-VOLTAGE CABLE */}
              {/* ======================================================== */}
              {/* Charging Dispenser Pedestal (Right Side) */}
              <g transform="translate(805, 170)">
                <rect x="0" y="0" width="34" height="150" rx="6" fill="#0f172a" stroke="#0ea5e9" strokeWidth="2" />
                <rect x="6" y="14" width="22" height="30" rx="3" fill="#0284c7" opacity="0.3" />
                <circle cx="17" cy="28" r="4" fill={status === 'charging' ? '#10b981' : '#64748b'} className={status === 'charging' ? 'animate-pulse' : ''} />
                <text x="17" y="65" textAnchor="middle" fill="#38bdf8" fontSize="8" fontFamily="monospace" fontWeight="bold">
                  {chargingPowerKw}kW
                </text>
              </g>

              {/* Charging Cable connecting Dispenser to Car Charge Port */}
              <path
                d="M 805 240 C 785 270, 770 275, 742 250"
                fill="none"
                stroke={status === 'charging' ? 'url(#cableFlow)' : '#475569'}
                strokeWidth={status === 'charging' ? '5' : '4'}
                strokeLinecap="round"
                className={status === 'charging' ? 'animate-pulse' : ''}
                filter={status === 'charging' ? 'url(#neon-glow)' : undefined}
              />

              {/* Charge Port Indicator on Vehicle */}
              <circle
                cx="742"
                cy="250"
                r="6"
                fill={status === 'charging' ? '#10b981' : '#64748b'}
                stroke="#fff"
                strokeWidth="1.5"
                filter={status === 'charging' ? 'url(#neon-glow)' : undefined}
              />
            </svg>

          </div>
        </div>

        {/* Screen Bottom Telemetry Strip (Exact match to Jalopnik reference: Power | Energy | Amps | Volts) */}
        <div className="relative z-10 pt-4 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
            <p className="text-[11px] text-slate-400 uppercase font-mono tracking-wider">Charging Power</p>
            <p className="text-xl sm:text-2xl font-bold text-white font-mono mt-0.5">
              {status === 'charging' ? `${chargingPowerKw.toFixed(0)} kW` : '0 kW'}
            </p>
            <span className="text-[10px] text-cyan-400 font-mono">
              {chargingPowerKw >= 50 ? 'DC Fast Charging' : 'AC Standard'}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
            <p className="text-[11px] text-slate-400 uppercase font-mono tracking-wider">Energy Delivered</p>
            <p className="text-xl sm:text-2xl font-bold text-emerald-400 font-mono mt-0.5">
              +{energyDeliveredKwh.toFixed(1)} kWh
            </p>
            <span className="text-[10px] text-slate-400 font-mono">
              ₹{totalChargingCost.toFixed(2)} cost
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
            <p className="text-[11px] text-slate-400 uppercase font-mono tracking-wider">Current</p>
            <p className="text-xl sm:text-2xl font-bold text-white font-mono mt-0.5">
              {status === 'charging' ? `${currentAmps} A` : '0 A'}
            </p>
            <span className="text-[10px] text-slate-400 font-mono">
              Rated draw
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
            <p className="text-[11px] text-slate-400 uppercase font-mono tracking-wider">Voltage</p>
            <p className="text-xl sm:text-2xl font-bold text-white font-mono mt-0.5">
              {status === 'charging' ? `${voltage} V` : '0 V'}
            </p>
            <span className="text-[10px] text-slate-400 font-mono">
              High-voltage rail
            </span>
          </div>

        </div>

      </div>

      {/* ======================================================== */}
      {/* COST & ENERGY ANALYTICS (EXACT USER SPECIFIED FORMULAS) */}
      {/* ======================================================== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <h2 className="text-lg font-bold text-white">Cost & Energy Analytics</h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Tariff: ₹{tariffPerKwh.toFixed(2)}/kWh · Efficiency: {vehicleEfficiency} km/kWh
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Charging Cost */}
          <div className="p-4 rounded-2xl glass-panel border border-slate-800 hover:border-emerald-500/40 transition-colors">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider text-slate-300">Total Charging Cost</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-white mt-2 font-mono">
              ₹ {totalChargingCost.toFixed(2)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1 font-mono">
              Formula: {energyDeliveredKwh.toFixed(2)} kWh × ₹{tariffPerKwh}/kWh
            </p>
          </div>

          {/* Card 2: Estimated Available Range */}
          <div className="p-4 rounded-2xl glass-panel border border-slate-800 hover:border-cyan-500/40 transition-colors">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider text-slate-300">Estimated Range</span>
              <Gauge className="w-4 h-4 text-cyan-400" />
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-cyan-400 mt-2 font-mono">
              {estimatedAvailableRangeKm.toFixed(1)} km
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              *Estimated based on {availableBatteryEnergyKwh.toFixed(1)} kWh available × {vehicleEfficiency} km/kWh
            </p>
          </div>

          {/* Card 3: Estimated Distance Added */}
          <div className="p-4 rounded-2xl glass-panel border border-slate-800 hover:border-blue-500/40 transition-colors">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider text-slate-300">Estimated Distance Added</span>
              <TrendingUp className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-blue-400 mt-2 font-mono">
              +{estimatedDistanceAddedKm.toFixed(1)} km
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              *Estimated driving distance gained this session
            </p>
          </div>

          {/* Card 4: Cost per km */}
          <div className="p-4 rounded-2xl glass-panel border border-slate-800 hover:border-purple-500/40 transition-colors">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider text-slate-300">Cost per km</span>
              <Cpu className="w-4 h-4 text-purple-400" />
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-purple-300 mt-2 font-mono">
              ₹ {costPerKm.toFixed(2)} <span className="text-xs text-slate-400 font-sans font-normal">/ km</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-1 font-mono">
              Formula: ₹{tariffPerKwh} ÷ {vehicleEfficiency} km/kWh
            </p>
          </div>

        </div>
      </div>

      {/* ======================================================== */}
      {/* VEHICLE CONFIGURATION & CHARGING POWER SELECTION */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Vehicle Configuration Form */}
        <div className="lg:col-span-6 p-5 rounded-2xl glass-panel border border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Vehicle Configuration</h3>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              {activeVehicle?.vehicle_name || 'Primary EV'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            
            {/* Battery Capacity */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Battery Pack Capacity (kWh)</label>
              <input
                type="number"
                min="20"
                max="150"
                step="1"
                value={batteryCapacityKwh}
                onChange={(e) => setBatteryCapacityKwh(parseFloat(e.target.value) || 75)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
              />
            </div>

            {/* Current Battery SOC */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Current Battery SOC (%)</label>
              <input
                type="number"
                min="1"
                max="99"
                step="1"
                value={currentSoc}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 10;
                  setCurrentSoc(val);
                  setInitialSoc(val);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
              />
            </div>

            {/* Target Battery SOC */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Target Battery SOC (%)</label>
              <input
                type="number"
                min="20"
                max="100"
                step="5"
                value={targetSoc}
                onChange={(e) => setTargetSoc(parseFloat(e.target.value) || 80)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
              />
            </div>

            {/* Vehicle Efficiency */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Vehicle Efficiency (km/kWh)</label>
              <input
                type="number"
                min="2.0"
                max="10.0"
                step="0.1"
                value={vehicleEfficiency}
                onChange={(e) => setVehicleEfficiency(parseFloat(e.target.value) || 5.8)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
              />
            </div>

            {/* Electricity Tariff */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-slate-300 font-medium">Electricity Tariff Rate (₹ / kWh)</label>
              <input
                type="number"
                min="1.0"
                max="40.0"
                step="0.5"
                value={tariffPerKwh}
                onChange={(e) => setTariffPerKwh(parseFloat(e.target.value) || 15.0)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
              />
            </div>

          </div>
        </div>

        {/* Right Column: Charging Power Presets & Custom Power */}
        <div className="lg:col-span-6 p-5 rounded-2xl glass-panel border border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Charging Power Presets</h3>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400">
              Selected: {chargingPowerKw} kW
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {POWER_PRESETS.map((preset) => {
              const isSelected = chargingPowerKw === preset.kw;
              return (
                <button
                  key={preset.kw}
                  onClick={() => setChargingPowerKw(preset.kw)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-white shadow-md shadow-emerald-500/10'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <p className="text-xs font-bold text-slate-100">{preset.label}</p>
                  <p className="text-lg font-mono font-extrabold text-emerald-400 mt-1">{preset.kw} kW</p>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">{preset.type}</p>
                </button>
              );
            })}
          </div>

          {/* Custom Power Slider */}
          <div className="space-y-1.5 pt-2">
            <div className="flex justify-between text-xs text-slate-300">
              <span>Custom Power Rate</span>
              <span className="font-mono text-cyan-400 font-bold">{chargingPowerKw} kW</span>
            </div>
            <input
              type="range"
              min="3"
              max="350"
              step="1"
              value={chargingPowerKw}
              onChange={(e) => setChargingPowerKw(parseFloat(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>
        </div>

      </div>

      {/* ======================================================== */}
      {/* RECENT CHARGING SESSIONS LOG */}
      {/* ======================================================== */}
      <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Recent Charging Sessions Log</h3>
          </div>
          <span className="text-xs text-slate-400">
            {recentSessions.length} Recorded Sessions
          </span>
        </div>

        {isLoadingHistory ? (
          <div className="p-8 text-center text-xs text-slate-400 font-mono">
            Loading session telemetry history...
          </div>
        ) : recentSessions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No past charging sessions recorded yet. Complete a session above to record it to the database!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono">
                  <th className="py-2.5 px-3">Date & Time</th>
                  <th className="py-2.5 px-3">Start → End SOC</th>
                  <th className="py-2.5 px-3">Energy Delivered</th>
                  <th className="py-2.5 px-3">Power</th>
                  <th className="py-2.5 px-3">Total Cost</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                {recentSessions.map((session) => (
                  <tr key={session.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-3">
                      {new Date(session.start_time).toLocaleDateString()} {new Date(session.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="text-amber-400">{session.start_soc}%</span> → <span className="text-emerald-400">{session.end_soc}%</span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-white">
                      +{session.energy_kwh.toFixed(1)} kWh
                    </td>
                    <td className="py-2.5 px-3 text-cyan-400">
                      {session.charging_power} kW
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-emerald-400">
                      ₹ {session.total_cost.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold ${
                        session.session_status === 'completed'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      }`}>
                        {session.session_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};

export default EVChargingPage;
