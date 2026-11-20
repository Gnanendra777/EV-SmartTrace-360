import React, { useState, useEffect } from 'react';
import { 
  Zap, Navigation, AlertCircle, LocateFixed, RefreshCw, Route as RouteIcon, Info, Search, X, CheckCircle2
} from 'lucide-react';
import { MapView } from '../components/map/MapView';
import { StationsPanel, STATIONS_PANEL_SIDE } from '../components/StationsPanel';
import { useLiveLocation } from '../hooks/useLiveLocation';
import { useNearbyStations } from '../hooks/useNearbyStations';
import { ChargingStation, GeocodePlace } from '../types';
import { api } from '../services/api';
import { searchPlaces } from '../services/locationService';

export const ChargingStationsPage: React.FC = () => {
  // 1. Live GPS Location
  const {
    coords: userLocation,
    accuracy: userAccuracy,
    status: locationStatus,
    source: locationSource,
    isApproximate,
    errorMessage: gpsError,
    locateMe,
  } = useLiveLocation();

  // 2. Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [distanceKm, setDistanceKm] = useState<number>(25);
  const [connectorFilter, setConnectorFilter] = useState<string>('All');
  const [minPowerFilter, setMinPowerFilter] = useState<number>(0);
  const [updateOnMove, setUpdateOnMove] = useState<boolean>(true);

  // 3. Stations Hook
  const {
    stations,
    isLoading: isLoadingStations,
    isOfflineSample,
    searchInArea,
    refresh: refreshStations,
  } = useNearbyStations({
    userCoords: userLocation,
    radiusKm: distanceKm,
    connectorFilter,
    minPowerFilter,
    searchQuery,
  });

  const [selectedStation, setSelectedStation] = useState<ChargingStation | null>(null);

  // 4. Driving Route to Selected Station State
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | undefined>(undefined);
  const [routeInfo, setRouteInfo] = useState<{
    distance_km: number;
    duration_formatted: string;
    is_osrm: boolean;
    destination_name: string;
  } | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState<boolean>(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // 5. Custom Destination Route Planner
  const [showTripPlanner, setShowTripPlanner] = useState<boolean>(false);
  const [tripDestinationQuery, setTripDestinationQuery] = useState<string>('');
  const [tripSearchResults, setTripSearchResults] = useState<GeocodePlace[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState<boolean>(false);

  // Select first station when loaded
  useEffect(() => {
    if (stations.length > 0 && !selectedStation) {
      setSelectedStation(stations[0]);
    }
  }, [stations, selectedStation]);

  // Route to selected station using real road coordinates and OSRM
  const handleRouteToStation = async (station: ChargingStation) => {
    setSelectedStation(station);
    setRouteError(null);

    if (!userLocation) {
      locateMe();
      setRouteError('Acquiring your live GPS position... Please allow location access and try again.');
      return;
    }

    setIsCalculatingRoute(true);
    try {
      const res = await api.getDirectionsRoute(
        userLocation[0],
        userLocation[1],
        station.latitude,
        station.longitude
      );
      setRouteGeometry(res.geometry);
      setRouteInfo({
        distance_km: res.distance_km,
        duration_formatted: res.duration_formatted,
        is_osrm: res.is_osrm,
        destination_name: station.station_name,
      });
    } catch (e) {
      console.warn('Failed to calculate route to station:', e);
      setRouteError('Could not compute driving route via OSRM. Please check network connectivity and try again.');
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  // Custom trip search handler
  const handleSearchTripDestination = async (query: string) => {
    setTripDestinationQuery(query);
    if (!query || query.trim().length < 3) {
      setTripSearchResults([]);
      return;
    }
    setIsSearchingPlaces(true);
    try {
      const results = await searchPlaces(query);
      setTripSearchResults(results);
    } catch {
      setTripSearchResults([]);
    } finally {
      setIsSearchingPlaces(false);
    }
  };

  const handleSelectTripDestination = async (place: GeocodePlace) => {
    setTripSearchResults([]);
    setTripDestinationQuery(place.display_name);
    setRouteError(null);

    if (!userLocation) {
      locateMe();
      setRouteError('Acquiring your live GPS position to plan route...');
      return;
    }

    setIsCalculatingRoute(true);
    try {
      const res = await api.getDirectionsRoute(
        userLocation[0],
        userLocation[1],
        place.lat,
        place.lon
      );
      setRouteGeometry(res.geometry);
      setRouteInfo({
        distance_km: res.distance_km,
        duration_formatted: res.duration_formatted,
        is_osrm: res.is_osrm,
        destination_name: place.display_name.split(',')[0],
      });
    } catch (e) {
      console.warn('Failed to calculate trip route:', e);
      setRouteError('Could not calculate route to selected destination.');
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  const handleExpandRadius = () => {
    setDistanceKm(50);
  };

  return (
    <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-5 lg:px-7 py-4 space-y-3">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-bold uppercase tracking-wider">
              LIVE EV CHARGING RADAR
            </span>
            <span className="text-xs text-slate-400">
              Real-time charging hubs, connector availability & shortest route calculation
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white mt-1 tracking-tight">
            EV Charging Stations Near Me
          </h1>
        </div>

        {/* Location & Controls Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700 text-xs font-mono text-cyan-300 flex items-center gap-2 shadow-lg">
            <span
              className={`w-2 h-2 rounded-full ${
                userLocation
                  ? isApproximate
                    ? 'bg-amber-400'
                    : 'bg-blue-500 animate-pulse'
                  : 'bg-red-500'
              }`}
            />
            <span>
              {userLocation
                ? isApproximate
                  ? `IP Approx (${userLocation[0].toFixed(3)}, ${userLocation[1].toFixed(3)})`
                  : `GPS Active (${userLocation[0].toFixed(4)}, ${userLocation[1].toFixed(4)})`
                : locationStatus === 'locating'
                ? 'Acquiring GPS...'
                : 'GPS Offline'}
            </span>
            {userAccuracy && !isApproximate && (
              <span className="text-[10px] text-slate-400 font-sans">±{userAccuracy}m</span>
            )}
          </div>

          <button
            onClick={() => setShowTripPlanner(!showTripPlanner)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all ${
              showTripPlanner
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-md shadow-cyan-500/20'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title="Plan driving route to any destination"
          >
            <Navigation className="w-3.5 h-3.5 text-cyan-400" />
            <span>{showTripPlanner ? 'Hide Trip Planner' : 'Plan Trip Route'}</span>
          </button>

          <button
            onClick={locateMe}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition-all"
            title="Locate my position with high accuracy GPS"
          >
            <LocateFixed className="w-3.5 h-3.5" />
            <span>Locate Me</span>
          </button>

          <button
            onClick={refreshStations}
            disabled={isLoadingStations}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition-all"
            title="Refresh Stations"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStations ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* GPS Warning if applicable */}
      {gpsError && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{gpsError}</span>
          </div>
        </div>
      )}

      {/* Integrated Trip Route Planner Drawer */}
      {showTripPlanner && (
        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-700/80 shadow-2xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Navigation className="w-4 h-4 text-cyan-400" />
              Smart Route Planner: Enter any destination to plot driving corridor and find charging stops
            </span>
            <button
              onClick={() => setShowTripPlanner(false)}
              className="text-slate-400 hover:text-white text-xs"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={tripDestinationQuery}
              onChange={(e) => handleSearchTripDestination(e.target.value)}
              placeholder="Type city, landmark or address (e.g., Gachibowli, Hitech City, Airport)..."
              className="w-full bg-slate-800/90 text-sm text-slate-100 pl-9 pr-9 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-cyan-500 transition-colors"
            />
            {tripDestinationQuery && (
              <button
                onClick={() => {
                  setTripDestinationQuery('');
                  setTripSearchResults([]);
                }}
                className="absolute right-2.5 top-2 p-1 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Autocomplete Results */}
          {tripSearchResults.length > 0 && (
            <div className="bg-slate-800/95 border border-slate-700 rounded-lg max-h-48 overflow-y-auto divide-y divide-slate-700/50">
              {tripSearchResults.map((place, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectTripDestination(place)}
                  className="w-full text-left p-2.5 hover:bg-slate-700/60 text-xs text-slate-200 flex items-center justify-between transition-colors"
                >
                  <span className="truncate pr-2">{place.display_name}</span>
                  <span className="text-[10px] text-cyan-400 shrink-0 font-mono">Plan Route →</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Route Calculation Loading Indicator */}
      {isCalculatingRoute && (
        <div className="p-3 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-xs text-cyan-200 flex items-center gap-2.5 animate-pulse">
          <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
          <span>Calculating Smart Road Route via OSRM Engine from your live GPS location...</span>
        </div>
      )}

      {/* Route Calculation Error Notice */}
      {routeError && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{routeError}</span>
          </div>
          <button
            onClick={() => setRouteError(null)}
            className="text-xs text-slate-400 hover:text-white px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Active Smart Driving Route Banner */}
      {routeInfo && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-between gap-4 text-xs text-slate-200 shadow-lg shadow-emerald-500/10">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
              <RouteIcon className="w-4 h-4 shrink-0" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">
                Smart Route to {routeInfo.destination_name}
              </p>
              <p className="text-[11px] text-emerald-300 font-mono mt-0.5">
                Distance: <strong className="text-white">{routeInfo.distance_km} km</strong> · Travel Time: <strong className="text-white">{routeInfo.duration_formatted}</strong> · Engine: {routeInfo.is_osrm ? 'OSRM Road Network' : 'Direct Coordinate Corridor'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setRouteGeometry(undefined);
                setRouteInfo(null);
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs border border-slate-700 transition-colors"
            >
              Clear Route
            </button>
          </div>
        </div>
      )}

      {/* Main Map + Stations Panel Layout (Right Panel side matching Google Maps) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-210px)] min-h-[620px]">
        {/* Map Column */}
        <div
          className={`${
            STATIONS_PANEL_SIDE === 'right'
              ? 'lg:col-span-8 order-1'
              : 'lg:col-span-8 order-2'
          } h-full rounded-2xl overflow-hidden`}
        >
          <MapView
            stations={stations}
            userLocation={userLocation}
            userAccuracy={userAccuracy}
            selectedStation={selectedStation}
            onSelectStation={(s) => setSelectedStation(s)}
            onLocateMe={locateMe}
            routeWaypoints={routeGeometry}
            onSearchThisArea={updateOnMove ? searchInArea : undefined}
            className="h-full rounded-2xl"
          />
        </div>

        {/* Stations Panel Column */}
        <div
          className={`${
            STATIONS_PANEL_SIDE === 'right'
              ? 'lg:col-span-4 order-2'
              : 'lg:col-span-4 order-1'
          } h-full rounded-2xl overflow-hidden`}
        >
          <StationsPanel
            stations={stations}
            isLoading={isLoadingStations}
            selectedStation={selectedStation}
            onSelectStation={(s) => setSelectedStation(s)}
            onRouteToStation={handleRouteToStation}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            connectorFilter={connectorFilter}
            onConnectorFilterChange={setConnectorFilter}
            minPowerFilter={minPowerFilter}
            onMinPowerFilterChange={setMinPowerFilter}
            updateOnMove={updateOnMove}
            onToggleUpdateOnMove={setUpdateOnMove}
            isOfflineSample={isOfflineSample}
            onRefresh={refreshStations}
            onExpandRadius={handleExpandRadius}
          />
        </div>
      </div>
    </div>
  );
};

export default ChargingStationsPage;
