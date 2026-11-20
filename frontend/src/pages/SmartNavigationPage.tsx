import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Navigation, 
  MapPin, 
  Clock, 
  BatteryCharging, 
  Zap, 
  ArrowRight, 
  ShieldCheck, 
  CheckCircle2, 
  Layers,
  Sparkles,
  Compass,
  AlertCircle,
  AlertTriangle,
  LocateFixed,
  Search,
  RotateCcw,
  ExternalLink,
  Trash2,
  PlusCircle,
  Check,
  SlidersHorizontal,
  ChevronDown,
  Info,
  Car
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { InteractiveMap } from '../components/InteractiveMap';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { requestUserLocation, formatCoordinates, searchPlaces } from '../services/locationService';
import { SmartRouteResult, ChargingStation, GeocodePlace } from '../types';

export const SmartNavigationPage: React.FC = () => {
  const { activeVehicle } = useAuth();
  const routeLocation = useLocation();

  // Location & Origin State
  const [originCoords, setOriginCoords] = useState<[number, number] | null>(null);
  const [originName, setOriginName] = useState<string>('Detecting GPS Location...');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [gpsPermissionDenied, setGpsPermissionDenied] = useState<boolean>(false);

  // Destination State
  const [destinationCoords, setDestinationCoords] = useState<[number, number] | null>(null);
  const [destinationName, setDestinationName] = useState<string>('');
  const [destinationQuery, setDestinationQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<GeocodePlace[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState<boolean>(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Waypoint / Charging Stop
  const [waypointStation, setWaypointStation] = useState<ChargingStation | null>(null);
  const [waypointCoords, setWaypointCoords] = useState<[number, number] | null>(null);

  // Battery Parameters
  const [batteryPct, setBatteryPct] = useState<number>(activeVehicle?.current_battery_pct || 75);
  const [desiredArrivalPct, setDesiredArrivalPct] = useState<number>(15);

  // Route Calculation Result
  const [smartRoute, setSmartRoute] = useState<SmartRouteResult | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedStationOnMap, setSelectedStationOnMap] = useState<ChargingStation | null>(null);

  // 1. Detect Real Browser GPS Location on Mount
  const detectGps = useCallback(async () => {
    setIsLocating(true);
    setErrorMessage(null);
    try {
      const loc = await requestUserLocation();
      const coords: [number, number] = [loc.lat, loc.lng];
      setOriginCoords(coords);
      setGpsAccuracy(Math.round(loc.accuracy));
      setOriginName(`My GPS Location (${formatCoordinates(loc.lat, loc.lng)})`);
      setGpsPermissionDenied(false);
      return coords;
    } catch (err: any) {
      console.warn('Geolocation notice:', err.message);
      setGpsPermissionDenied(true);
      // Retain last known coordinates if available; never fabricate fake foreign coordinates
      setOriginCoords(prev => {
        if (prev) {
          setOriginName(`My GPS Location (Preserved: ${formatCoordinates(prev[0], prev[1])})`);
          return prev;
        }
        setOriginName('GPS Unavailable (Search destination or retry)');
        return null;
      });
      setGpsAccuracy(null);
      return null;
    } finally {
      setIsLocating(false);
    }
  }, []);

  // 2. Handle incoming state from ChargingStationsPage "Plan EV Route"
  useEffect(() => {
    const handleInitialLoad = async () => {
      const currentOrigin = await detectGps();
      
      const routerState = routeLocation.state as {
        destinationCoords?: [number, number];
        destinationName?: string;
      } | null;

      if (routerState?.destinationCoords) {
        setDestinationCoords(routerState.destinationCoords);
        setDestinationName(routerState.destinationName || 'Selected Charging Station');
        setDestinationQuery(routerState.destinationName || 'Selected Charging Station');
        
        // Auto-calculate route to the selected charging station only
        if (currentOrigin) {
          calculateRoute(currentOrigin, routerState.destinationCoords, null);
        }
      } else {
        // Destination starts empty - no automatic North American route
        setDestinationCoords(null);
        setDestinationName('');
        setDestinationQuery('');
        setSmartRoute(null);
      }
    };

    handleInitialLoad();
  }, [detectGps, routeLocation.state]);

  // Sync batteryPct if activeVehicle changes
  useEffect(() => {
    if (activeVehicle?.current_battery_pct) {
      setBatteryPct(Math.round(activeVehicle.current_battery_pct));
    }
  }, [activeVehicle]);

  // 3. Search Destinations with Nominatim (Debounced)
  const handleDestinationInputChange = (val: string) => {
    setDestinationQuery(val);
    setErrorMessage(null);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (!val || val.trim().length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const places = await searchPlaces(val);
        setSearchResults(places);
        setShowSearchDropdown(places.length > 0);
      } catch (e) {
        console.warn('Destination search error:', e);
      } finally {
        setIsSearching(false);
      }
    }, 450);
  };

  const handleSelectPlace = (place: GeocodePlace) => {
    setDestinationCoords([place.lat, place.lon]);
    setDestinationName(place.display_name.split(',')[0]);
    setDestinationQuery(place.display_name);
    setShowSearchDropdown(false);
  };

  // 4. Calculate Route via Backend OSRM + EV Battery Model
  const calculateRoute = async (
    start: [number, number],
    end: [number, number],
    waypoint: [number, number] | null
  ) => {
    if (!start || !end) {
      setErrorMessage('Please provide both starting location and a valid destination.');
      return;
    }

    if (Math.abs(start[0] - end[0]) < 0.0001 && Math.abs(start[1] - end[1]) < 0.0001) {
      setErrorMessage('Starting location and destination are identical. Please enter a different destination.');
      return;
    }

    setIsLoadingRoute(true);
    setErrorMessage(null);
    try {
      const res = await api.calculateSmartRoute({
        origin_lat: start[0],
        origin_lng: start[1],
        destination_lat: end[0],
        destination_lng: end[1],
        origin_name: originName,
        destination_name: destinationName || destinationQuery || 'Destination',
        waypoints: waypoint ? [waypoint] : undefined,
        vehicle_id: activeVehicle?.id,
        current_battery_pct: batteryPct,
        desired_arrival_pct: desiredArrivalPct
      });
      setSmartRoute(res);
    } catch (err: any) {
      console.error('Failed to calculate route:', err);
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string') {
        setErrorMessage(detail);
      } else {
        setErrorMessage('Could not compute driving route. Please check coordinates and ensure a road path exists.');
      }
    } finally {
      setIsLoadingRoute(false);
    }
  };

  const handleTriggerCalculate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!originCoords) {
      setErrorMessage('Starting GPS location is required. Please click "Use GPS" to detect your position.');
      return;
    }
    if (!destinationCoords) {
      setErrorMessage('Please search for and select a destination from the search box.');
      return;
    }
    calculateRoute(originCoords, destinationCoords, waypointCoords);
  };


  // 5. Waypoint / Intermediate Charging Stop Actions
  const handleAddWaypoint = (station: ChargingStation) => {
    const coords: [number, number] = [station.latitude, station.longitude];
    setWaypointStation(station);
    setWaypointCoords(coords);
    setSelectedStationOnMap(station);

    if (originCoords && destinationCoords) {
      calculateRoute(originCoords, destinationCoords, coords);
    }
  };

  const handleRemoveWaypoint = () => {
    setWaypointStation(null);
    setWaypointCoords(null);
    if (originCoords && destinationCoords) {
      calculateRoute(originCoords, destinationCoords, null);
    }
  };

  // 6. External Turn-by-Turn Navigation Link
  const getDirectionsExternalUrl = () => {
    if (!originCoords || !destinationCoords) return '#';
    let url = `https://www.google.com/maps/dir/?api=1&origin=${originCoords[0]},${originCoords[1]}&destination=${destinationCoords[0]},${destinationCoords[1]}&travelmode=driving`;
    if (waypointCoords) {
      url += `&waypoints=${waypointCoords[0]},${waypointCoords[1]}`;
    }
    return url;
  };

  return (
    <div className="w-full max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase tracking-wider">
              MODULE FIVE • SMART EV NAVIGATION
            </span>
            <span className="text-xs text-slate-400">Battery-Aware Range & Corridor Planner</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1 tracking-tight">
            Intelligent EV Range & Charging Stop Navigator
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-3xl">
            Real-world road navigation powered by OSRM and OpenStreetMap. Automatically factors vehicle battery chemistry, regenerative braking, thermal HVAC load, and corridor fast-chargers via Open Charge Map.
          </p>
        </div>

        {/* Active Vehicle Specs Pill */}
        {activeVehicle && (
          <div className="glass-panel px-4 py-2.5 rounded-xl border border-cyan-500/20 flex items-center space-x-3 text-xs">
            <Car className="w-4 h-4 text-cyan-400" />
            <div>
              <div className="text-white font-bold">{activeVehicle.vehicle_name}</div>
              <div className="text-[11px] font-mono text-slate-400">
                {activeVehicle.battery_capacity} kWh Battery • {activeVehicle.efficiency_kwh_km} kWh/km
              </div>
            </div>
          </div>
        )}
      </div>

      {/* GPS Status Notice if Denied */}
      {gpsPermissionDenied && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              GPS location permission was denied or unavailable. A standard metro starting corridor is used as fallback. You can click <strong>Use GPS</strong> anytime to prompt again.
            </span>
          </div>
          <button
            onClick={detectGps}
            className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold rounded-lg transition"
          >
            Retry GPS
          </button>
        </div>
      )}

      {/* Itinerary Configuration & Battery Sliders Panel */}
      <form onSubmit={handleTriggerCalculate} className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4 shadow-xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* Starting Corridor / GPS Origin (col-span-4) */}
          <div className="lg:col-span-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-slate-300 flex items-center space-x-1.5">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                <span>Starting Corridor (GPS)</span>
              </label>
              {gpsAccuracy && (
                <span className="text-[10px] font-mono text-emerald-400 font-bold">
                  Fixed ±{gpsAccuracy}m
                </span>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                readOnly
                value={originName}
                className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-3 pr-24 py-2.5 text-xs text-slate-100 font-mono focus:outline-none"
              />
              <button
                type="button"
                onClick={detectGps}
                disabled={isLocating}
                className="absolute right-1.5 top-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-[11px] font-bold border border-cyan-500/30 flex items-center space-x-1 transition disabled:opacity-50"
                title="Detect my real browser GPS position"
              >
                <LocateFixed className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                <span>{isLocating ? 'Locating...' : 'Use GPS'}</span>
              </button>
            </div>
          </div>

          {/* Destination Search & Dropdown (col-span-4) */}
          <div className="lg:col-span-4 space-y-1.5 relative">
            <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
              <Navigation className="w-3.5 h-3.5 text-emerald-400" />
              <span>Destination Terminal</span>
            </label>

            <div className="relative">
              <input
                type="text"
                required
                value={destinationQuery}
                onChange={(e) => handleDestinationInputChange(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setShowSearchDropdown(true);
                }}
                placeholder="Search place, city or terminal (Nominatim)..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-8 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60 transition"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              {isSearching && (
                <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin absolute right-3 top-3" />
              )}
            </div>

            {/* Nominatim Search Dropdown Suggestions */}
            {showSearchDropdown && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[#06151B] border border-cyan-500/40 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                <div className="p-2 text-[10px] uppercase font-mono text-cyan-400 border-b border-slate-800/80">
                  OpenStreetMap Nominatim Places
                </div>
                {searchResults.map((place, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectPlace(place)}
                    className="w-full text-left p-2.5 hover:bg-slate-800/70 border-b border-slate-900/60 last:border-0 transition text-xs flex flex-col space-y-0.5"
                  >
                    <span className="font-semibold text-white truncate">{place.display_name}</span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Type: {place.type} • Lat: {place.lat.toFixed(4)}, Lon: {place.lon.toFixed(4)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Battery Departure & Arrival Safety Buffer (col-span-4) */}
          <div className="lg:col-span-4 grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Departure SOC</span>
                <span className="font-mono text-emerald-400 font-bold">{batteryPct}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                value={batteryPct}
                onChange={(e) => setBatteryPct(Number(e.target.value))}
                className="w-full accent-emerald-400 cursor-pointer pt-1"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Arrival Buffer</span>
                <span className="font-mono text-cyan-400 font-bold">{desiredArrivalPct}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="35"
                value={desiredArrivalPct}
                onChange={(e) => setDesiredArrivalPct(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer pt-1"
              />
            </div>
          </div>

        </div>

        {/* Destination Status Strip */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-800/80 text-xs">
          <div className="flex items-center space-x-1.5 text-[11px] text-slate-400 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span>Search any destination worldwide. Road driving route and EV battery envelope are computed from your GPS position.</span>
          </div>
          {destinationCoords && (
            <span className="text-[11px] font-mono text-emerald-400 font-bold">
              Target: {formatCoordinates(destinationCoords[0], destinationCoords[1])}
            </span>
          )}
        </div>

        {/* Form Action Buttons */}
        <div className="flex items-center justify-between pt-1">
          {errorMessage ? (
            <span className="text-xs text-rose-400 flex items-center space-x-1.5 font-medium">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{errorMessage}</span>
            </span>
          ) : (
            <span className="text-[11px] text-slate-400 font-mono">
              Road routes computed with real turn geometry from OSRM Project.
            </span>
          )}

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                setWaypointCoords(null);
                setWaypointStation(null);
                if (originCoords && destinationCoords) {
                  calculateRoute(originCoords, destinationCoords, null);
                }
              }}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 flex items-center space-x-1 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Stops</span>
            </button>

            <button
              type="submit"
              disabled={isLoadingRoute}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-emerald-500/20 hover:brightness-110 active:scale-95 transition flex items-center space-x-2 disabled:opacity-50"
            >
              <span>{isLoadingRoute ? 'Computing Route & Energy...' : 'Calculate EV Route'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </form>

      {/* Active Waypoint Banner (If Intermediate Stop Added) */}
      {waypointStation && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 font-bold">
              🔌
            </div>
            <div>
              <div className="text-amber-200 font-bold flex items-center space-x-2">
                <span>Waypoint Stop Included: {waypointStation.station_name}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 font-bold">
                  {waypointStation.charging_power} kW
                </span>
              </div>
              <div className="text-[11px] text-amber-300/80">
                Route polyline and energy envelope recalculated through this charging waypoint.
              </div>
            </div>
          </div>
          <button
            onClick={handleRemoveWaypoint}
            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold border border-rose-500/30 flex items-center space-x-1 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove Stop</span>
          </button>
        </div>
      )}

      {/* Journey & Battery Intelligence Dashboard Card */}
      {smartRoute && (
        <div className="glass-panel p-5 rounded-2xl border border-cyan-500/30 space-y-4 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-bold">
                Computed Road Itinerary & Battery Prediction
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center space-x-2">
                <span>{smartRoute.origin_name.split(',')[0]}</span>
                <ArrowRight className="w-4 h-4 text-emerald-400" />
                {smartRoute.charging_stop_included && (
                  <>
                    <span className="text-amber-400 font-mono text-sm">[⚡ {smartRoute.charging_stop_included.station_name}]</span>
                    <ArrowRight className="w-4 h-4 text-emerald-400" />
                  </>
                )}
                <span>{smartRoute.destination_name.split(',')[0]}</span>
              </h2>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center space-x-2">
              <a
                href={getDirectionsExternalUrl()}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold text-xs tracking-wide shadow-md shadow-cyan-500/20 hover:brightness-110 active:scale-95 transition flex items-center space-x-1.5"
              >
                <span>Turn-by-Turn Navigation</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Key EV Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            
            <div className="glass-panel p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center space-x-1">
                <Navigation className="w-3 h-3 text-cyan-400" />
                <span>Road Distance</span>
              </div>
              <div className="text-lg font-bold text-white font-mono">
                {smartRoute.distance_km} <span className="text-xs text-slate-400 font-normal">km</span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono">OSRM Precise Highway</div>
            </div>

            <div className="glass-panel p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center space-x-1">
                <Clock className="w-3 h-3 text-emerald-400" />
                <span>Estimated Time</span>
              </div>
              <div className="text-lg font-bold text-cyan-300 font-mono">
                {smartRoute.duration_formatted}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">Speed-adjusted travel</div>
            </div>

            <div className="glass-panel p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center space-x-1">
                <Zap className="w-3 h-3 text-amber-400" />
                <span>Required Energy</span>
              </div>
              <div className="text-lg font-bold text-amber-300 font-mono">
                {smartRoute.estimated_energy_kwh} <span className="text-xs text-slate-400 font-normal">kWh</span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono">5% HVAC Buffer Incl.</div>
            </div>

            <div className="glass-panel p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center space-x-1">
                <BatteryCharging className="w-3 h-3 text-rose-400" />
                <span>Battery Used</span>
              </div>
              <div className="text-lg font-bold text-rose-400 font-mono">
                -{smartRoute.estimated_battery_pct_used}%
              </div>
              <div className="text-[10px] text-slate-500 font-mono">From Departure SOC</div>
            </div>

            <div className="glass-panel p-3 rounded-xl border border-slate-800 space-y-1 col-span-2 md:col-span-1">
              <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center space-x-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>Arrival SOC</span>
              </div>
              <div className={`text-lg font-bold font-mono ${
                smartRoute.estimated_arrival_soc >= desiredArrivalPct 
                  ? 'text-emerald-400' 
                  : smartRoute.estimated_arrival_soc >= 5 
                  ? 'text-amber-400' 
                  : 'text-rose-400'
              }`}>
                {smartRoute.estimated_arrival_soc}%
              </div>
              <div className="text-[10px] text-slate-500 font-mono">Target: {desiredArrivalPct}%</div>
            </div>

          </div>

          {/* Reserve Status Banner */}
          <div className={`p-3 rounded-xl border text-xs flex items-center space-x-2.5 ${
            smartRoute.battery_sufficient
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : smartRoute.estimated_arrival_soc >= 5
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            {smartRoute.battery_sufficient ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : smartRoute.estimated_arrival_soc >= 5 ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            )}
            <span className="font-medium">{smartRoute.reserve_status}</span>
          </div>

          {/* Model Assumptions Disclaimer */}
          <div className="text-[11px] text-slate-400/90 leading-relaxed font-mono flex items-start space-x-1.5 pt-1">
            <Info className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />
            <span>{smartRoute.assumptions_disclaimer}</span>
          </div>
        </div>
      )}

      {/* Guide Banner When No Destination Has Been Calculated */}
      {!smartRoute && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 text-center space-y-3 shadow-xl bg-gradient-to-b from-[#06151B]/80 to-[#0A1F26]/70 animate-fadeIn">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto">
            <Navigation className="w-6 h-6" />
          </div>
          <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
            Search a Destination Above to Calculate EV Driving Route & Energy Requirements
          </h2>
          <p className="text-xs text-slate-400 max-w-xl mx-auto leading-relaxed">
            Enter any city, landmark, or address into the Destination Terminal field. The Intelligent Navigator will compute the road trajectory using OSRM, simulate battery state-of-charge with HVAC buffers, and locate verified corridor fast-charging hubs along the way.
          </p>
        </div>
      )}

      {/* Main Map & Charging Stops Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Interactive Map Visualizer (col-span-8) */}
        <div className="lg:col-span-8 h-[540px] w-full">
          <InteractiveMap
            stations={smartRoute?.recommended_charging_stops || []}
            routeWaypoints={smartRoute?.geometry || []}
            userLocation={originCoords}
            destinationLocation={destinationCoords}
            waypointLocation={waypointCoords}
            selectedStationId={selectedStationOnMap?.id || waypointStation?.id}
            center={originCoords || [20.5937, 78.9629]}
            zoom={originCoords ? 12 : 5}
            onSelectStation={(s) => setSelectedStationOnMap(s)}
            onLocateMe={detectGps}
          />
        </div>

        {/* Charging Stops Along Corridor (col-span-4) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-3 max-h-[540px] flex flex-col shadow-xl">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-1.5">
                  <BatteryCharging className="w-4 h-4 text-cyan-400" />
                  <span>Corridor Fast-Chargers</span>
                </h3>
                <p className="text-[10px] text-slate-400 font-mono">
                  Verified Open Charge Map stops along route
                </p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold">
                {smartRoute?.recommended_charging_stops.length || 0} Found
              </span>
            </div>

            {/* List of Corridor Stations */}
            <div className="overflow-y-auto space-y-2.5 pr-1 flex-1">
              {smartRoute?.recommended_charging_stops && smartRoute.recommended_charging_stops.length > 0 ? (
                smartRoute.recommended_charging_stops.map((station) => {
                  const isWaypoint = waypointStation?.id === station.id;
                  const isSelected = selectedStationOnMap?.id === station.id;

                  return (
                    <div
                      key={station.id}
                      onClick={() => setSelectedStationOnMap(station)}
                      className={`p-3 rounded-xl border transition cursor-pointer text-xs space-y-2 ${
                        isWaypoint
                          ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                          : isSelected
                          ? 'border-cyan-500 bg-cyan-500/10'
                          : 'border-slate-800/80 bg-slate-900/60 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="font-bold text-white truncate max-w-[190px]">
                          {station.station_name}
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold">
                          {station.charging_power} kW
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-400 truncate">
                        {station.address}
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-slate-800/60">
                        <span className="text-cyan-300 font-semibold">{station.connector_type}</span>
                        <span className="text-slate-400">{station.operator}</span>
                      </div>

                      <div className="text-[10px] text-slate-400">
                        Pricing: <span className="text-slate-300">{station.pricing_text && station.pricing_text !== 'Pricing information unavailable.' ? station.pricing_text : 'Not provided'}</span>
                      </div>

                      {/* Add or Remove Waypoint Button */}
                      <div className="pt-1 flex items-center justify-end">
                        {isWaypoint ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveWaypoint();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[11px] font-bold border border-rose-500/30 flex items-center space-x-1 transition"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Remove Stop</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddWaypoint(station);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-[11px] font-bold border border-cyan-500/30 flex items-center space-x-1 transition"
                          >
                            <PlusCircle className="w-3 h-3" />
                            <span>Add as Route Stop</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-10 space-y-2 text-slate-400">
                  <Compass className="w-8 h-8 text-cyan-400 mx-auto" />
                  <p className="text-xs">No corridor chargers discovered for current route.</p>
                  <p className="text-[10px] text-slate-500">Calculate a route to discover Open Charge Map corridor stations.</p>
                </div>
              )}
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};
