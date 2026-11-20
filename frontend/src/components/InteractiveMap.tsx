import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Layers, Navigation, Maximize2, LocateFixed, Zap, ExternalLink, RefreshCw } from 'lucide-react';
import { ChargingStation } from '../types';
import { MAP_LAYERS, MapLayerType, getStoredMapLayer, setStoredMapLayer } from './map/mapProviders';

// 1. User Live Location Marker (Blue Dot with Pulse Ring)
export const createUserLocationIcon = () =>
  L.divIcon({
    className: 'custom-user-location-marker',
    html: `
      <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
        <div class="user-pulse-dot" style="position: absolute; width: 24px; height: 24px; border-radius: 50%; background: rgba(59, 130, 246, 0.35);"></div>
        <div style="position: relative; width: 14px; height: 14px; border-radius: 50%; background: #2563eb; border: 2.5px solid #ffffff; box-shadow: 0 0 10px rgba(37, 99, 235, 0.9);"></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

// 2. EV Station Red Circular Pin with ⚡ bolt and Name Tag
export const createStationIcon = (station: ChargingStation, isSelected: boolean = false) => {
  const pinBg = isSelected ? '#06b6d4' : '#ef4444';
  const shortName = station.station_name
    .replace(/Charging Station/gi, '')
    .replace(/EV Station/gi, '')
    .trim();

  return L.divIcon({
    className: 'custom-station-pin',
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer; user-select: none;">
        <div style="
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: ${pinBg};
          border: 2px solid #ffffff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          font-size: 13px;
          font-weight: bold;
          transform: ${isSelected ? 'scale(1.15)' : 'scale(1)'};
          transition: transform 0.15s ease;
        ">⚡</div>
        <div style="
          margin-top: 2px;
          white-space: nowrap;
          background: rgba(15, 23, 42, 0.92);
          backdrop-filter: blur(4px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #f8fafc;
          font-size: 10px;
          font-weight: 600;
          padding: 1px 6px;
          border-radius: 5px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          pointer-events: none;
        ">
          ${shortName} <span style="color: #34d399; font-weight: 700;">${Math.round(station.charging_power)}kW</span>
        </div>
      </div>
    `,
    iconSize: [120, 50],
    iconAnchor: [60, 14],
  });
};

