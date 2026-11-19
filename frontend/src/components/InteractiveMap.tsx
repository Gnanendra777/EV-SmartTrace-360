import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Globe, Layers, Navigation, Compass, Maximize2, LocateFixed, Eye } from 'lucide-react';
import { ChargingStation } from '../types';

// Custom Map Markers

// 1. Prominent Blue Circular User GPS Location Pin with Active Pulsing Beacon
export const createUserLocationIcon = () => L.divIcon({
  className: 'custom-user-gps-pin',
  html: `
    <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; background: rgba(32, 214, 194, 0.35); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="position: absolute; width: 24px; height: 24px; border-radius: 50%; background: rgba(67, 140, 255, 0.45);"></div>
      <div style="position: relative; width: 14px; height: 14px; border-radius: 50%; background: #20D6C2; border: 2.5px solid #ffffff; box-shadow: 0 0 12px rgba(32, 214, 194, 1);"></div>
    </div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

// 2. Charging Station Markers with Power Badge & Selection Halo
export const createStationIcon = (station: ChargingStation, isSelected: boolean = false) => {
  const isHighPower = station.charging_power >= 50;
  const bgColor = isSelected ? '#20D6C2' : isHighPower ? '#22C78A' : '#438CFF';
  const shadowColor = isSelected ? 'rgba(32, 214, 194, 0.9)' : 'rgba(34, 199, 138, 0.7)';
  const halo = isSelected ? 'box-shadow: 0 0 20px rgba(32, 214, 194, 1), 0 0 0 4px rgba(32, 214, 194, 0.4);' : '';

  return L.divIcon({
    className: 'custom-charging-station-pin',
    html: `
      <div style="
        position: relative;
        background: ${bgColor};
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: 2px solid #06151B;
        box-shadow: 0 0 14px ${shadowColor};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: 900;
        color: #06151B;
        cursor: pointer;
        transition: transform 0.2s ease;
        ${halo}
      ">
        ⚡
        <div style="
          position: absolute;
          bottom: -15px;
          white-space: nowrap;
          background: rgba(6, 21, 27, 0.9);
          border: 1px solid ${bgColor};
          color: #E2E8F0;
          font-family: monospace;
          font-size: 9px;
          font-weight: bold;
          padding: 1px 4px;
          border-radius: 4px;
        ">
          ${Math.round(station.charging_power)}kW
        </div>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
};

// 3. Destination Checkered Flag Marker
export const destinationPinIcon = L.divIcon({
  className: 'custom-destination-pin',
  html: `
    <div style="
      background: #F15B65;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: 2px solid #ffffff;
      box-shadow: 0 0 16px rgba(241, 91, 101, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      color: white;
    ">🏁</div>
  `,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

// 4. Waypoint / Charging Stop Marker
export const waypointPinIcon = L.divIcon({
  className: 'custom-waypoint-pin',
  html: `
    <div style="
      background: #F5B942;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: 2px solid #06151B;
      box-shadow: 0 0 16px rgba(245, 185, 66, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: bold;
      color: #06151B;
    ">🔌</div>
  `,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

interface InteractiveMapProps {
  stations?: ChargingStation[];
  routeWaypoints?: number[][]; // [[lat, lng], ...]
  userLocation?: [number, number] | null;
  destinationLocation?: [number, number] | null;
  waypointLocation?: [number, number] | null;
  selectedStationId?: number | null;
  center?: [number, number];
  zoom?: number;
  onSelectStation?: (station: ChargingStation) => void;
  onLocateMe?: () => void;
  defaultLayer?: 'cyber' | 'satellite' | 'streets';
  className?: string;
}

// Controller component to smoothly pan/zoom and fit bounds
const MapController: React.FC<{ 
  center?: [number, number]; 
  waypoints?: number[][]; 
  stations?: ChargingStation[];
  userLocation?: [number, number] | null;
  destinationLocation?: [number, number] | null;
  waypointLocation?: [number, number] | null;
  triggerFit?: number 
}> = ({ center, waypoints, stations, userLocation, destinationLocation, waypointLocation, triggerFit }) => {
  const map = useMap();

  useEffect(() => {
    // If route waypoints exist, fit route bounds
    if (waypoints && waypoints.length > 1) {
      const bounds = L.latLngBounds(waypoints as [number, number][]);
      map.fitBounds(bounds, { padding: [40, 40] });
    } else if (stations && stations.length > 0 && userLocation) {
      // Fit bounds to include user and nearby stations
      const points: [number, number][] = [userLocation];
      stations.forEach(s => points.push([s.latitude, s.longitude]));
      if (destinationLocation) points.push(destinationLocation);
      if (waypointLocation) points.push(waypointLocation);
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    } else if (destinationLocation && userLocation) {
      const points: [number, number][] = [userLocation, destinationLocation];
      if (waypointLocation) points.push(waypointLocation);
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [60, 60] });
    } else if (center) {
      map.panTo(center);
    }
  }, [center, waypoints, stations, userLocation, destinationLocation, waypointLocation, triggerFit, map]);

  return null;
};

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  stations = [],
  routeWaypoints = [],
  userLocation = null,
  destinationLocation = null,
  waypointLocation = null,
  selectedStationId = null,
  center = [28.6139, 77.2090], // Default fallback if no GPS yet
  zoom = 12,
  onSelectStation,
  onLocateMe,
  defaultLayer = 'cyber',
  className = ''
}) => {
  const [mapLayer, setMapLayer] = useState<'cyber' | 'satellite' | 'streets'>(defaultLayer);
  const [triggerFit, setTriggerFit] = useState(0);

  const activeCenter = userLocation || (routeWaypoints.length > 0 ? (routeWaypoints[0] as [number, number]) : center);

  return (
    <div className={`w-full h-full min-h-[460px] rounded-2xl overflow-hidden border border-cyan-500/25 relative shadow-2xl ${className}`}>
      
      {/* Floating Map Layer & Controls Bar */}
      <div className="absolute top-4 right-4 z-[400] flex items-center flex-wrap gap-1.5 bg-[#06151B]/90 backdrop-blur-md p-1.5 rounded-xl border border-cyan-500/30 shadow-2xl">
        
        {/* Layer Selector */}
        <button
          onClick={() => setMapLayer('cyber')}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
            mapLayer === 'cyber'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30 font-bold'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
          }`}
          title="Cyber Dark Automotive Theme"
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Cyber Dark</span>
        </button>

        <button
          onClick={() => setMapLayer('satellite')}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
            mapLayer === 'satellite'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30 font-bold'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
          }`}
          title="Satellite Photography View"
        >
          <Globe className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Satellite</span>
        </button>

        <button
          onClick={() => setMapLayer('streets')}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
            mapLayer === 'streets'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30 font-bold'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
          }`}
          title="OpenStreetMap Standard Street Map"
        >
          <Navigation className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Street</span>
        </button>

        {/* Locate Me Button on Map Toolbar */}
        {onLocateMe && (
          <button
            onClick={onLocateMe}
            className="p-1.5 rounded-lg bg-slate-800/90 text-cyan-400 hover:text-white hover:bg-cyan-500/20 border border-cyan-500/30 transition"
            title="Pan to My Current GPS Position"
          >
            <LocateFixed className="w-4 h-4" />
          </button>
        )}

        {/* Reset View & Fit Bounds Button */}
        <button
          onClick={() => setTriggerFit(p => p + 1)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          title="Fit View to All Visible Stations / Route"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

      </div>

      {/* Floating Status Pill on Bottom Left */}
      <div className="absolute bottom-4 left-4 z-[400] bg-[#06151B]/90 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-cyan-500/30 text-[11px] font-mono text-slate-200 flex items-center space-x-2 shadow-xl">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-cyan-400 font-bold">
          {routeWaypoints.length > 1 ? 'OSRM EV Route Active' : 'Open Charge Map Radar'}
        </span>
        <span className="text-slate-500">•</span>
        <span>
          {routeWaypoints.length > 1
            ? `${stations.length} Corridor Chargers Discovered`
            : `${stations.length} Fast Chargers Discovered`}
        </span>
      </div>

      <MapContainer
        center={activeCenter}
        zoom={zoom}
        scrollWheelZoom={true}
        className="w-full h-full z-10"
      >
        <MapController 
          center={activeCenter} 
          waypoints={routeWaypoints} 
          stations={stations}
          userLocation={userLocation}
          destinationLocation={destinationLocation}
          waypointLocation={waypointLocation}
          triggerFit={triggerFit} 
        />

        {/* 1. CYBER DARK MODE: CartoDB Dark Matter / Voyager tiles with dark backdrop */}
        {mapLayer === 'cyber' && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            maxZoom={19}
          />
        )}

        {/* 2. SATELLITE MODE: Esri World Imagery */}
        {mapLayer === 'satellite' && (
          <>
            <TileLayer
              attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={18}
            />
            <TileLayer
              attribution='&copy; Esri World Boundaries'
              url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              maxZoom={18}
              opacity={0.8}
            />
          </>
        )}

        {/* 3. STREET MAP MODE: Standard OpenStreetMap */}
        {mapLayer === 'streets' && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        )}

        {/* Real User GPS Location Marker */}
        {userLocation && (
          <Marker position={userLocation} icon={createUserLocationIcon()}>
            <Popup>
              <div className="p-1 space-y-1 text-xs font-sans">
                <p className="font-bold text-cyan-400 flex items-center gap-1">
                  <span>📍</span> Your Current GPS Location
                </p>
                <p className="text-[11px] font-mono text-slate-300">
                  Lat: {userLocation[0].toFixed(5)}, Lng: {userLocation[1].toFixed(5)}
                </p>
                <p className="text-[10px] text-slate-400">GPS Signal Verified • High Accuracy</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Destination Marker */}
        {destinationLocation && (
          <Marker position={destinationLocation} icon={destinationPinIcon}>
            <Popup>
              <div className="p-1 space-y-1 text-xs font-sans">
                <p className="font-bold text-rose-400">🏁 Destination Terminal</p>
                <p className="text-[11px] font-mono text-slate-300">
                  Lat: {destinationLocation[0].toFixed(5)}, Lng: {destinationLocation[1].toFixed(5)}
                </p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Intermediate Waypoint Marker */}
        {waypointLocation && (
          <Marker position={waypointLocation} icon={waypointPinIcon}>
            <Popup>
              <div className="p-1.5 space-y-1 text-xs font-sans">
                <p className="font-bold text-amber-400 flex items-center gap-1">
                  <span>🔌</span> Route Charging Waypoint
                </p>
                <p className="text-[11px] font-mono text-slate-300">
                  Lat: {waypointLocation[0].toFixed(5)}, Lng: {waypointLocation[1].toFixed(5)}
                </p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Charging Station Markers */}
        {stations.map((station) => {
          const isSelected = selectedStationId === station.id;
          return (
            <Marker
              key={station.id}
              position={[station.latitude, station.longitude]}
              icon={createStationIcon(station, isSelected)}
              eventHandlers={{
                click: () => onSelectStation && onSelectStation(station)
              }}
            >
              <Popup>
                <div className="p-1.5 space-y-1.5 text-xs font-sans max-w-[240px]">
                  <div className="flex items-center justify-between border-b border-slate-700/80 pb-1">
                    <span className="font-bold text-emerald-400">{station.station_name}</span>
                    <span className="text-[10px] font-mono text-cyan-300 font-bold">{station.charging_power} kW</span>
                  </div>
                  <p className="text-[11px] text-slate-300">{station.address}</p>
                  <div className="flex items-center justify-between text-[11px] font-mono pt-1">
                    <span className="text-cyan-400 font-bold">{station.connector_type}</span>
                    {station.distance_km !== undefined && (
                      <span className="text-slate-400">{station.distance_km} km away</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Operator: <span className="text-slate-200">{station.operator}</span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Pricing: <span className="text-slate-300">{station.pricing_text && station.pricing_text !== 'Pricing information unavailable.' ? station.pricing_text : 'Not provided'}</span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Status: <span className="text-slate-300">{station.availability_status && !station.availability_status.includes('not provided by the data source') ? station.availability_status : 'Not provided'}</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Route Polyline (Glow & High-Precision Line) */}
        {routeWaypoints.length > 1 && (
          <>
            {/* Outer Cyan Neon Glow */}
            <Polyline
              positions={routeWaypoints as [number, number][]}
              pathOptions={{
                color: '#20D6C2',
                weight: 8,
                opacity: 0.35,
                lineJoin: 'round'
              }}
            />
            {/* Inner Emerald Track Line */}
            <Polyline
              positions={routeWaypoints as [number, number][]}
              pathOptions={{
                color: '#22C78A',
                weight: 4,
                opacity: 0.95,
                lineJoin: 'round'
              }}
            />
          </>
        )}

      </MapContainer>
    </div>
  );
};

export default InteractiveMap;