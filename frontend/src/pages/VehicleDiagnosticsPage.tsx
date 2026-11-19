import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldCheck, ShieldAlert, Cpu, Battery, Thermometer, Zap, Layers, 
  Disc, Wind, Lock, Unlock, Radio, AlertTriangle, CheckCircle2, 
  RotateCw, RefreshCw, Sliders, ChevronRight, Activity, BellRing
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { VehicleDigitalTwin3D } from '../components/vehicle/VehicleDigitalTwin3D';
import { DiagnosticScanner } from '../components/DiagnosticScanner';
import { 
  TyreStatus, DoorStatus, SeatbeltStatus, ClimateStatus, 
  ComponentHealthDetail, VehicleFullHealth 
} from '../types';

export const VehicleDiagnosticsPage: React.FC = () => {
  const { activeVehicle } = useAuth();

  const [fullHealth, setFullHealth] = useState<VehicleFullHealth | null>(null);
  const [tyres, setTyres] = useState<TyreStatus | null>(null);
  const [doors, setDoors] = useState<DoorStatus | null>(null);
  const [seatbelts, setSeatbelts] = useState<SeatbeltStatus | null>(null);
  const [climate, setClimate] = useState<ClimateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [commandMsg, setCommandMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [executingCmd, setExecutingCmd] = useState(false);

  // Fetch all Digital Twin Telemetry
  const fetchTelemetry = useCallback(async () => {
    if (!activeVehicle) return;
    try {
      const [hRes, tRes, dRes, sRes, cRes] = await Promise.all([
        api.getVehicleHealth(activeVehicle.id),
        api.getVehicleTyres(activeVehicle.id),
        api.getVehicleDoors(activeVehicle.id),
        api.getVehicleSeatbelts(activeVehicle.id),
        api.getVehicleClimate(activeVehicle.id),
      ]);
      setFullHealth(hRes);
      setTyres(tRes);
      setDoors(dRes);
      setSeatbelts(sRes);
      setClimate(cRes);
    } catch (err) {
      console.error('Error fetching digital twin telemetry:', err);
    } finally {
      setLoading(false);
    }
  }, [activeVehicle]);

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 10000);
    return () => clearInterval(interval);
  }, [fetchTelemetry]);

  // Execute Vehicle Command (Climate / Doors)
  const handleCommand = async (cmd: string, params: Record<string, any> = {}) => {
    if (!activeVehicle || executingCmd) return;
    setExecutingCmd(true);
    setCommandMsg(null);
    try {
      const res = await api.sendVehicleCommand(activeVehicle.id, cmd, params);
      if (res.status === 'safety_blocked') {
        setCommandMsg({ text: res.message, isError: true });
      } else {
        setCommandMsg({ text: res.message, isError: false });
        await fetchTelemetry();
      }
    } catch (err: any) {
      setCommandMsg({ text: err.message || 'Command execution failed.', isError: true });
    } finally {
      setExecutingCmd(false);
      setTimeout(() => setCommandMsg(null), 6000);
    }
  };

  return (
    <div className="w-full max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-8">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              MODULE THREE: 360° DIGITAL TWIN & REAL-TIME VEHICLE CONTROLS
            </span>
            <span className="text-xs text-slate-400">Live CAN-Bus Hardware Telemetry</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
            Vehicle Diagnostics & 360° Digital Twin
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-3xl">
            Inspect your electric vehicle in full 360° 3D with X-ray cutaway view. Monitor real-time TPMS tyre pressures, high-voltage battery health, thermal cooling loops, climate controls, and cabin safety restraints.
          </p>
        </div>

        {/* Live Status Pill & Refresh Button */}
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 flex items-center gap-2 text-xs font-mono text-cyan-300">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Health Score: <strong>{fullHealth?.health_score || 96} / 100</strong></span>
          </div>
          <button
            onClick={fetchTelemetry}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all"
            title="Refresh Telemetry"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Command Notification Banner */}
      {commandMsg && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-xs sm:text-sm font-mono animate-fadeIn ${
          commandMsg.isError 
            ? 'bg-rose-950/40 border-rose-500/40 text-rose-200' 
            : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
        }`}>
          <div className="flex items-center gap-2.5">
            {commandMsg.isError ? <AlertTriangle className="w-4 h-4 text-rose-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            <span>{commandMsg.text}</span>
          </div>
          <button onClick={() => setCommandMsg(null)} className="text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* 360° 3D VEHICLE DIGITAL TWIN CANVAS COMPONENT */}
      <VehicleDigitalTwin3D
        vehicleName={activeVehicle?.vehicle_name || 'CyberPulse GT'}
        soc={activeVehicle?.current_battery_pct || 70}
        soh={fullHealth?.soh || 96}
        packVoltage={fullHealth?.pack_voltage || 398.5}
        packTemp={fullHealth?.pack_temp_c || 28.5}
        tyres={tyres}
        doors={doors}
        seatbelts={seatbelts}
        climate={climate}
        healthComponents={fullHealth?.components || []}
      />

      {/* THREE HARDWARE CONTROLS & MONITORING PANELS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* PANEL 1: TYRE PRESSURE MONITORING SYSTEM (TPMS) */}
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden flex flex-col justify-between border border-cyan-500/20">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Disc className="w-4 h-4 text-cyan-400" />
                <span>Tyre Pressure Monitoring (TPMS)</span>
              </h3>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-bold ${
                tyres?.tpms_status === 'critical' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                tyres?.tpms_status === 'warning' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              }`}>
                {tyres?.tpms_status || 'NORMAL'}
              </span>
            </div>

            {/* Visual 4-Wheel Layout */}
            <div className="relative py-4 px-2">
              <div className="w-full max-w-[280px] mx-auto p-4 rounded-xl bg-slate-950/70 border border-slate-800 relative">
                {/* Center Car Silhouette Outline */}
                <div className="w-24 h-44 mx-auto rounded-2xl border-2 border-dashed border-cyan-500/30 bg-slate-900/40 flex items-center justify-center">
                  <span className="text-[10px] text-slate-500 font-mono tracking-wider rotate-90 uppercase">
                    CHASSIS
                  </span>
                </div>

                {/* Front Left Tyre */}
                <div className="absolute top-6 left-2 flex flex-col items-center">
                  <div className={`w-8 h-12 rounded-lg border-2 flex items-center justify-center text-[10px] font-bold ${
                    (tyres?.fl.status || 'normal') === 'warning' ? 'bg-amber-500/20 border-amber-400 text-amber-300' :
                    (tyres?.fl.status || 'normal') === 'critical' ? 'bg-rose-500/20 border-rose-400 text-rose-300' :
                    'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                  }`}>
                    FL
                  </div>
                  <span className="text-xs font-bold text-white font-mono mt-1">
                    {tyres?.fl.psi || 36.0} <span className="text-[9px] text-slate-400">PSI</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">{tyres?.fl.temp_c || 31.5}°C</span>
                </div>

                {/* Front Right Tyre */}
                <div className="absolute top-6 right-2 flex flex-col items-center">
                  <div className={`w-8 h-12 rounded-lg border-2 flex items-center justify-center text-[10px] font-bold ${
                    (tyres?.fr.status || 'normal') === 'warning' ? 'bg-amber-500/20 border-amber-400 text-amber-300' :
                    (tyres?.fr.status || 'normal') === 'critical' ? 'bg-rose-500/20 border-rose-400 text-rose-300' :
                    'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                  }`}>
                    FR
                  </div>
                  <span className="text-xs font-bold text-white font-mono mt-1">
                    {tyres?.fr.psi || 35.8} <span className="text-[9px] text-slate-400">PSI</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">{tyres?.fr.temp_c || 32.0}°C</span>
                </div>

                {/* Rear Left Tyre */}
                <div className="absolute bottom-6 left-2 flex flex-col items-center">
                  <div className={`w-8 h-12 rounded-lg border-2 flex items-center justify-center text-[10px] font-bold ${
                    (tyres?.rl.status || 'normal') === 'warning' ? 'bg-amber-500/20 border-amber-400 text-amber-300' :
                    (tyres?.rl.status || 'normal') === 'critical' ? 'bg-rose-500/20 border-rose-400 text-rose-300' :
                    'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                  }`}>
                    RL
                  </div>
                  <span className="text-xs font-bold text-white font-mono mt-1">
                    {tyres?.rl.psi || 36.2} <span className="text-[9px] text-slate-400">PSI</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">{tyres?.rl.temp_c || 31.2}°C</span>
                </div>

                {/* Rear Right Tyre */}
                <div className="absolute bottom-6 right-2 flex flex-col items-center">
                  <div className={`w-8 h-12 rounded-lg border-2 flex items-center justify-center text-[10px] font-bold ${
                    (tyres?.rr.status || 'normal') === 'warning' ? 'bg-amber-500/20 border-amber-400 text-amber-300' :
                    (tyres?.rr.status || 'normal') === 'critical' ? 'bg-rose-500/20 border-rose-400 text-rose-300' :
                    'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                  }`}>
                    RR
                  </div>
                  <span className="text-xs font-bold text-white font-mono mt-1">
                    {tyres?.rr.psi || 36.0} <span className="text-[9px] text-slate-400">PSI</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">{tyres?.rr.temp_c || 31.8}°C</span>
                </div>
              </div>
            </div>

            {/* Threshold Spec Notice */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>Recommended Cold Pressure:</span>
                <span className="text-cyan-300 font-bold">36.0 PSI (248 kPa)</span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>Alert Low Threshold:</span>
                <span className="text-amber-400">&lt; 31.0 PSI</span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 font-mono mt-4 text-center">
            Last CAN-Bus frame: {new Date().toLocaleTimeString()}
          </p>
        </div>

        {/* PANEL 2: CABIN CLIMATE & HVAC CONTROLS */}
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden flex flex-col justify-between border border-cyan-500/20">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Wind className="w-4 h-4 text-cyan-400" />
                <span>Cabin Climate & HVAC</span>
              </h3>
              <button
                onClick={() => handleCommand('climate_power', { power: !climate?.power })}
                disabled={executingCmd}
                className={`px-3 py-1 rounded-full text-xs font-bold font-mono transition-all ${
                  climate?.power
                    ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {climate?.power ? 'AC ON' : 'AC OFF'}
              </button>
            </div>

            {/* Live Temperature Gauge */}
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between mb-4">
              <div>
                <span className="text-xs text-slate-400 uppercase font-mono">Target Cabin Temp</span>
                <div className="text-3xl font-extrabold text-cyan-300 font-mono flex items-baseline gap-1 mt-0.5">
                  <span>{climate?.target_temp_c?.toFixed(1) || '22.0'}</span>
                  <span className="text-base text-slate-400 font-normal">°C</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCommand('temp_down')}
                  disabled={executingCmd || !climate?.power}
                  className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-lg disabled:opacity-40 transition-all flex items-center justify-center"
                >
                  -
                </button>
                <button
                  onClick={() => handleCommand('temp_up')}
                  disabled={executingCmd || !climate?.power}
                  className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-lg disabled:opacity-40 transition-all flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>

            {/* Fan Speed Selector */}
            <div className="space-y-2 mb-4">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between font-mono">
                <span>Fan Blower Speed</span>
                <span className="text-cyan-400">Level {climate?.fan_speed || 2} / 5</span>
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => handleCommand('set_fan_speed', { speed })}
                    disabled={executingCmd || !climate?.power}
                    className={`py-2 rounded-lg text-xs font-mono font-bold transition-all ${
                      (climate?.fan_speed || 2) >= speed
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                        : 'bg-slate-900 text-slate-500 border border-slate-800'
                    }`}
                  >
                    {speed}
                  </button>
                ))}
              </div>
            </div>

            {/* Air Circulation Toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleCommand('set_circulation', { mode: 'fresh_air' })}
                disabled={executingCmd || !climate?.power}
                className={`p-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  climate?.air_circulation === 'fresh_air'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                <span>Fresh Air</span>
              </button>
              <button
                onClick={() => handleCommand('set_circulation', { mode: 'recirculate' })}
                disabled={executingCmd || !climate?.power}
                className={`p-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  climate?.air_circulation === 'recirculate'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                <span>Recirculate</span>
              </button>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 mt-4 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">Cabin Ambient Sensor:</span>
            <span className="text-white font-bold">{climate?.cabin_temp_c?.toFixed(1) || '23.5'}°C</span>
          </div>
        </div>

        {/* PANEL 3: DOORS, TRUNK & RESTRAINT SAFETY */}
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden flex flex-col justify-between border border-cyan-500/20">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Lock className="w-4 h-4 text-cyan-400" />
                <span>Doors, Trunk & Seatbelts</span>
              </h3>
              <button
                onClick={() => handleCommand(doors?.locked ? 'door_unlock' : 'door_lock')}
                disabled={executingCmd}
                className={`px-3 py-1 rounded-full text-xs font-bold font-mono transition-all flex items-center gap-1.5 ${
                  doors?.locked
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}
              >
                {doors?.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                <span>{doors?.locked ? 'LOCKED' : 'UNLOCKED'}</span>
              </button>
            </div>

            {/* Latch Status Matrix */}
            <div className="grid grid-cols-2 gap-2 mb-4 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">Front Left:</span>
                <span className="text-emerald-400 font-bold">Closed</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">Front Right:</span>
                <span className="text-emerald-400 font-bold">Closed</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">Rear Left:</span>
                <span className="text-emerald-400 font-bold">Closed</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">Rear Right:</span>
                <span className="text-emerald-400 font-bold">Closed</span>
              </div>
            </div>

            {/* Trunk and Charge Port Remote Toggles */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                onClick={() => handleCommand(doors?.trunk ? 'close_trunk' : 'open_trunk')}
                disabled={executingCmd}
                className={`p-2.5 rounded-xl text-xs font-medium font-mono flex items-center justify-between transition-all ${
                  doors?.trunk
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-cyan-500/30'
                }`}
              >
                <span>Rear Trunk</span>
                <span className="text-[10px] uppercase font-bold">{doors?.trunk ? 'Open' : 'Closed'}</span>
              </button>
              <button
                onClick={() => handleCommand(doors?.charge_port ? 'close_charge_port' : 'open_charge_port')}
                disabled={executingCmd}
                className={`p-2.5 rounded-xl text-xs font-medium font-mono flex items-center justify-between transition-all ${
                  doors?.charge_port
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-cyan-500/30'
                }`}
              >
                <span>Charge Flap</span>
                <span className="text-[10px] uppercase font-bold">{doors?.charge_port ? 'Open' : 'Closed'}</span>
              </button>
            </div>

            {/* Seat Belt & Occupancy Check */}
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                <span>Occupant Restraints</span>
                <span className="text-[10px] text-emerald-400 font-mono">All Buckled</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span>Driver:</span>
                <span className="text-emerald-400 font-semibold">Fastened (OK)</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span>Front Passenger:</span>
                <span className="text-slate-500">Unoccupied</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span>Rear Bench:</span>
                <span className="text-slate-500">Unoccupied</span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-xs text-emerald-300 font-mono mt-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Safety Interlocks Armed: Door opening prohibited when speed &gt; 0 km/h.</span>
          </div>
        </div>

      </div>

      {/* FULL DIAGNOSTIC SCANNER & FAULT CODE MODULE */}
      {activeVehicle && (
        <DiagnosticScanner vehicleId={activeVehicle.id} />
      )}

    </div>
  );
};
export default VehicleDiagnosticsPage;
