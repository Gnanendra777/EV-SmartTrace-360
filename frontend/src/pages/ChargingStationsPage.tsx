import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Zap, Navigation, AlertCircle, LocateFixed, RefreshCw, Route as RouteIcon, Info
} from 'lucide-react';
import { MapView } from '../components/map/MapView';
import { StationsPanel, STATIONS_PANEL_SIDE } from '../components/StationsPanel';
import { useLiveLocation } from '../hooks/useLiveLocation';
import { useNearbyStations } from '../hooks/useNearbyStations';
import { ChargingStation } from '../types';
import { api } from '../services/api';

export const ChargingStationsPage: React.FC = () => {
  const navigate = useNavigate();

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
  } | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState<boolean>(false);

  // Select first station when loaded
  useEffect(() => {
    if (stations.length > 0 && !selectedStation) {
      setSelectedStation(stations[0]);
    }
  }, [stations, selectedStation]);

  // Route to selected station
  const handleRouteToStation = async (station: ChargingStation) => {
    setSelectedStation(station);
    if (!userLocation) {
      locateMe();
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
      });
    } catch (e) {
      console.warn('Failed to calculate route to station:', e);
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  const handleSendToSmartNavigation = (station: ChargingStation) => {
    navigate('/navigation', {
      state: {
        destinationName: station.station_name,
        destinationLat: station.latitude,
        destinationLng: station.longitude,
      },
    });
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

      {/* Active Driving Route Banner if calculated */}
      {routeInfo && selectedStation && (
        <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/40 flex items-center justify-between gap-4 text-xs text-slate-200">
          <div className="flex items-center gap-2">
            <RouteIcon className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              Route to <strong className="text-white">{selectedStation.station_name}</strong>: {routeInfo.distance_km} km ({routeInfo.duration_formatted}) via {routeInfo.is_osrm ? 'OSRM Driving Engine' : 'Direct Path'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSendToSmartNavigation(selectedStation)}
              className="px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors"
            >
              Open in Smart Navigation
            </button>
            <button
              onClick={() => {
                setRouteGeometry(undefined);
                setRouteInfo(null);
              }}
              className="text-slate-400 hover:text-white px-1.5 py-1 text-xs"
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
            onAddWaypoint={handleSendToSmartNavigation}
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
