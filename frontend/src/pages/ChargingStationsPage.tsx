import React, { useState, useEffect, useCallback } from 'react';
import { 
  MapPin, 
  Search, 
  Filter, 
  Zap, 
  Navigation, 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  Compass, 
  ArrowRight, 
  ExternalLink, 
  LocateFixed, 
  RefreshCw, 
  SlidersHorizontal, 
  AlertCircle, 
  BatteryCharging, 
  Info, 
  Layers, 
  ChevronRight, 
  Route,
  X,
  ShieldCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { InteractiveMap } from '../components/InteractiveMap';
import { api } from '../services/api';
import { requestUserLocation, formatCoordinates } from '../services/locationService';
import { ChargingStation } from '../types';

export const ChargingStationsPage: React.FC = () => {
  const navigate = useNavigate();

  // Location State
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationStatus, setLocationStatus] = useState<string>('Detecting GPS location...');
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Station Data State
  const [stations, setStations] = useState<ChargingStation[]>([]);
  const [selectedStation, setSelectedStation] = useState<ChargingStation | null>(null);
  const [isLoadingStations, setIsLoadingStations] = useState<boolean>(false);
  const [stationFetchError, setStationFetchError] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [distanceKm, setDistanceKm] = useState<number>(25);
  const [connectorFilter, setConnectorFilter] = useState<string>('All');
  const [chargingType, setChargingType] = useState<'All' | 'AC' | 'DC'>('All');
  const [powerRange, setPowerRange] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'distance' | 'power'>('distance');

  // Trigger GPS location detection
  const handleDetectLocation = useCallback(async () => {
    setGpsError(null);
    setLocationStatus('Acquiring precise browser GPS coordinates...');
    try {
      const loc = await requestUserLocation();
      setUserLocation([loc.lat, loc.lng]);
      setLocationAccuracy(Math.round(loc.accuracy));
      setLocationStatus(`GPS Verified (±${Math.round(loc.accuracy)}m)`);
      fetchNearbyStations(loc.lat, loc.lng, distanceKm, connectorFilter);
    } catch (err: any) {
      console.warn('Geolocation notice:', err.message);
      setGpsError(err.message || 'GPS location permission denied or timed out.');
      setLocationStatus('GPS Unavailable (Using Regional Fallback)');
      
      // Default corridor coordinates if GPS is blocked
      const fallbackLat = 28.6139;
      const fallbackLng = 77.2090;
      setUserLocation([fallbackLat, fallbackLng]);
      fetchNearbyStations(fallbackLat, fallbackLng, distanceKm, connectorFilter);
    }
  }, [distanceKm, connectorFilter]);

  // Fetch stations from backend proxy to Open Charge Map
  const fetchNearbyStations = async (
    lat: number, 
    lng: number, 
    radius: number,
    connector?: string
  ) => {
    setIsLoadingStations(true);
    setStationFetchError(null);
    try {
      const data = await api.getNearbyStations(
        lat, 
        lng, 
        radius, 
        connector !== 'All' ? connector : undefined
      );
      setStations(data);
      if (data.length > 0) {
        setSelectedStation(data[0]);
      } else {
        setSelectedStation(null);
      }
    } catch (e: any) {
      console.error('Error fetching charging stations:', e);
      setStationFetchError('Could not load live charging stations. Regional verified corridor data active.');
    } finally {
      setIsLoadingStations(false);
    }
  };

  useEffect(() => {
    handleDetectLocation();
  }, []);

  // Refetch when distance or connector changes and we have coordinates
  const handleDistanceChange = (newDist: number) => {
    setDistanceKm(newDist);
    if (userLocation) {
      fetchNearbyStations(userLocation[0], userLocation[1], newDist, connectorFilter);
    }
  };

  const handleConnectorChange = (newConn: string) => {
    setConnectorFilter(newConn);
    if (userLocation) {
      fetchNearbyStations(userLocation[0], userLocation[1], distanceKm, newConn);
    }
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setDistanceKm(25);
    setConnectorFilter('All');
    setChargingType('All');
    setPowerRange('All');
    setSortBy('distance');
    if (userLocation) {
      fetchNearbyStations(userLocation[0], userLocation[1], 25, 'All');
    }
  };

  // Client-side filtering & sorting
  const filteredStations = stations.filter((st) => {
    // Search query filter (name, address, operator)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = st.station_name.toLowerCase().includes(q);
      const matchAddr = st.address.toLowerCase().includes(q);
      const matchOp = st.operator.toLowerCase().includes(q);
      if (!matchName && !matchAddr && !matchOp) return false;
    }

    // Charging Type filter (AC / DC)
    if (chargingType !== 'All') {
      const acdc = (st.ac_dc_type || '').toLowerCase();
      if (chargingType === 'DC' && !acdc.includes('dc') && st.charging_power < 30) {
        return false;
      }
      if (chargingType === 'AC' && !acdc.includes('ac') && st.charging_power >= 50) {
        return false;
      }
    }

    // Power Range filter
    if (powerRange === 'below_7' && st.charging_power >= 7) return false;
    if (powerRange === '7_22' && (st.charging_power < 7 || st.charging_power > 22)) return false;
    if (powerRange === '22_50' && (st.charging_power < 22 || st.charging_power > 50)) return false;
    if (powerRange === 'above_50' && st.charging_power <= 50) return false;

    return true;
  }).sort((a, b) => {
    if (sortBy === 'power') {
      return (b.charging_power || 0) - (a.charging_power || 0);
    }
    return (a.distance_km || 999) - (b.distance_km || 999);
  });

  return (
    <div className="w-full max-w-[1750px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-6">
      
      {/* Page Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold uppercase tracking-wider">
              MODULE FOUR: EV CHARGING STATIONS RADAR
            </span>
            <span className="text-xs text-slate-400">Open Charge Map & Live GPS Geolocation</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1 tracking-tight">
            EV Charging Stations & Interactive Radar
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-3xl">
            Locate genuine fast-charging stations around your actual GPS coordinates. Filter by connector standard, power rating, and distance corridor.
          </p>
        </div>

        {/* GPS Location Status Pill & Refresh / Locate Me Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-900/90 border border-cyan-500/30 text-xs font-mono text-cyan-300 flex items-center gap-2 shadow-lg">
            <span className={`w-2.5 h-2.5 rounded-full ${userLocation ? 'bg-cyan-400 animate-pulse' : 'bg-amber-400'}`} />
            <span>
              {userLocation 
                ? formatCoordinates(userLocation[0], userLocation[1]) 
                : locationStatus
              }
            </span>
          </div>

          <button
            onClick={handleDetectLocation}
            className="px-3 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 transition-all active:scale-95"
            title="Locate my position via browser GPS"
          >
            <LocateFixed className="w-4 h-4" />
            <span>Locate Me</span>
          </button>

          <button
            onClick={() => {
              if (userLocation) {
                fetchNearbyStations(userLocation[0], userLocation[1], distanceKm, connectorFilter);
              } else {
                handleDetectLocation();
              }
            }}
            disabled={isLoadingStations}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition-all"
            title="Refresh Stations list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStations ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* GPS Warning Notice if permission was denied */}
      {gpsError && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>{gpsError} A metro regional corridor is used as fallback. Click "Locate Me" anytime to grant GPS permissions.</span>
          </div>
          <button 
            onClick={() => setGpsError(null)} 
            className="text-amber-400 hover:text-white text-xs font-bold px-2 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* FILTERS & SEARCH CONTROL PANEL */}
      <div className="glass-panel p-5 rounded-2xl border border-cyan-500/25 space-y-4 shadow-xl">
        
        {/* Top Search Input & Sort Options */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by station name, network operator, or street address..."
              className="w-full pl-10 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
            {/* Sort Toggle */}
            <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
              <button
                onClick={() => setSortBy('distance')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  sortBy === 'distance' 
                    ? 'bg-cyan-500 text-black font-bold' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Nearest First
              </button>
              <button
                onClick={() => setSortBy('power')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  sortBy === 'power' 
                    ? 'bg-cyan-500 text-black font-bold' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Highest kW
              </button>
            </div>

            {/* Reset Filters */}
            <button
              onClick={handleResetFilters}
              className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-mono transition"
              title="Reset all search criteria"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Filter Matrix Rows */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80 text-xs">
          
          {/* 1. Distance Radius (5, 10, 25, 50, 100 km) */}
          <div>
            <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
              Search Radius
            </label>
            <div className="grid grid-cols-5 gap-1">
              {[5, 10, 25, 50, 100].map((d) => (
                <button
                  key={d}
                  onClick={() => handleDistanceChange(d)}
                  className={`py-1.5 rounded-lg font-mono font-medium text-xs transition ${
                    distanceKm === d
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/60 font-bold'
                      : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  {d}k
                </button>
              ))}
            </div>
          </div>

          {/* 2. Connector Type */}
          <div>
            <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
              Connector Standard
            </label>
            <select
              value={connectorFilter}
              onChange={(e) => handleConnectorChange(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/60 font-mono"
            >
              <option value="All">All Connectors</option>
              <option value="CCS2">CCS2 (Combo 2)</option>
              <option value="Type 2">Type 2 (Mennekes)</option>
              <option value="CHAdeMO">CHAdeMO</option>
              <option value="Bharat AC001">Bharat AC001</option>
              <option value="Bharat DC001">Bharat DC001</option>
              <option value="Tesla">Tesla (NACS) / Other</option>
            </select>
          </div>

          {/* 3. Charging Type (AC / DC) */}
          <div>
            <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
              Charging Speed Class
            </label>
            <div className="grid grid-cols-3 gap-1">
              {(['All', 'DC', 'AC'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setChargingType(t)}
                  className={`py-1.5 rounded-lg font-mono text-xs transition ${
                    chargingType === t
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/60 font-bold'
                      : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  {t === 'All' ? 'All' : t === 'DC' ? 'DC Fast' : 'AC L2'}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Power Output */}
          <div>
            <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
              Power Output (kW)
            </label>
            <select
              value={powerRange}
              onChange={(e) => setPowerRange(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/60 font-mono"
            >
              <option value="All">All Power Levels</option>
              <option value="below_7">&lt; 7 kW (Slow / AC)</option>
              <option value="7_22">7 – 22 kW (AC Standard)</option>
              <option value="22_50">22 – 50 kW (Rapid DC)</option>
              <option value="above_50">&gt; 50 kW (Ultra-Fast DC)</option>
            </select>
          </div>

        </div>

        {/* Results Counter Banner */}
        <div className="flex items-center justify-between text-xs font-mono text-slate-400 pt-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>
              Discovered <strong className="text-cyan-300">{filteredStations.length}</strong> matching stations within {distanceKm} km
            </span>
          </div>
          {isLoadingStations && (
            <div className="flex items-center gap-1.5 text-cyan-400 animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Querying Open Charge Map...</span>
            </div>
          )}
        </div>

      </div>

      {/* =========================================================================
          TWO-COLUMN LAYOUT: MAP (LEFT ~65%) & NEARBY STATIONS LIST (RIGHT ~35%)
          ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT SIDE: APPROXIMATELY 65% WIDTH (8 columns on desktop) */}
        <div className="lg:col-span-8 flex flex-col min-h-[580px] lg:min-h-[720px] space-y-3">
          
          <div className="w-full flex-1 min-h-[580px] lg:min-h-[700px]">
            <InteractiveMap
              stations={filteredStations}
              userLocation={userLocation}
              selectedStationId={selectedStation?.id}
              center={userLocation || [28.6139, 77.2090]}
              zoom={12}
              onSelectStation={(st) => setSelectedStation(st)}
              onLocateMe={handleDetectLocation}
              className="h-full w-full"
            />
          </div>

          {/* Quick Guidance Pill */}
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <span>📍 Blue pulse marker indicates your browser GPS. Pins indicate verified Open Charge Map stations.</span>
            <span className="text-cyan-400 font-semibold">{filteredStations.length} Markers on Map</span>
          </div>
        </div>

        {/* RIGHT SIDE: APPROXIMATELY 35% WIDTH (4 columns on desktop) */}
        <div className="lg:col-span-4 flex flex-col space-y-4">
          
          {/* STATION DETAILS PANEL (When selected) */}
          {selectedStation && (
            <div className="glass-panel p-4 rounded-2xl border border-cyan-500/50 shadow-2xl space-y-3 bg-gradient-to-b from-[#071B22] to-[#0A262E] animate-fadeIn">
              
              <div className="flex items-start justify-between border-b border-slate-800 pb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-bold uppercase">
                      {selectedStation.ac_dc_type || 'DC Fast'}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {selectedStation.operator}
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-white mt-1">
                    {selectedStation.station_name}
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                    {selectedStation.address}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedStation(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  title="Close Details Panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Metric Highlights */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Distance</span>
                  <span className="text-xs font-bold text-cyan-300 mt-0.5">
                    {selectedStation.distance_km !== undefined ? `${selectedStation.distance_km} km` : 'Near'}
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Peak Power</span>
                  <span className="text-xs font-bold text-emerald-400 mt-0.5">
                    {selectedStation.charging_power} kW
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Ports</span>
                  <span className="text-xs font-bold text-slate-200 mt-0.5">
                    {selectedStation.connections_count || 2} Plugs
                  </span>
                </div>
              </div>

              {/* Supported Connectors */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                  Available Connectors
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedStation.connector_types || [selectedStation.connector_type]).map((c, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded text-[11px] font-mono bg-cyan-950/40 text-cyan-300 border border-cyan-500/30 flex items-center gap-1"
                    >
                      <Zap className="w-2.5 h-2.5 text-cyan-400" />
                      <span>{c}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Pricing & Live Availability Statements (Strict Transparency) */}
              <div className="space-y-1.5 text-xs">
                <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400 font-mono text-[11px]">Pricing Tariff:</span>
                  <span className="text-slate-200 font-medium text-[11px]">
                    {selectedStation.pricing_text && selectedStation.pricing_text !== 'Pricing information unavailable.'
                      ? selectedStation.pricing_text
                      : 'Pricing information unavailable.'}
                  </span>
                </div>

                <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400 font-mono text-[11px]">Availability Status:</span>
                  <span className="text-slate-200 font-medium text-[11px]">
                    {selectedStation.availability_status && !selectedStation.availability_status.includes('not provided by the data source') && selectedStation.availability_status !== 'Not provided'
                      ? selectedStation.availability_status
                      : 'Live availability not provided by the data source.'}
                  </span>
                </div>

                <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>Data Provider:</span>
                  <span className="text-cyan-300">{selectedStation.data_source || 'Open Charge Map'}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedStation.latitude},${selectedStation.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-cyan-500/20"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Get Directions</span>
                </a>

                <button
                  onClick={() => {
                    navigate('/navigation', {
                      state: {
                        destinationCoords: [selectedStation.latitude, selectedStation.longitude],
                        destinationName: selectedStation.station_name
                      }
                    });
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center justify-center gap-1.5 transition-all"
                >
                  <Route className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Plan EV Route</span>
                </button>
              </div>

            </div>
          )}

          {/* NEARBY CHARGING STATIONS SCROLLABLE DIRECTORY */}
          <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex-1 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
              <div>
                <h2 className="text-sm font-bold text-white uppercase font-mono tracking-wider flex items-center gap-1.5">
                  <BatteryCharging className="w-4 h-4 text-cyan-400" />
                  <span>Nearby Charging Stations</span>
                </h2>
                <span className="text-[10px] text-slate-400 font-mono">
                  {filteredStations.length} facilities within {distanceKm} km radius
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                Sorted nearest
              </span>
            </div>

            {/* List of Station Cards */}
            <div className="space-y-3 overflow-y-auto max-h-[640px] scrollbar-thin pr-1 flex-1">
              {filteredStations.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <Compass className="w-10 h-10 text-cyan-400/60 mx-auto" />
                  <h4 className="text-sm font-bold text-white">No stations found in this radius</h4>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    No charging stations found within {distanceKm} km. Try expanding your search radius to 50 km or 100 km.
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      onClick={() => handleDistanceChange(50)}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-bold border border-cyan-500/40 transition"
                    >
                      Expand to 50 km
                    </button>
                    <button
                      onClick={() => handleDistanceChange(100)}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-bold border border-cyan-500/40 transition"
                    >
                      Expand to 100 km
                    </button>
                  </div>
                </div>
              ) : (
                filteredStations.map((st) => {
                  const isSelected = selectedStation?.id === st.id;
                  return (
                    <div
                      key={st.id}
                      onClick={() => setSelectedStation(st)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-2.5 ${
                        isSelected
                          ? 'bg-cyan-500/15 border-cyan-400 shadow-xl shadow-cyan-500/10'
                          : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/50'
                      }`}
                    >
                      {/* Card Header: Name, Power, Distance */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-xs sm:text-sm font-bold text-white leading-tight truncate">
                            {st.station_name}
                          </h3>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {st.address}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-xs font-bold font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 block">
                            {st.charging_power} kW
                          </span>
                          <span className="text-[11px] text-cyan-300 font-mono font-bold mt-1 block">
                            {st.distance_km !== undefined ? `${st.distance_km} km away` : ''}
                          </span>
                        </div>
                      </div>

                      {/* Operator & AC/DC Info */}
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-t border-slate-800/60 pt-1.5">
                        <span className="text-slate-300 font-medium truncate max-w-[150px]">
                          {st.operator}
                        </span>
                        <span className="text-cyan-400 font-semibold">
                          {st.ac_dc_type || 'DC Fast'} • {st.connections_count || 2} Plugs
                        </span>
                      </div>

                      {/* Connectors Badges */}
                      <div className="flex flex-wrap gap-1">
                        {(st.connector_types || [st.connector_type]).map((c, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-900 text-slate-300 border border-slate-800"
                          >
                            {c}
                          </span>
                        ))}
                      </div>

                      {/* Pricing & Status Line */}
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span>
                          Status: <strong className="text-slate-200">
                            {st.status_title && st.status_title !== 'Not provided' ? st.status_title : 'Operational'}
                          </strong>
                        </span>
                        <span>
                          Tariff: <strong className="text-slate-300">
                            {st.pricing_text && st.pricing_text !== 'Pricing information unavailable.' ? st.pricing_text : 'Not provided'}
                          </strong>
                        </span>
                      </div>

                      {/* Card Action Buttons */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedStation(st);
                          }}
                          className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 font-semibold"
                        >
                          View Specifications →
                        </button>

                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${st.latitude},${st.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-[11px] font-bold border border-cyan-500/30 flex items-center gap-1 transition"
                        >
                          <Navigation className="w-3 h-3" />
                          <span>Get Directions</span>
                        </a>
                      </div>

                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};

export default ChargingStationsPage;
