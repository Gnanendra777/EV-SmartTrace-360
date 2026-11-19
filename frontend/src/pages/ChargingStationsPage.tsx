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
  Route
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
  const [locationStatus, setLocationStatus] = useState<string>('Requesting GPS location...');
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [manualCity, setManualCity] = useState<string>('');

  // Station Data State
  const [stations, setStations] = useState<ChargingStation[]>([]);
  const [selectedStation, setSelectedStation] = useState<ChargingStation | null>(null);
  const [isLoadingStations, setIsLoadingStations] = useState<boolean>(false);

  // Filters State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [distanceKm, setDistanceKm] = useState<number>(25);
  const [connectorFilter, setConnectorFilter] = useState<string>('All');
  const [chargingType, setChargingType] = useState<'All' | 'AC' | 'DC'>('All');
  const [powerRange, setPowerRange] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'distance' | 'power'>('distance');

  // Trigger GPS location on mount
  const handleDetectLocation = useCallback(async () => {
    setGpsError(null);
    setLocationStatus('Acquiring precise GPS coordinates...');
    try {
      const loc = await requestUserLocation();
      setUserLocation([loc.lat, loc.lng]);
      setLocationAccuracy(Math.round(loc.accuracy));
      setLocationStatus(`GPS Verified (±${Math.round(loc.accuracy)}m)`);
      fetchNearbyStations(loc.lat, loc.lng, distanceKm, connectorFilter);
    } catch (err: any) {
      console.warn('Geolocation error:', err.message);
      setGpsError(err.message || 'Unable to retrieve location.');
      setLocationStatus('GPS Unavailable');
      // If user has no GPS, provide fallback search near default coordinate
      if (!userLocation) {
        const fallbackLat = 28.6139;
        const fallbackLng = 77.2090;
        setUserLocation([fallbackLat, fallbackLng]);
        fetchNearbyStations(fallbackLat, fallbackLng, distanceKm, connectorFilter);
      }
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
      }
    } catch (e) {
      console.error('Error fetching charging stations:', e);
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
    <div className="w-full max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-6">
      
      {/* Page Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold">
              MODULE FOUR: REAL-TIME EV CHARGING RADAR
            </span>
            <span className="text-xs text-slate-400">Open Charge Map & Live GPS Engine</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
            EV Charging Stations & Interactive Radar
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-3xl">
            Locate verified fast-charging stations near your real GPS coordinates. Filter by connector type, charging power, distance radius, and view comprehensive facility specifications.
          </p>
        </div>

        {/* GPS Location Status Pill & Locate Me Button */}
        <div className="flex items-center gap-3">
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
            className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 transition-all active:scale-95"
            title="Refresh My GPS Location"
          >
            <LocateFixed className="w-4 h-4" />
            <span>Locate Me</span>
          </button>
        </div>
      </div>

      {/* GPS Warning Notice if permission was denied */}
      {gpsError && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>{gpsError} Default search coordinates applied. Click "Locate Me" to allow GPS access.</span>
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
      <div className="glass-panel p-5 rounded-2xl border border-cyan-500/25 space-y-4">
        
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
                Highest kW Power
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
          
          {/* 1. Distance Radius */}
          <div>
            <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
              Search Radius
            </label>
            <div className="grid grid-cols-4 gap-1">
              {[5, 10, 25, 50].map((d) => (
                <button
                  key={d}
                  onClick={() => handleDistanceChange(d)}
                  className={`py-1.5 rounded-lg font-mono font-medium text-xs transition ${
                    distanceKm === d
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/60 font-bold'
                      : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  {d} km
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
              <option value="Tesla">Tesla (NACS)</option>
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
              <option value="below_7">&lt; 7 kW (Slow / Home)</option>
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
          MAIN INTERACTIVE MAP & DETAILS PANEL SECTION
          ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* LEFT / CENTER: INTERACTIVE LEAFLET OPENSTREETMAP (8 columns) */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col min-h-[500px] lg:min-h-[620px]">
          <InteractiveMap
            stations={filteredStations}
            userLocation={userLocation}
            selectedStationId={selectedStation?.id}
            onSelectStation={(st) => setSelectedStation(st)}
            onLocateMe={handleDetectLocation}
            defaultLayer="cyber"
            className="w-full h-full min-h-[500px] lg:min-h-[620px]"
          />
        </div>

        {/* RIGHT: SELECTED STATION DETAILS & NEARBY LIST (4 columns) */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col space-y-4">
          
          {/* STATION DETAILS PANEL (When selected) */}
          {selectedStation ? (
            <div className="glass-panel p-5 rounded-2xl border border-cyan-500/40 shadow-2xl space-y-4 bg-gradient-to-b from-[#071B22] to-[#0A262E]">
              
              <div className="flex items-start justify-between border-b border-slate-800 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-bold uppercase">
                      {selectedStation.ac_dc_type || 'DC Fast'}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {selectedStation.operator}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white mt-1">
                    {selectedStation.station_name}
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                    {selectedStation.address}
                  </p>
                </div>
              </div>

              {/* Metric Highlights */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Distance</span>
                  <span className="text-sm font-bold text-cyan-300 mt-0.5">
                    {selectedStation.distance_km !== undefined ? `${selectedStation.distance_km} km` : 'Near'}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Peak Power</span>
                  <span className="text-sm font-bold text-emerald-400 mt-0.5">
                    {selectedStation.charging_power} kW
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Ports Count</span>
                  <span className="text-sm font-bold text-slate-200 mt-0.5">
                    {selectedStation.connections_count || 2} Plugs
                  </span>
                </div>
              </div>

              {/* Supported Connectors */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                  Available Connectors
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedStation.connector_types || [selectedStation.connector_type]).map((c, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-lg text-xs font-mono bg-cyan-950/40 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5"
                    >
                      <Zap className="w-3 h-3 text-cyan-400" />
                      <span>{c}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Pricing & Live Availability Statements (Strict Transparency) */}
              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400 font-mono">Pricing Tariff:</span>
                  <span className="text-slate-200 font-medium">
                    {selectedStation.pricing_text || 'Pricing information unavailable.'}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400 font-mono">Real-Time Occupancy:</span>
                  <span className="text-slate-400 italic">
                    Live availability not provided by the data source.
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>Data Provider:</span>
                  <span className="text-cyan-300">{selectedStation.data_source || 'Open Charge Map'}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                
                {/* External Maps Turn-by-Turn Directions */}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedStation.latitude},${selectedStation.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-cyan-500/20"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Get Directions</span>
                </a>

                {/* Plan Route in Smart Navigation */}
                <button
                  onClick={() => {
                    navigate('/navigation', {
                      state: {
                        destinationCoords: [selectedStation.latitude, selectedStation.longitude],
                        destinationName: selectedStation.station_name
                      }
                    });
                  }}
                  className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center justify-center gap-1.5 transition-all"
                >
                  <Route className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Plan EV Route</span>
                </button>

              </div>

            </div>
          ) : (
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 text-center space-y-2">
              <Compass className="w-8 h-8 text-cyan-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">Select a Station</h4>
              <p className="text-xs text-slate-400">
                Click any marker on the map to inspect charging connectors, power rating, and directions.
              </p>
            </div>
          )}

          {/* NEARBY STATIONS SCROLLABLE LIST */}
          <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex-1 flex flex-col min-h-[280px]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider">
                Nearby Station Directory ({filteredStations.length})
              </h4>
              <span className="text-[10px] text-slate-500 font-mono">Ranked by {sortBy}</span>
            </div>

            <div className="space-y-2 overflow-y-auto max-h-[320px] scrollbar-thin pr-1 flex-1">
              {filteredStations.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500 font-mono">
                  No charging stations found matching current filters.
                </div>
              ) : (
                filteredStations.map((st) => (
                  <div
                    key={st.id}
                    onClick={() => setSelectedStation(st)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      selectedStation?.id === st.id
                        ? 'bg-cyan-500/15 border-cyan-400 shadow-md shadow-cyan-500/10'
                        : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h5 className="text-xs font-bold text-white leading-tight">
                          {st.station_name}
                        </h5>
                        <p className="text-[11px] text-slate-400 truncate max-w-[200px] mt-0.5">
                          {st.address}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-xs font-bold font-mono text-emerald-400">
                          {st.charging_power} kW
                        </span>
                        <span className="text-[10px] text-slate-400 block font-mono">
                          {st.distance_km !== undefined ? `${st.distance_km} km` : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};

export default ChargingStationsPage;