import React, { useState } from 'react';
import { GoogleMapView } from './GoogleMapView';
import { InteractiveMap } from '../InteractiveMap';
import { ChargingStation } from '../../types';
import { Info, X } from 'lucide-react';

export interface MapViewProps {
  stations?: ChargingStation[];
  routeWaypoints?: number[][];
  userLocation?: [number, number] | null;
  userAccuracy?: number | null;
  destinationLocation?: [number, number] | null;
  waypointLocation?: [number, number] | null;
  selectedStationId?: number | null;
  selectedStation?: ChargingStation | null;
  center?: [number, number];
  zoom?: number;
  onSelectStation?: (station: ChargingStation) => void;
  onLocateMe?: () => void;
  onSearchThisArea?: (bounds: { south: number; west: number; north: number; east: number }) => void;
  className?: string;
}

export const MapView: React.FC<MapViewProps> = (props) => {
  const googleApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const configuredProvider = (import.meta.env.VITE_MAPS_PROVIDER || 'auto').toLowerCase();

  // Initial determination of map provider
  const shouldTryGoogle =
    (configuredProvider === 'google' || (configuredProvider === 'auto' && Boolean(googleApiKey))) &&
    Boolean(googleApiKey);

  const [activeProvider, setActiveProvider] = useState<'google' | 'leaflet'>(
    shouldTryGoogle ? 'google' : 'leaflet'
  );
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);

  const handleFallbackToLeaflet = (reason: string) => {
    console.warn('Switching to Leaflet fallback due to:', reason);
    setActiveProvider('leaflet');
    setFallbackNotice(`Google Maps unavailable (${reason}). Active on OpenStreetMap free stack.`);
  };

  const centerCoord: [number, number] =
    props.userLocation ||
    props.center ||
    (props.stations && props.stations.length > 0
      ? [props.stations[0].latitude, props.stations[0].longitude]
      : [20.5937, 78.9629]);

  const currentSelectedStation =
    props.selectedStation ||
    (props.selectedStationId && props.stations
      ? props.stations.find((s) => s.id === props.selectedStationId) || null
      : null);

  return (
    <div className={`relative w-full h-full min-h-[460px] ${props.className || ''}`}>
      {/* Fallback Notice Banner */}
      {fallbackNotice && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] max-w-lg w-11/12 bg-slate-900/95 border border-cyan-500/40 text-slate-200 text-xs px-3.5 py-2 rounded-xl shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{fallbackNotice}</span>
          </div>
          <button
            onClick={() => setFallbackNotice(null)}
            className="text-slate-400 hover:text-slate-200 p-0.5 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {activeProvider === 'google' ? (
        <GoogleMapView
          center={centerCoord}
          zoom={props.zoom || 13}
          userLocation={props.userLocation || null}
          userAccuracy={props.userAccuracy || null}
          stations={props.stations || []}
          selectedStation={currentSelectedStation}
          onSelectStation={props.onSelectStation || (() => {})}
          routeGeometry={props.routeWaypoints as [number, number][] | undefined}
          onBoundsChange={props.onSearchThisArea}
          onFallbackToLeaflet={handleFallbackToLeaflet}
        />
      ) : (
        <InteractiveMap
          {...props}
          selectedStationId={currentSelectedStation?.id ?? props.selectedStationId}
          center={centerCoord}
        />
      )}
    </div>
  );
};

export default MapView;
