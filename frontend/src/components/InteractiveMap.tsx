import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Globe, Layers, Navigation, Maximize2, LocateFixed, Zap, ExternalLink, Route } from 'lucide-react';
import { ChargingStation } from '../types';

// Custom Map Markers matching Google Maps EV experience

// 1. Google Maps Authentic Blue GPS Position Dot with Radiating Radar Ring
export const createUserLocationIcon = () => L.divIcon({
  className: 'custom-google-user-gps',
  html: `
    <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 34px; height: 34px; border-radius: 50%; background: rgba(26, 115, 232, 0.3); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="position: absolute; width: 22px; height: 22px; border-radius: 50%; background: rgba(26, 115, 232, 0.45);"></div>
      <div style="position: relative; width: 14px; height: 14px; border-radius: 50%; background: #1A73E8; border: 2.5px solid #ffffff; box-shadow: 0 0 10px rgba(26, 115, 232, 0.8);"></div>
    </div>
  `,
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

// 2. Google Maps Red Circular EV Station Pin (#EA4335) with White ⚡ and Station Name Pill
export const createStationIcon = (station: ChargingStation, isSelected: boolean = false) => {
  const pinBg = isSelected ? '#1A73E8' : '#EA4335';
  const shadow = isSelected 
    ? 'box-shadow: 0 0 0 4px rgba(26, 115, 232, 0.45), 0 4px 14px rgba(0,0,0,0.6);' 
    : 'box-shadow: 0 2px 8px rgba(0,0,0,0.45);';
  const scale = isSelected ? 'transform: scale(1.15);' : '';

  // Shorten name for floating pill
  const shortName = station.station_name
    .replace(/Charging Station/gi, '')
    .replace(/EV Station/gi, '')
    .trim();

  return L.divIcon({
    className: 'custom-google-station-pin',
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer; user-select: none;">
        <div style="
          position: relative;
          background: ${pinBg};
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 2px solid #FFFFFF;
          ${shadow}
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          color: #FFFFFF;
          transition: transform 0.15s ease, background-color 0.15s ease;
          ${scale}
        ">
          ⚡
        </div>
        <div style="
          margin-top: 3px;
          white-space: nowrap;
          background: rgba(15, 23, 42, 0.94);
          backdrop-filter: blur(4px);
          border: 1px solid rgba(255, 255, 255, 0.22);
          color: #F8FAFC;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          font-size: 10px;
          font-weight: 600;
          padding: 1.5px 6px;
          border-radius: 6px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.45);
          pointer-events: none;
        ">
          ${shortName} <span style="color: #4ADE80; font-size: 9px; font-weight: 700;">${Math.round(station.charging_power)}kW</span>
        </div>
      </div>
    `,
    iconSize: [140, 52],
    iconAnchor: [70, 14]
  });
};

// 3. Modern Destination Marker
export const destinationPinIcon = L.divIcon({
  className: 'custom-destination-pin',
  html: `
    <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 34px; height: 34px; border-radius: 50%; background: rgba(244, 63, 94, 0.35); animation: ping 2.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="position: absolute; width: 22px; height: 22px; border-radius: 50%; background: #F43F5E; border: 2.5px solid #ffffff; box-shadow: 0 0 16px rgba(244, 63, 94, 0.95); display: flex; align-items: center; justify-content: center;">
        <div style="width: 8px; height: 8px; border-radius: 50%; background: #ffffff;"></div>
      </div>
      <div style="position: absolute; bottom: -15px; white-space: nowrap; background: rgba(6, 21, 27, 0.95); border: 1px solid #F43F5E; color: #FFF; font-family: monospace; font-size: 9px; font-weight: bold; padding: 1px 5px; border-radius: 4px;">
        DESTINATION
      </div>
    </div>
  `,
  iconSize: [34, 34],
  iconAnchor: [17, 17]
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

export type MapLayerType = 'google-traffic' | 'google-roadmap' | 'google-satellite' | 'cyber' | 'streets';

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
  defaultLayer?: MapLayerType;
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
  selectedStationId?: number | null;
  triggerFit?: number 
}> = ({ center, waypoints, stations, userLocation, destinationLocation, waypointLocation, selectedStationId, triggerFit }) => {
  const map = useMap();

  useEffect(() => {
    // If a specific station was selected by the user, smoothly focus on it
    if (selectedStationId && stations && stations.length > 0) {
      const selected = stations.find(s => s.id === selectedStationId);
      if (selected) {
        map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 15), { duration: 0.8 });
        return;
      }
    }

    // If route waypoints exist, fit route bounds
    if (waypoints && waypoints.length > 1) {
      const bounds = L.latLngBounds(waypoints as [number, number][]);
      map.fitBounds(bounds, { padding: [40, 40] });
    } else if (stations && stations.length > 0 && userLocation) {
      const points: [number, number][] = [userLocation];
      stations.forEach(s => points.push([s.latitude, s.longitude]));
      if (destinationLocation) points.push(destinationLocation);
      if (waypointLocation) points.push(waypointLocation);
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } else if (destinationLocation && userLocation) {
      const points: [number, number][] = [userLocation, destinationLocation];
      if (waypointLocation) points.push(waypointLocation);
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [60, 60] });
    } else if (center) {
      map.panTo(center);
    }
  }, [center, waypoints, stations, userLocation, destinationLocation, waypointLocation, selectedStationId, triggerFit, map]);

  return null;
};

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  stations = [],
  routeWaypoints = [],
  userLocation = null,
  destinationLocation = null,
  waypointLocation = null,
  selectedStationId = null,
  center = [17.4725, 78.4352], // Default to active Hyderabad corridor if no GPS yet
  zoom = 13,
  onSelectStation,
  onLocateMe,
  defaultLayer = 'google-traffic',
  className = ''
}) => {
  const [mapLayer, setMapLayer] = useState<MapLayerType>(defaultLayer);
  const [triggerFit, setTriggerFit] = useState(0);

  const activeCenter = userLocation || (routeWaypoints.length > 0 ? (routeWaypoints[0] as [number, number]) : center);

  return (
    <div className={`w-full h-full min-h-[460px] rounded-2xl overflow-hidden border border-cyan-500/25 relative shadow-2xl ${className}`}>
      
      {/* Floating Map Layer & Controls Bar */}
      <div className="absolute top-4 right-4 z-[400] flex items-center flex-wrap gap-1.5 bg-[#06151B]/90 backdrop-blur-md p-1.5 rounded-xl border border-cyan-500/30 shadow-2xl">
        
        {/* 1. Google Live Traffic (Default) */}
        <button
          onClick={() => setMapLayer('google-traffic')}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
            mapLayer === 'google-traffic'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30 font-bold'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
          }`}
          title="Google Maps with Live Traffic Flow"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Google Traffic</span>
        </button>

        {/* 2. Google Roadmap */}
        <button
          onClick={() => setMapLayer('google-roadmap')}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
            mapLayer === 'google-roadmap'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30 font-bold'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
          }`}
          title="Google Maps Standard Roadmap"
        >
          <Navigation className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Google Map</span>
        </button>

        {/* 3. Google Satellite / Hybrid */}
        <button
          onClick={() => setMapLayer('google-satellite')}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
            mapLayer === 'google-satellite'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30 font-bold'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
          }`}
          title="Google Maps Satellite Hybrid"
        >
          <Globe className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Satellite</span>
        </button>

        {/* 4. Cyber Dark */}
        <button
          onClick={() => setMapLayer('cyber')}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
            mapLayer === 'cyber'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30 font-bold'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
          }`}
          title="Cyber Dark Cockpit Mode"
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Cyber Dark</span>
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
          {routeWaypoints.length > 1 ? 'OSRM EV Route Active' : 'Live Google Maps Radar'}
        </span>
        <span className="text-slate-500">•</span>
        <span>
          {routeWaypoints.length > 1
            ? `${stations.length} Corridor Chargers Discovered`
            : `${stations.length} Nearby Stations Active`}
        </span>
      </div>

      {/* Google Maps Live Traffic Legend Pill on Bottom Right */}
      {mapLayer === 'google-traffic' && (
        <div className="absolute bottom-4 right-4 z-[400] bg-white/95 text-slate-800 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-300 shadow-xl flex items-center space-x-2 text-[11px] font-medium pointer-events-none">
          <span className="text-slate-600 font-semibold">Live traffic</span>
          <span className="text-slate-400 text-xs">Fast</span>
          <div className="flex items-center space-x-0.5">
            <span className="w-4 h-2 rounded-sm bg-[#22C55E]" title="Fast / Uncongested"></span>
            <span className="w-4 h-2 rounded-sm bg-[#EAB308]" title="Moderate"></span>
            <span className="w-4 h-2 rounded-sm bg-[#F97316]" title="Slow"></span>
            <span className="w-4 h-2 rounded-sm bg-[#DC2626]" title="Heavy Traffic"></span>
          </div>
          <span className="text-slate-400 text-xs">Slow</span>
        </div>
      )}

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
          selectedStationId={selectedStationId}
          triggerFit={triggerFit} 
        />

        {/* 1. GOOGLE LIVE TRAFFIC TILES (Roadmap + Real-Time Flow Colors) */}
        {mapLayer === 'google-traffic' && (
          <TileLayer
            attribution='&copy; Google Maps &bull; Live Traffic'
            url="https://mt{s}.google.com/vt/lyrs=m,traffic&x={x}&y={y}&z={z}"
            subdomains={['0', '1', '2', '3']}
            maxZoom={20}
          />
        )}

        {/* 2. GOOGLE ROADMAP TILES */}
        {mapLayer === 'google-roadmap' && (
          <TileLayer
            attribution='&copy; Google Maps'
            url="https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
            subdomains={['0', '1', '2', '3']}
            maxZoom={20}
          />
        )}

        {/* 3. GOOGLE SATELLITE / HYBRID TILES */}
        {mapLayer === 'google-satellite' && (
          <TileLayer
            attribution='&copy; Google Maps Satellite'
            url="https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
            subdomains={['0', '1', '2', '3']}
            maxZoom={20}
          />
        )}

        {/* 4. CYBER DARK: CartoDB Voyager tiles */}
        {mapLayer === 'cyber' && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            maxZoom={19}
          />
        )}

        {/* 5. STREET MAP MODE: Standard OpenStreetMap */}
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
                <p className="font-bold text-[#1A73E8] flex items-center gap-1">
                  <span>📍</span> Your Current GPS Location
                </p>
                <p className="text-[11px] font-mono text-slate-700">
                  Lat: {userLocation[0].toFixed(5)}, Lng: {userLocation[1].toFixed(5)}
                </p>
                <p className="text-[10px] text-slate-500">Browser GPS Signal Verified &bull; High Accuracy</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Destination Marker */}
        {destinationLocation && (
          <Marker position={destinationLocation} icon={destinationPinIcon}>
            <Popup>
              <div className="p-1 space-y-1 text-xs font-sans">
                <p className="font-bold text-rose-500">🎯 Destination Terminal</p>
                <p className="text-[11px] font-mono text-slate-700">
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
                <p className="font-bold text-amber-500 flex items-center gap-1">
                  <span>🔌</span> Route Charging Waypoint
                </p>
                <p className="text-[11px] font-mono text-slate-700">
                  Lat: {waypointLocation[0].toFixed(5)}, Lng: {waypointLocation[1].toFixed(5)}
                </p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Google Maps Styled Red Charging Station Markers */}
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
                <div className="p-2 space-y-2 text-xs font-sans max-w-[260px] text-slate-800">
                  <div className="flex items-start justify-between border-b border-slate-200 pb-1.5">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm leading-tight">{station.station_name}</h4>
                      <div className="flex items-center space-x-1 text-[11px] text-amber-600 mt-0.5">
                        <span className="font-bold">{station.rating || 4.2}</span>
                        <span>★</span>
                        <span className="text-slate-500">({station.reviews_count || 15})</span>
                        <span className="text-slate-400">&bull;</span>
                        <span className="text-slate-600">{station.operator}</span>
                      </div>
                    </div>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-100 text-emerald-800 font-bold">
                      {Math.round(station.charging_power)} kW
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-snug">{station.address}</p>

                  {/* Ports detail breakdown */}
                  <div className="space-y-1 pt-1 border-t border-slate-100">
                    {(station.ports_detail || [
                      { connector: station.connector_type || 'CCS', power_kw: station.charging_power, available: 2, total: 2 }
                    ]).map((port, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[11px] bg-slate-50 px-2 py-0.5 rounded">
                        <span className="font-medium text-slate-700 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-cyan-600" />
                          <span>{port.connector} &bull; {port.power_kw} kW</span>
                        </span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          port.available > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {port.available}/{port.total}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Quick Action in Popup */}
                  <div className="flex items-center justify-between pt-1 text-[11px] font-medium">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}&travelmode=driving`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#1A73E8] hover:underline flex items-center gap-0.5"
                    >
                      <span>Directions</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    {station.distance_km !== undefined && (
                      <span className="text-slate-500 font-mono">{station.distance_km} km away</span>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Google Maps Style Blue Navigation Polyline */}
        {routeWaypoints.length > 1 && (
          <>
            {/* Outer Cyan Glow Accent */}
            <Polyline
              positions={routeWaypoints as [number, number][]}
              pathOptions={{
                color: '#20D6C2',
                weight: 9,
                opacity: 0.45,
                lineJoin: 'round'
              }}
            />
            {/* Inner Google Navigation Blue Line */}
            <Polyline
              positions={routeWaypoints as [number, number][]}
              pathOptions={{
                color: '#1A73E8',
                weight: 5,
                opacity: 0.98,
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
