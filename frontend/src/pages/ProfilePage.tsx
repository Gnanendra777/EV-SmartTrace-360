import React, { useState } from 'react';
import { 
  User as UserIcon, 
  Car, 
  ShieldCheck, 
  LogOut, 
  Edit3, 
  Trash2, 
  PlusCircle, 
  Calendar, 
  Mail, 
  Phone, 
  Zap, 
  CheckCircle2, 
  AlertCircle,
  X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Vehicle } from '../types';

export const ProfilePage: React.FC = () => {
  const { user, vehicles, activeVehicle, setActiveVehicle, refreshVehicles, logout } = useAuth();

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name || 'Alex Rivers');
  const [profilePhone, setProfilePhone] = useState(user?.phone_number || '+1 (555) 234-5678');
  const [profileSuccess, setProfileSuccess] = useState('');

  // Vehicle Edit State
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehicleName, setVehicleName] = useState('');
  const [vehicleCapacity, setVehicleCapacity] = useState<number>(60);
  const [vehicleConnectors, setVehicleConnectors] = useState('');
  const [vehiclePower, setVehiclePower] = useState<number>(150);

  // Vehicle Delete State
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.updateProfile({ name: profileName, phone_number: profilePhone });
      setProfileSuccess('Account details updated successfully.');
      setIsEditingProfile(false);
      setTimeout(() => setProfileSuccess(''), 4000);
    } catch {
      setProfileSuccess('Failed to update account.');
    }
  };

  const handleOpenEditVehicle = (v: Vehicle) => {
    setEditingVehicle(v);
    setVehicleName(v.vehicle_name);
    setVehicleCapacity(v.battery_capacity);
    setVehicleConnectors(v.connector_types);
    setVehiclePower(v.max_charging_power);
  };

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVehicle) return;
    try {
      await api.updateVehicle(editingVehicle.id, {
        vehicle_name: vehicleName,
        battery_capacity: vehicleCapacity,
        connector_types: vehicleConnectors,
        max_charging_power: vehiclePower
      });
      setEditingVehicle(null);
      await refreshVehicles();
    } catch (e) {
      console.error('Update vehicle error:', e);
    }
  };

  const handleConfirmDelete = async () => {
    if (!vehicleToDelete) return;
    try {
      await api.deleteVehicle(vehicleToDelete.id);
      setVehicleToDelete(null);
      await refreshVehicles();
    } catch (e) {
      console.error('Delete vehicle error:', e);
    }
  };

  const accountType = user?.account_type || (user?.email?.includes('demo') ? 'Demo' : 'Registered');
  const creationDate = user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Nov 19, 2026';

  return (
    <div className="w-full max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-8">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              IDENTITY & FLEET MANAGEMENT
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
            Account Profile & Registered Vehicles
          </h1>
        </div>

        <button
          onClick={logout}
          className="self-start sm:self-auto px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 text-xs font-semibold flex items-center space-x-1.5 transition"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>

      {profileSuccess && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{profileSuccess}</span>
        </div>
      )}

      {/* Main Grid: Section 1 & Section 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* ============================================================== */}
        {/* SECTION 1: ACCOUNT DETAILS                                    */}
        {/* ============================================================== */}
        <div className="lg:col-span-1 glass-panel p-6 sm:p-7 rounded-2xl space-y-6 flex flex-col justify-between">
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <UserIcon className="w-4 h-4 text-cyan-400" />
                <span>Account Details</span>
              </h2>
              <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                accountType === 'Demo' 
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' 
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              }`}>
                {accountType.toUpperCase()} ACCOUNT
              </span>
            </div>

            {/* Avatar & Display Name */}
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 to-emerald-400 p-[2px]">
                <div className="w-full h-full bg-slate-950 rounded-2xl flex items-center justify-center text-xl font-extrabold text-white">
                  {(user?.name || profileName).charAt(0).toUpperCase()}
                </div>
              </div>
              <div>
                <h3 className="text-base font-bold text-white">{user?.name || profileName}</h3>
                <p className="text-xs text-slate-400 font-mono">{user?.email || 'demo@evsmarttrace.com'}</p>
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  Driver ID: #EV-ST360-{user?.id || 1}
                </span>
              </div>
            </div>

            {/* Detailed Account Fields */}
            <div className="space-y-3 pt-2 text-xs">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center space-x-2 text-slate-400">
                  <Mail className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Registered Email</span>
                </div>
                <span className="font-mono text-slate-200">{user?.email || 'demo@evsmarttrace.com'}</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center space-x-2 text-slate-400">
                  <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Phone Number</span>
                </div>
                <span className="font-mono text-slate-200">{user?.phone_number || profilePhone}</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center space-x-2 text-slate-400">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span>Account Created</span>
                </div>
                <span className="font-mono text-slate-200">{creationDate}</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800">
            <button
              onClick={() => setIsEditingProfile(true)}
              className="w-full py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 text-xs font-bold transition flex items-center justify-center space-x-2"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Account Profile</span>
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* SECTION 2: REGISTERED VEHICLE DETAILS                          */}
        {/* ============================================================== */}
        <div className="lg:col-span-2 glass-panel p-6 sm:p-7 rounded-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <Car className="w-4 h-4 text-emerald-400" />
                <span>Registered Vehicle Details ({vehicles.length})</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Vehicles associated with your account. Select an active vehicle or register a new EV.
              </p>
            </div>

            <Link
              to="/vehicles/register"
              className="self-start sm:self-auto px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-emerald-500/20 hover:brightness-110 transition"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Register New Vehicle</span>
            </Link>
          </div>

          {/* Vehicles List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vehicles.map((v) => {
              const isSelected = activeVehicle?.id === v.id;
              const regDate = v.created_at ? new Date(v.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Active';

              return (
                <div
                  key={v.id}
                  className={`p-5 rounded-2xl border transition relative flex flex-col justify-between ${
                    isSelected
                      ? 'bg-emerald-500/10 border-emerald-500/60 shadow-xl shadow-emerald-500/10'
                      : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    {/* Header: Name, Active Badge & Model */}
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="text-sm font-extrabold text-white">{v.vehicle_name}</h3>
                          {v.is_demo && (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                              DEMO
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {v.manufacturer} {v.model} ({v.vehicle_type || 'EV'})
                        </p>
                      </div>

                      {isSelected ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500 text-slate-950 font-bold">
                          CURRENT COCKPIT
                        </span>
                      ) : (
                        <button
                          onClick={() => setActiveVehicle(v)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 font-mono transition"
                        >
                          Select EV
                        </button>
                      )}
                    </div>

                    {/* Specifications Grid */}
                    <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/60">
                        <span className="text-[10px] text-slate-500 uppercase block">Battery Capacity</span>
                        <span className="text-emerald-400 font-bold">{v.battery_capacity} kWh</span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/60">
                        <span className="text-[10px] text-slate-500 uppercase block">Max DC Input</span>
                        <span className="text-cyan-400 font-bold">{v.max_charging_power} kW</span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/60">
                        <span className="text-[10px] text-slate-500 uppercase block">Connectors</span>
                        <span className="text-slate-200 font-bold truncate block">{v.connector_types || 'CCS2'}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/60">
                        <span className="text-[10px] text-slate-500 uppercase block">Registered Date</span>
                        <span className="text-slate-400">{regDate}</span>
                      </div>
                    </div>

                    <div className="mt-2 text-[10px] text-slate-500 font-mono">
                      Identifier / VIN: <span className="text-slate-300">{v.vehicle_identifier}</span>
                    </div>
                  </div>

                  {/* Actions: Edit & Remove */}
                  <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-end space-x-2">
                    <button
                      onClick={() => handleOpenEditVehicle(v)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-200 font-medium flex items-center space-x-1.5 transition"
                    >
                      <Edit3 className="w-3 h-3 text-cyan-400" />
                      <span>Edit Vehicle</span>
                    </button>
                    <button
                      onClick={() => setVehicleToDelete(v)}
                      className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-xs text-rose-400 font-medium flex items-center space-x-1.5 transition"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ============================================================== */}
      {/* EDIT PROFILE MODAL                                             */}
      {/* ============================================================== */}
      {isEditingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md glass-panel p-6 rounded-2xl border border-slate-700 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Edit Account Profile</h3>
              <button onClick={() => setIsEditingProfile(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Account Holder Name</label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Phone Number</label>
                <input
                  type="text"
                  value={profilePhone}
                  onChange={(e) => setProfilePhone(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">Registered Email (Cannot be changed)</label>
                <input
                  type="email"
                  disabled
                  value={user?.email || 'demo@evsmarttrace.com'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-500 cursor-not-allowed font-mono"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition"
                >
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* EDIT VEHICLE MODAL                                             */}
      {/* ============================================================== */}
      {editingVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md glass-panel p-6 rounded-2xl border border-slate-700 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Edit Vehicle Specifications</h3>
              <button onClick={() => setEditingVehicle(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveVehicle} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Vehicle Nickname</label>
                <input
                  type="text"
                  value={vehicleName}
                  onChange={(e) => setVehicleName(e.target.value)}
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Battery (kWh)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={vehicleCapacity}
                    onChange={(e) => setVehicleCapacity(parseFloat(e.target.value))}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-400 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Max DC (kW)</label>
                  <input
                    type="number"
                    step="1"
                    value={vehiclePower}
                    onChange={(e) => setVehiclePower(parseFloat(e.target.value))}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-400 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Connector Types</label>
                <input
                  type="text"
                  value={vehicleConnectors}
                  onChange={(e) => setVehicleConnectors(e.target.value)}
                  placeholder="e.g. CCS2, Type 2, CHAdeMO"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-400 font-mono"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingVehicle(null)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition"
                >
                  Save Vehicle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* DELETE CONFIRMATION DIALOG                                     */}
      {/* ============================================================== */}
      {vehicleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm glass-panel p-6 rounded-2xl border border-rose-500/40 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-base font-bold text-white">Remove Vehicle?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to remove <strong className="text-white">{vehicleToDelete.vehicle_name}</strong> from your fleet? Telemetry records for this vehicle will be deleted.
            </p>
            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setVehicleToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs transition"
              >
                Confirm Remove
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
