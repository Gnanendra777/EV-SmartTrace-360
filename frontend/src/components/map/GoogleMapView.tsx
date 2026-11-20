/// <reference types="@types/google.maps" />
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { Layers, Car, Navigation2, AlertTriangle } from 'lucide-react';
import { ChargingStation } from '../../types';

interface GoogleMapViewProps {
  center: [number, number];
  zoom?: number;
  userLocation: [number, number] | null;
  userAccuracy?: number | null;
  stations: ChargingStation[];
  selectedStation: ChargingStation | null;
  onSelectStation: (station: ChargingStation) => void;
  routeGeometry?: [number, number][];
  onBoundsChange?: (bounds: { south: number; west: number; north: number; east: number }) => void;
  onFallbackToLeaflet: (reason: string) => void;
}

export const GoogleMapView: React.FC<GoogleMapViewProps> = ({
  center,
  zoom = 14,
  userLocation,
  userAccuracy,
  stations,
  selectedStation,
  onSelectStation,
  routeGeometry,
  onBoundsChange,
  onFallbackToLeaflet,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);
  const markersMapRef = useRef<Map<number | string, google.maps.Marker>>(new Map());
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const userAccuracyCircleRef = useRef<google.maps.Circle | null>(null);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [mapType, setMapType] = useState<string>('roadmap');
  const [trafficActive, setTrafficActive] = useState<boolean>(true);
  const [showLayerMenu, setShowLayerMenu] = useState<boolean>(false);
  const [isApiLoaded, setIsApiLoaded] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  // 1. Initialize Google Maps JS API using modern functional importLibrary
  useEffect(() => {
    if (!apiKey) {
      onFallbackToLeaflet('Google Maps API key not set in environment.');
      return;
    }

    // Capture global auth failure callback
    (window as any).gm_authFailure = () => {
      console.warn('Google Maps authentication failed (gm_authFailure). Switching to free map stack.');
      onFallbackToLeaflet('Google Maps API key is invalid or unauthorized for this domain.');
    };

    let isCancelled = false;

    setOptions({
      key: apiKey,
      v: 'weekly',
    });

    Promise.all([
      importLibrary('maps'),
      importLibrary('marker'),
    ])
      .then(([mapsLib]) => {
        if (isCancelled || !mapContainerRef.current) return;

        const map = new mapsLib.Map(mapContainerRef.current, {
          center: { lat: center[0], lng: center[1] },
          zoom,
          mapTypeId: 'roadmap',
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: {
            position: google.maps.ControlPosition.RIGHT_BOTTOM,
          },
          fullscreenControl: false,
          gestureHandling: 'greedy',
        });

        // Setup Traffic layer
        const trafficLayer = new mapsLib.TrafficLayer();
        trafficLayer.setMap(map);
        trafficLayerRef.current = trafficLayer;

        mapInstanceRef.current = map;
        infoWindowRef.current = new mapsLib.InfoWindow();

        // Bounds listener
        map.addListener('idle', () => {
          if (!onBoundsChange) return;
          const bounds = map.getBounds();
          if (bounds) {
            const ne = bounds.getNorthEast();
            const sw = bounds.getSouthWest();
            onBoundsChange({
              north: ne.lat(),
              east: ne.lng(),
              south: sw.lat(),
              west: sw.lng(),
            });
          }
        });

        setIsApiLoaded(true);
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error('Failed to load Google Maps SDK:', err);
        setLoadError(err.message || 'Error loading Google Maps');
        onFallbackToLeaflet(`Google Maps SDK load error: ${err.message || 'Network error'}`);
      });

    return () => {
      isCancelled = true;
    };
  }, [apiKey, onFallbackToLeaflet]);

  // 2. Sync center when center prop changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isApiLoaded) return;
    map.panTo({ lat: center[0], lng: center[1] });
  }, [center, isApiLoaded]);

  // 3. User Live Location Marker (Blue Dot + Accuracy Circle)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isApiLoaded) return;

    if (!userLocation) {
      if (userMarkerRef.current) {
        userMarkerRef.current.setMap(null);
        userMarkerRef.current = null;
      }
      if (userAccuracyCircleRef.current) {
        userAccuracyCircleRef.current.setMap(null);
        userAccuracyCircleRef.current = null;
      }
      return;
    }

    const pos = { lat: userLocation[0], lng: userLocation[1] };

    if (!userMarkerRef.current) {
      userMarkerRef.current = new google.maps.Marker({
        position: pos,
        map,
        title: 'Your Location',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#3b82f6',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
        zIndex: 999,
      });
    } else {
      userMarkerRef.current.setPosition(pos);
    }

    if (userAccuracy && userAccuracy > 0) {
      if (!userAccuracyCircleRef.current) {
        userAccuracyCircleRef.current = new google.maps.Circle({
          map,
          center: pos,
          radius: userAccuracy,
          fillColor: '#3b82f6',
          fillOpacity: 0.12,
          strokeColor: '#3b82f6',
          strokeOpacity: 0.4,
          strokeWeight: 1,
        });
      } else {
        userAccuracyCircleRef.current.setCenter(pos);
        userAccuracyCircleRef.current.setRadius(userAccuracy);
      }
    }
  }, [userLocation, userAccuracy, isApiLoaded]);

  // 4. Station Pins on Map (Red Pins with ⚡ bolt)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isApiLoaded) return;

    const existingMarkers = markersMapRef.current;
    const currentIds = new Set<number | string>();

    stations.forEach((station) => {
      currentIds.add(station.id);
      const isSelected = selectedStation?.id === station.id;

      const pinSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">
          <defs>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.4"/>
            </filter>
          </defs>
          <path d="M17 0C7.6 0 0 7.6 0 17c0 12.8 17 25 17 25s17-12.2 17-25C34 7.6 26.4 0 17 0z" fill="${isSelected ? '#06b6d4' : '#ef4444'}" filter="url(#shadow)"/>
          <circle cx="17" cy="16" r="11" fill="${isSelected ? '#0891b2' : '#dc2626'}"/>
          <path d="M18 9l-5 8h4l-2 7 6-9h-4l2-6z" fill="#ffffff"/>
        </svg>
      `;
      const pinIconUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(pinSvg)}`;

      let marker = existingMarkers.get(station.id);

      if (!marker) {
        marker = new google.maps.Marker({
          position: { lat: station.latitude, lng: station.longitude },
          map,
          title: station.station_name,
          icon: {
            url: pinIconUrl,
            scaledSize: new google.maps.Size(34, 42),
            anchor: new google.maps.Point(17, 42),
          },
          zIndex: isSelected ? 100 : 10,
        });

        marker.addListener('click', () => {
          onSelectStation(station);

          if (infoWindowRef.current) {
            const content = `
              <div style="font-family: sans-serif; color: #0f172a; padding: 4px; max-width: 220px;">
                <h4 style="margin: 0 0 4px 0; font-size: 13px; font-weight: bold;">${station.station_name}</h4>
                <p style="margin: 0 0 4px 0; font-size: 11px; color: #475569;">${station.address}</p>
                <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 6px;">
                  <span style="color: #059669; font-weight: 600;">⚡ ${station.charging_power} kW</span>
                  <span style="color: #64748b;">${station.connector_type || 'Type 2'}</span>
                </div>
                <a href="https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}" 
                   target="_blank" 
                   style="display: inline-block; padding: 4px 8px; background: #0891b2; color: white; text-decoration: none; border-radius: 4px; font-size: 11px; font-weight: 500;">
                  Get Directions
                </a>
              </div>
            `;
            infoWindowRef.current.setContent(content);
            infoWindowRef.current.open(map, marker);
          }
        });

        existingMarkers.set(station.id, marker);
      } else {
        marker.setPosition({ lat: station.latitude, lng: station.longitude });
        marker.setIcon({
          url: pinIconUrl,
          scaledSize: new google.maps.Size(34, 42),
          anchor: new google.maps.Point(17, 42),
        });
        marker.setZIndex(isSelected ? 100 : 10);
      }
    });

    existingMarkers.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.setMap(null);
        existingMarkers.delete(id);
      }
    });
  }, [stations, selectedStation, isApiLoaded, onSelectStation]);

  // 5. Route Polyline
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isApiLoaded) return;

    if (!routeGeometry || routeGeometry.length === 0) {
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
        routePolylineRef.current = null;
      }
      return;
    }

    const path = routeGeometry.map(([lat, lng]) => ({ lat, lng }));

    if (!routePolylineRef.current) {
      routePolylineRef.current = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: '#06b6d4',
        strokeOpacity: 0.9,
        strokeWeight: 5,
        map,
      });
    } else {
      routePolylineRef.current.setPath(path);
      routePolylineRef.current.setMap(map);
    }
  }, [routeGeometry, isApiLoaded]);

  // Toggle Traffic Layer
  const handleToggleTraffic = useCallback(() => {
    if (!trafficLayerRef.current) return;
    const nextState = !trafficActive;
    setTrafficActive(nextState);
    trafficLayerRef.current.setMap(nextState ? mapInstanceRef.current : null);
  }, [trafficActive]);

  // Change Map Type
  const handleSelectMapType = (type: string) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    setMapType(type);
    map.setMapTypeId(type);
    setShowLayerMenu(false);
  };

  // Center on user
  const handleCenterOnUser = () => {
    const map = mapInstanceRef.current;
    if (!map || !userLocation) return;
    map.panTo({ lat: userLocation[0], lng: userLocation[1] });
    map.setZoom(15);
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
      {/* Map DOM Element */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Top Left: Layers Selector */}
      <div className="absolute top-4 left-4 z-10">
        <div className="relative">
          <button
            onClick={() => setShowLayerMenu(!showLayerMenu)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-100 text-xs font-semibold backdrop-blur-md border border-slate-700 shadow-xl transition-all"
            title="Switch map layer"
          >
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="capitalize">{mapType}</span>
          </button>

          {showLayerMenu && (
            <div className="absolute top-full left-0 mt-2 w-36 rounded-xl bg-slate-900/95 border border-slate-700 shadow-2xl backdrop-blur-md overflow-hidden text-xs py-1">
              {(['roadmap', 'satellite', 'hybrid', 'terrain'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => handleSelectMapType(type)}
                  className={`w-full text-left px-3 py-2 capitalize transition-colors ${
                    mapType === type
                      ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Center: Live Traffic Bar matching reference screenshot */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-slate-900/90 backdrop-blur-md border border-slate-700 text-slate-100 text-xs shadow-2xl">
        <button
          onClick={handleToggleTraffic}
          className={`flex items-center gap-1.5 font-medium transition-colors ${
            trafficActive ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Car className="w-3.5 h-3.5" />
          <span>Live traffic</span>
        </button>

        <div className="h-3 w-px bg-slate-700" />

        {/* Speed Legend */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <span>Fast</span>
          <div className="flex h-1.5 w-16 rounded-full overflow-hidden">
            <div className="w-1/3 bg-emerald-500" />
            <div className="w-1/3 bg-amber-500" />
            <div className="w-1/3 bg-red-600" />
          </div>
          <span>Slow</span>
        </div>
      </div>

      {/* Bottom Right: Center Location Button */}
      {userLocation && (
        <button
          onClick={handleCenterOnUser}
          title="Recenter on live GPS"
          className="absolute bottom-6 right-16 z-10 p-2.5 rounded-full bg-slate-900/90 hover:bg-slate-800 text-cyan-400 backdrop-blur-md border border-slate-700 shadow-xl transition-all"
        >
          <Navigation2 className="w-4 h-4" />
        </button>
      )}

      {/* Error / Fallback Alert if initial load failed */}
      {loadError && (
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-300 text-xs shadow-xl backdrop-blur-md">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Google Maps failed to load. Falling back to free OpenStreetMap.</span>
        </div>
      )}
    </div>
  );
};

export default GoogleMapView;
