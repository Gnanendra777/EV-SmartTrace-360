import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Navigation, MapPin, Clock, BatteryCharging, Zap, ArrowRight, ShieldCheck, 
  CheckCircle2, AlertCircle, AlertTriangle, LocateFixed, Search, RotateCcw, 
  Trash2, PlusCircle, Car, Info, Sparkles
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { MapView } from '../components/map/MapView';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { formatCoordinates, searchPlaces } from '../services/locationService';
import { useLiveLocation } from '../hooks/useLiveLocation';
import { useNearbyStations } from '../hooks/useNearbyStations';
import { SmartRouteResult, ChargingStation, GeocodePlace } from '../types';

export const SmartNavigationPage: React.FC = () => {
  const { activeVehicle } = useAuth();
  const routeLocation = useLocation();

  // 1. Live GPS Location
  const {
    coords: userCoords,
    accuracy: userAccuracy,
    status: locationStatus,
    isApproximate,
    errorMessage: gpsError,
    locateMe,
  } = useLiveLocation();

  // 2. Destination State
  const [destinationCoords, setDestinationCoords] = useState<[number, number] | null>(null);
  const [destinationName, setDestinationName] = useState<string>('');
  const [destinationQuery, setDestinationQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<GeocodePlace[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState<boolean>(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 3. Waypoint / Intermediate Stop
  const [waypointStation, setWaypointStation] = useState<ChargingStation | null>(null);
  const [waypointCoords, setWaypointCoords] = useState<[number, number] | null>(null);

  // 4. Battery Parameters
  const [batteryPct, setBatteryPct] = useState<number>(activeVehicle?.current_battery_pct || 75);
  const [desiredArrivalPct, setDesiredArrivalPct] = useState<number>(15);

  // 5. Route Calculation Result
  const [smartRoute, setSmartRoute] = useState<SmartRouteResult | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedStationOnMap, setSelectedStationOnMap] = useState<ChargingStation | null>(null);

  // 6. Nearby Stations (available even before calculating a route)
  const {
    stations: nearbyStations,
    isLoading: isLoadingNearby,
    searchInArea,
  } = useNearbyStations({
    userCoords,
    radiusKm: 30,
  });

  // Handle incoming navigation destination from other pages (e.g. ChargingStationsPage)
  useEffect(() => {
    const routerState = routeLocation.state as {
      destinationCoords?: [number, number];
      destinationLat?: number;
      destinationLng?: number;
      destinationName?: string;
    } | null;

    if (routerState) {
      const destCoords: [number, number] | null = routerState.destinationCoords
        ? routerState.destinationCoords
        : routerState.destinationLat && routerState.destinationLng
        ? [routerState.destinationLat, routerState.destinationLng]
        : null;

      if (destCoords) {
        setDestinationCoords(destCoords);
        const name = routerState.destinationName || 'Selected Destination';
        setDestinationName(name);
        setDestinationQuery(name);

        if (userCoords) {
          calculateRoute(userCoords, destCoords, null);
        }
      }
    }
  }, [routeLocation.state, userCoords]);

  // Destination input geocoding search
  const handleDestinationInputChange = (val: string) => {
    setDestinationQuery(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (val.trim().length < 2) {
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

  // Quick Select Destination from Nearby Station
  const handleSelectNearbyAsDestination = (station: ChargingStation) => {
    setDestinationCoords([station.latitude, station.longitude]);
    setDestinationName(station.station_name);
    setDestinationQuery(station.station_name);
    if (userCoords) {
      calculateRoute(userCoords, [station.latitude, station.longitude], null);
    }
  };

  // Calculate Route via Backend OSRM + EV Battery Model
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
        origin_name: 'Current Location',
        destination_name: destinationName || destinationQuery || 'Destination',
        waypoints: waypoint ? [waypoint] : undefined,
        vehicle_id: activeVehicle?.id,
        current_battery_pct: batteryPct,
        desired_arrival_pct: desiredArrivalPct,
      });
      setSmartRoute(res);
    } catch (err: any) {
      console.error('Failed to calculate route:', err);
      const detail = err.response?.data?.detail;
      setErrorMessage(
        typeof detail === 'string'
          ? detail
          : 'Could not compute driving route. Please check coordinates and ensure a road path exists.'
      );
    } finally {
      setIsLoadingRoute(false);
    }
  };

  const handleTriggerCalculate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userCoords) {
      setErrorMessage('Starting GPS location is required. Please click "Locate Me".');
      return;
    }
    if (!destinationCoords) {
      setErrorMessage('Please search for and select a destination.');
      return;
    }
    calculateRoute(userCoords, destinationCoords, waypointCoords);
  };

  const handleAddWaypoint = (station: ChargingStation) => {
    const coords: [number, number] = [station.latitude, station.longitude];
    setWaypointStation(station);
    setWaypointCoords(coords);
    setSelectedStationOnMap(station);

    if (userCoords && destinationCoords) {
      calculateRoute(userCoords, destinationCoords, coords);
    }
  };

  const handleRemoveWaypoint = () => {
    setWaypointStation(null);
    setWaypointCoords(null);
    if (userCoords && destinationCoords) {
      calculateRoute(userCoords, destinationCoords, null);
    }
  };

  // Display stations: corridor chargers if route is calculated, otherwise nearby chargers
  const activeStationsList: ChargingStation[] = smartRoute?.recommended_charging_stops && smartRoute.recommended_charging_stops.length > 0
    ? smartRoute.recommended_charging_stops
    : nearbyStations;

  return (
    <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-5 lg:px-7 py-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold uppercase tracking-wider">
              SMART EV CORRIDOR NAVIGATOR
            </span>
            <span className="text-xs text-slate-400">
              Battery-aware routing, HVAC energy simulation & high-power charging stops
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white mt-1 tracking-tight">
            Intelligent EV Range & Navigation
          </h1>
        </div>

        {/* Active Vehicle Specs Pill */}
        {activeVehicle && (
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700 flex items-center space-x-2.5 text-xs">
            <Car className="w-4 h-4 text-cyan-400" />
            <div>
              <span className="text-white font-bold">{activeVehicle.vehicle_name}</span>
              <span className="text-[11px] text-slate-400 font-mono ml-2">
                {activeVehicle.battery_capacity} kWh · {activeVehicle.efficiency_kwh_km} kWh/km
              </span>
            </div>
          </div>
        )}
      </div>

      {/* GPS Warning if applicable */}
      {gpsError && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{gpsError}</span>
          </div>
          <button
            onClick={locateMe}
            className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 underline"
          >
            Locate Me
          </button>
        </div>
      )}

      {/* Route Setup Bar */}
      <form
        onSubmit={handleTriggerCalculate}
        className="bg-slate-900/90 p-3.5 sm:p-4 rounded-2xl border border-slate-800 space-y-3 shadow-xl backdrop-blur-md"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
          {/* Origin: Live GPS (col-span-4) */}
          <div className="lg:col-span-4 space-y-1">
            <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" />
              <span>Starting Location (Live GPS)</span>
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 flex items-center justify-between">
                <span className="truncate">
                  {userCoords
                    ? isApproximate
                      ? `IP Location (${formatCoordinates(userCoords[0], userCoords[1])})`
                      : `GPS (${formatCoordinates(userCoords[0], userCoords[1])})`
                    : 'Locating GPS position...'}
                </span>
                {userAccuracy && !isApproximate && (
                  <span className="text-[10px] text-slate-400 shrink-0 ml-1">±{userAccuracy}m</span>
                )}
              </div>
              <button
                type="button"
                onClick={locateMe}
                title="Locate me with GPS"
                className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors shrink-0"
              >
                <LocateFixed className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Destination Search & Dropdown (col-span-4) */}
          <div className="lg:col-span-4 space-y-1 relative">
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
                placeholder="Search destination, city, or charging station..."
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              {isSearching && (
                <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin absolute right-3 top-2.5" />
              )}
            </div>

            {/* Nominatim Search Dropdown Suggestions */}
            {showSearchDropdown && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-slate-900 border border-cyan-500/40 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                <div className="p-2 text-[10px] uppercase font-mono text-cyan-400 border-b border-slate-800">
                  Places
                </div>
                {searchResults.map((place, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectPlace(place)}
                    className="w-full text-left p-2.5 hover:bg-slate-800 border-b border-slate-800/80 last:border-0 transition text-xs flex flex-col space-y-0.5"
                  >
                    <span className="font-semibold text-white truncate">{place.display_name}</span>
                    <span className="text-[10px] text-slate-400">
                      Type: {place.type} · Lat: {place.lat.toFixed(4)}, Lon: {place.lon.toFixed(4)}
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
                className="w-full accent-emerald-400 cursor-pointer"
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
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Action Row */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-xs">
          {errorMessage ? (
            <span className="text-xs text-rose-400 flex items-center space-x-1.5 font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMessage}</span>
            </span>
          ) : (
            <span className="text-[11px] text-slate-400 font-mono">
              Shortest road routing via OSRM Engine · Battery thermal simulation
            </span>
          )}

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                setWaypointCoords(null);
                setWaypointStation(null);
                if (userCoords && destinationCoords) {
                  calculateRoute(userCoords, destinationCoords, null);
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 flex items-center space-x-1 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Stop</span>
            </button>

            <button
              type="submit"
              disabled={isLoadingRoute}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-emerald-500/20 hover:brightness-110 active:scale-95 transition flex items-center space-x-1.5 disabled:opacity-50"
            >
              <span>{isLoadingRoute ? 'Calculating...' : 'Calculate EV Route'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </form>

      {/* Active Waypoint Banner */}
      {waypointStation && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <span className="text-base">🔌</span>
            <div>
              <span className="text-amber-200 font-bold">
                Charging Stop Included: {waypointStation.station_name}
              </span>
              <span className="text-slate-400 ml-2">({waypointStation.charging_power} kW fast charger)</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemoveWaypoint}
            className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove</span>
          </button>
        </div>
      )}

      {/* Route Energy & Feasibility Dashboard if calculated */}
      {smartRoute && (
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3 shadow-xl">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <div className="text-[10px] text-slate-400 font-mono uppercase">Total Distance</div>
              <div className="text-lg font-bold text-white font-mono mt-0.5">{smartRoute.distance_km} km</div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <div className="text-[10px] text-slate-400 font-mono uppercase">Drive Time</div>
              <div className="text-lg font-bold text-cyan-300 font-mono mt-0.5">{smartRoute.duration_formatted}</div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <div className="text-[10px] text-slate-400 font-mono uppercase">Estimated Energy</div>
              <div className="text-lg font-bold text-amber-300 font-mono mt-0.5">{smartRoute.estimated_energy_kwh} kWh</div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <div className="text-[10px] text-slate-400 font-mono uppercase">Arrival SOC</div>
              <div
                className={`text-lg font-bold font-mono mt-0.5 ${
                  smartRoute.estimated_arrival_soc >= desiredArrivalPct
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }`}
              >
                {smartRoute.estimated_arrival_soc}%
              </div>
            </div>
          </div>

          <div
            className={`p-3 rounded-xl border text-xs flex items-center space-x-2 ${
              smartRoute.battery_sufficient
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}
          >
            {smartRoute.battery_sufficient ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span className="font-medium">{smartRoute.reserve_status}</span>
          </div>
        </div>
      )}

      {/* Main Map + Stations List Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-270px)] min-h-[580px]">
        {/* Map Column (col-span-8) */}
        <div className="lg:col-span-8 h-full rounded-2xl overflow-hidden">
          <MapView
            stations={activeStationsList}
            routeWaypoints={smartRoute?.geometry}
            userLocation={userCoords}
            userAccuracy={userAccuracy}
            destinationLocation={destinationCoords}
            waypointLocation={waypointCoords}
            selectedStationId={selectedStationOnMap?.id || waypointStation?.id}
            center={userCoords || [20.5937, 78.9629]}
            zoom={userCoords ? 13 : 5}
            onSelectStation={(s) => setSelectedStationOnMap(s)}
            onLocateMe={locateMe}
            onSearchThisArea={searchInArea}
            className="h-full rounded-2xl"
          />
        </div>

        {/* Stations Panel Column (col-span-4) */}
        <div className="lg:col-span-4 h-full rounded-2xl overflow-hidden bg-slate-900/90 border border-slate-800 flex flex-col shadow-2xl">
          <div className="p-3.5 border-b border-slate-800 bg-slate-900/70">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-1.5">
                  <BatteryCharging className="w-4 h-4 text-cyan-400" />
                  <span>
                    {smartRoute ? 'Corridor Fast-Chargers' : 'Nearby Charging Stations'}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  {smartRoute
                    ? 'Verified stops along selected driving path'
                    : 'Tap any station to set as destination or stop'}
                </p>
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold">
                {activeStationsList.length} Found
              </span>
            </div>
          </div>

          {/* List of Stations */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 p-2 space-y-2">
            {activeStationsList.length === 0 ? (
              <div className="text-center py-12 space-y-2 text-slate-400">
                <BatteryCharging className="w-8 h-8 text-cyan-400 mx-auto" />
                <p className="text-xs">No charging stations discovered.</p>
                <p className="text-[11px] text-slate-500">Allow GPS or enter a destination to explore stations.</p>
              </div>
            ) : (
              activeStationsList.map((station) => {
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
                        : 'border-slate-800 bg-slate-900/40 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-white truncate">{station.station_name}</div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold shrink-0">
                        {station.charging_power} kW
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 line-clamp-1">{station.address}</div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                      <span className="text-cyan-300 font-medium">{station.connector_type}</span>
                      <span>{station.operator}</span>
                    </div>

                    {/* Action buttons */}
                    <div className="pt-1 flex items-center justify-end gap-2">
                      {!smartRoute && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectNearbyAsDestination(station);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-[11px] font-semibold border border-emerald-500/30 transition"
                        >
                          Route Here
                        </button>
                      )}

                      {smartRoute && (
                        isWaypoint ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveWaypoint();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[11px] font-semibold border border-rose-500/30 transition"
                          >
                            Remove Stop
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddWaypoint(station);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-[11px] font-semibold border border-cyan-500/30 transition"
                          >
                            + Add as Stop
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmartNavigationPage;