// 3. Destination Terminal Marker
export const destinationPinIcon = L.divIcon({
  className: 'custom-destination-pin',
  html: `
    <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 28px; height: 28px; border-radius: 50%; background: rgba(244, 63, 94, 0.3); animation: ping 2.5s infinite;"></div>
      <div style="position: relative; width: 18px; height: 18px; border-radius: 50%; background: #f43f5e; border: 2.5px solid #ffffff; box-shadow: 0 0 14px rgba(244, 63, 94, 0.9); display: flex; align-items: center; justify-content: center;">
        <div style="width: 6px; height: 6px; border-radius: 50%; background: #ffffff;"></div>
      </div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// 4. Waypoint / Charging Stop Marker
export const waypointPinIcon = L.divIcon({
  className: 'custom-waypoint-pin',
  html: `
    <div style="
      background: #f59e0b;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 2px solid #ffffff;
      box-shadow: 0 0 12px rgba(245, 158, 11, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: #ffffff;
    ">🔌</div>
  `,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

export interface InteractiveMapProps {
  stations?: ChargingStation[];
  routeWaypoints?: number[][]; // [[lat, lng], ...]
  userLocation?: [number, number] | null;
  userAccuracy?: number | null;
  destinationLocation?: [number, number] | null;
  waypointLocation?: [number, number] | null;
  selectedStationId?: number | null;
  center?: [number, number];
  zoom?: number;
  onSelectStation?: (station: ChargingStation) => void;
  onLocateMe?: () => void;
  onSearchThisArea?: (bounds: { south: number; west: number; north: number; east: number }) => void;
  className?: string;
}

// Controller to handle smooth flyTo and fitBounds without infinite render loops
const MapController: React.FC<{
  center: [number, number];
  zoom: number;
  userLocation?: [number, number] | null;
  destinationLocation?: [number, number] | null;
  waypointLocation?: [number, number] | null;
  routeWaypoints?: number[][];
  selectedStationId?: number | null;
  stations?: ChargingStation[];
  fitTrigger: number;
  onMapMoved?: () => void;
}> = ({
  center,
  userLocation,
  destinationLocation,
  waypointLocation,
  routeWaypoints,
  selectedStationId,
  stations,
  fitTrigger,
  onMapMoved,
}) => {
  const map = useMap();
  const hasInitializedRef = useRef<boolean>(false);

  // Map move event for "Search this area"
  useMapEvents({
    moveend: () => {
      onMapMoved?.();
    },
  });

  // Selected station change -> smoothly fly to it
  useEffect(() => {
    if (selectedStationId && stations && stations.length > 0) {
      const target = stations.find((s) => s.id === selectedStationId);
      if (target) {
        map.flyTo([target.latitude, target.longitude], Math.max(map.getZoom(), 15), {
          duration: 0.8,
        });
      }
    }
  }, [selectedStationId, stations, map]);

  // Initial fit or user-triggered Fit View click
  useEffect(() => {
    // Only fit on explicit trigger or initial setup
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      if (routeWaypoints && routeWaypoints.length > 1) {
        const bounds = L.latLngBounds(routeWaypoints as [number, number][]);
        map.fitBounds(bounds, { padding: [40, 40] });
        return;
      }
      if (userLocation && destinationLocation) {
        const bounds = L.latLngBounds([userLocation, destinationLocation]);
        map.fitBounds(bounds, { padding: [50, 50] });
        return;
      }
      map.setView(center, 13);
      return;
    }

    if (fitTrigger > 0) {
      if (routeWaypoints && routeWaypoints.length > 1) {
        const bounds = L.latLngBounds(routeWaypoints as [number, number][]);
        map.fitBounds(bounds, { padding: [40, 40] });
        return;
      }
      const points: [number, number][] = [];
      if (userLocation) points.push(userLocation);
      if (destinationLocation) points.push(destinationLocation);
      if (waypointLocation) points.push(waypointLocation);
      if (stations) {
        stations.slice(0, 20).forEach((s) => points.push([s.latitude, s.longitude]));
      }

      if (points.length > 1) {
        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      } else if (userLocation) {
        map.flyTo(userLocation, 14);
      }
    }
  }, [fitTrigger, map]);

  return null;
};

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  stations = [],
  routeWaypoints = [],
  userLocation = null,
  userAccuracy = null,
  destinationLocation = null,
  waypointLocation = null,
  selectedStationId = null,
  center,
  zoom = 13,
  onSelectStation,
  onLocateMe,
  onSearchThisArea,
  className = '',
}) => {
  const [activeLayer, setActiveLayer] = useState<MapLayerType>(getStoredMapLayer);
  const [showLayerMenu, setShowLayerMenu] = useState<boolean>(false);
  const [fitTrigger, setFitTrigger] = useState<number>(0);
  const [showSearchAreaButton, setShowSearchAreaButton] = useState<boolean>(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  const layerConfig = MAP_LAYERS[activeLayer] || MAP_LAYERS.dark;

  const handleSelectLayer = (type: MapLayerType) => {
    setActiveLayer(type);
    setStoredMapLayer(type);
    setShowLayerMenu(false);
  };

  const mapCenter: [number, number] = useMemo(() => {
    if (userLocation) return userLocation;
    if (center) return center;
    if (stations.length > 0) return [stations[0].latitude, stations[0].longitude];
    return [20.5937, 78.9629]; // Safe global default
  }, [userLocation, center, stations]);

  const handleSearchAreaClick = () => {
    setShowSearchAreaButton(false);
    if (mapContainerRef.current) {
      const leafletMap = (mapContainerRef.current as any)._leaflet_map;
      if (leafletMap && onSearchThisArea) {
        const b = leafletMap.getBounds();
        onSearchThisArea({
          north: b.getNorth(),
          east: b.getEast(),
          south: b.getSouth(),
          west: b.getWest(),
        });
      }
    }
  };

  return (
    <div
      ref={mapContainerRef}
      className={`relative w-full h-full min-h-[460px] overflow-hidden rounded-2xl border border-slate-800 shadow-2xl bg-slate-950 ${className}`}
    >
      {/* Top Left: Layers Selector */}
      <div className="absolute top-4 left-4 z-[400]">
        <div className="relative">
          <button
            onClick={() => setShowLayerMenu(!showLayerMenu)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-100 text-xs font-semibold backdrop-blur-md border border-slate-700 shadow-xl transition-all"
            title="Switch map layer"
          >
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>{layerConfig.label}</span>
          </button>

          {showLayerMenu && (
            <div className="absolute top-full left-0 mt-2 w-44 rounded-xl bg-slate-900/95 border border-slate-700 shadow-2xl backdrop-blur-md overflow-hidden text-xs py-1">
              {(Object.keys(MAP_LAYERS) as MapLayerType[]).map((key) => {
                const cfg = MAP_LAYERS[key];
                return (
                  <button
                    key={key}
                    onClick={() => handleSelectLayer(key)}
                    className={`w-full text-left px-3 py-2 transition-colors ${
                      activeLayer === key
                        ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                    }`}
                  >
                    <div className="font-medium">{cfg.label}</div>
                    <div className="text-[10px] text-slate-400">{cfg.description}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top Center: "Search this area" Button when user pans map */}
      {showSearchAreaButton && onSearchThisArea && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[400]">
          <button
            onClick={handleSearchAreaClick}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-xl border border-cyan-400/40 backdrop-blur-md transition-all animate-bounce"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Search this area</span>
          </button>
        </div>
      )}

      {/* Top Right: Map Tools (Fit Bounds & Locate Me) */}
      <div className="absolute top-4 right-4 z-[400] flex items-center gap-1.5">
        {onLocateMe && (
          <button
            onClick={onLocateMe}
            className="p-2 rounded-xl bg-slate-900/90 text-cyan-400 hover:text-white hover:bg-slate-800 border border-slate-700 backdrop-blur-md shadow-xl transition-all"
            title="Pan to My Current GPS Position"
          >
            <LocateFixed className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={() => setFitTrigger((p) => p + 1)}
          className="p-2 rounded-xl bg-slate-900/90 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700 backdrop-blur-md shadow-xl transition-all"
          title="Fit view to all stations and route"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Leaflet MapContainer */}
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        scrollWheelZoom={true}
        className={`w-full h-full z-10 ${layerConfig.cssClass || ''}`}
      >
        <MapController
          center={mapCenter}
          zoom={zoom}
          userLocation={userLocation}
          destinationLocation={destinationLocation}
          waypointLocation={waypointLocation}
          routeWaypoints={routeWaypoints}
          selectedStationId={selectedStationId}
          stations={stations}
          fitTrigger={fitTrigger}
          onMapMoved={() => setShowSearchAreaButton(true)}
        />

        {/* Base Map Layer */}
        <TileLayer
          attribution={layerConfig.attribution}
          url={layerConfig.url}
          maxZoom={layerConfig.maxZoom}
          subdomains={layerConfig.subdomains || ['a', 'b', 'c']}
        />

        {/* Optional Overlay Layer (e.g. for Hybrid) */}
        {layerConfig.overlayUrl && (
          <TileLayer
            attribution={layerConfig.overlayAttribution || ''}
            url={layerConfig.overlayUrl}
            maxZoom={layerConfig.maxZoom}
          />
        )}

        {/* User GPS Accuracy Circle */}
        {userLocation && userAccuracy && userAccuracy > 0 && (
          <Circle
            center={userLocation}
            radius={userAccuracy}
            pathOptions={{
              color: '#3b82f6',
              fillColor: '#3b82f6',
              fillOpacity: 0.12,
              weight: 1,
            }}
          />
        )}

        {/* User GPS Location Marker */}
        {userLocation && (
          <Marker position={userLocation} icon={createUserLocationIcon()}>
            <Popup>
              <div className="p-1 space-y-1 text-xs font-sans text-slate-900">
                <p className="font-bold text-blue-600 flex items-center gap-1">
                  <span>📍</span> Your Live GPS Location
                </p>
                <p className="text-[11px] font-mono text-slate-600">
                  {userLocation[0].toFixed(5)}, {userLocation[1].toFixed(5)}
                </p>
                {userAccuracy && (
                  <p className="text-[10px] text-slate-500">Accuracy: ~{userAccuracy}m</p>
                )}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Destination Marker */}
        {destinationLocation && (
          <Marker position={destinationLocation} icon={destinationPinIcon}>
            <Popup>
              <div className="p-1 text-xs font-sans text-slate-900">
                <p className="font-bold text-rose-600">🎯 Destination Terminal</p>
                <p className="text-[11px] font-mono text-slate-600">
                  {destinationLocation[0].toFixed(5)}, {destinationLocation[1].toFixed(5)}
                </p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Waypoint Marker */}
        {waypointLocation && (
          <Marker position={waypointLocation} icon={waypointPinIcon}>
            <Popup>
              <div className="p-1 text-xs font-sans text-slate-900">
                <p className="font-bold text-amber-600">🔌 Charging Waypoint</p>
                <p className="text-[11px] font-mono text-slate-600">
                  {waypointLocation[0].toFixed(5)}, {waypointLocation[1].toFixed(5)}
                </p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Route Polyline */}
        {routeWaypoints && routeWaypoints.length > 1 && (
          <Polyline
            positions={routeWaypoints as [number, number][]}
            pathOptions={{
              color: '#06b6d4',
              weight: 5,
              opacity: 0.9,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}

        {/* EV Station Markers */}
        {stations.map((station) => {
          const isSelected = selectedStationId === station.id;
          return (
            <Marker
              key={station.id}
              position={[station.latitude, station.longitude]}
              icon={createStationIcon(station, isSelected)}
              eventHandlers={{
                click: () => onSelectStation?.(station),
              }}
            >
              <Popup>
                <div className="p-1.5 space-y-1.5 text-xs font-sans max-w-[240px] text-slate-900">
                  <h4 className="font-bold text-slate-950 text-sm leading-tight">
                    {station.station_name}
                  </h4>
                  <p className="text-[11px] text-slate-600 leading-snug">{station.address}</p>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-[11px]">
                    <span className="font-semibold text-emerald-600">⚡ {station.charging_power} kW</span>
                    <span className="text-slate-500">{station.connector_type || 'Type 2'}</span>
                  </div>

                  {station.pricing_text && (
                    <div className="text-[10px] text-slate-500">
                      Pricing: <span className="font-medium text-slate-700">{station.pricing_text}</span>
                    </div>
                  )}

                  <div className="pt-1 flex gap-2">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-700 hover:text-cyan-800 underline"
                    >
                      <Navigation className="w-3 h-3" />
                      <span>Directions</span>
                    </a>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default InteractiveMap;
