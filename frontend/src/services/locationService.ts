import { api } from './api';
import { GeocodePlace } from '../types';

export interface LocationState {
  coords: [number, number] | null;
  accuracy?: number;
  status: 'idle' | 'locating' | 'located' | 'denied' | 'unavailable' | 'timeout';
  errorMessage?: string;
  source: 'gps' | 'manual';
}

/**
 * Request real user GPS coordinates via browser Geolocation API.
 * Never invents or fabricates fake current locations.
 * Requires secure context (HTTPS) or localhost.
 */
export const requestUserLocation = (): Promise<{ lat: number; lng: number; accuracy: number }> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      return reject(new Error('Geolocation is not supported by your browser or environment.'));
    }

    // Geolocation requires secure context in modern browsers
    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return reject(new Error('Browser GPS requires a secure HTTPS connection. Please use HTTPS or enter your location manually.'));
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error('GPS location access was denied by your browser. Please allow location permissions in your browser or search for your location manually.'));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error('GPS position is currently unavailable. Please check that location services are enabled on your device.'));
            break;
          case error.TIMEOUT:
            reject(new Error('GPS detection timed out. Preserving your last known location. Click "Locate Me" to retry.'));
            break;
          default:
            reject(new Error('An unknown error occurred while acquiring GPS position.'));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000
      }
    );
  });
};

/**
 * Subscribe to continuous GPS location updates via watchPosition.
 * Returns a cleanup function to unsubscribe.
 */
export const watchUserLocation = (
  onSuccess: (loc: { lat: number; lng: number; accuracy: number }) => void,
  onError?: (err: Error) => void
): (() => void) => {
  if (typeof window === 'undefined' || !('geolocation' in navigator)) {
    if (onError) onError(new Error('Geolocation not supported.'));
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      onSuccess({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      });
    },
    (error) => {
      let msg = 'GPS error occurred.';
      if (error.code === error.PERMISSION_DENIED) {
        msg = 'GPS permission denied.';
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        msg = 'GPS signal unavailable.';
      } else if (error.code === error.TIMEOUT) {
        msg = 'GPS signal timed out.';
      }
      if (onError) onError(new Error(msg));
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000
    }
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
};

/**
 * Calculate great-circle distance between two GPS coordinates in kilometers using Haversine formula.
 */
export const calculateDistanceKm = (
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number => {
  if (
    lat1 === undefined || lon1 === undefined || 
    lat2 === undefined || lon2 === undefined ||
    isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)
  ) {
    return 0;
  }
  const R = 6371.0;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
};

/**
 * Format GPS coordinates cleanly for UI display.
 */
export const formatCoordinates = (lat: number, lng: number): string => {
  if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) return 'Unknown Coordinates';
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
};

/**
 * Search places and destinations using Nominatim via backend proxy.
 */
export const searchPlaces = async (query: string): Promise<GeocodePlace[]> => {
  if (!query || query.trim().length < 2) return [];
  try {
    return await api.geocode(query.trim());
  } catch (err) {
    console.warn('Geocoding search notice:', err);
    return [];
  }
};
