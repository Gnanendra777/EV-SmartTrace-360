import { api } from './api';
import { GeocodePlace } from '../types';

export interface LocationState {
  coords: [number, number] | null;
  accuracy?: number;
  status: 'idle' | 'locating' | 'located' | 'denied' | 'unavailable' | 'timeout';
  errorMessage?: string;
  source: 'gps' | 'manual' | 'default';
}

/**
 * Request real user GPS coordinates via browser Geolocation API.
 * Never invents or fabricates fake current locations.
 */
export const requestUserLocation = (): Promise<{ lat: number; lng: number; accuracy: number }> => {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      return reject(new Error('Geolocation is not supported by your browser.'));
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
            reject(new Error('GPS location access was denied. Please allow location permissions or enter coordinates manually.'));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error('Location information is currently unavailable.'));
            break;
          case error.TIMEOUT:
            reject(new Error('Location detection timed out. Please try again.'));
            break;
          default:
            reject(new Error('An unknown error occurred while retrieving GPS position.'));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      }
    );
  });
};

/**
 * Calculate great-circle distance between two GPS coordinates in kilometers.
 */
export const calculateDistanceKm = (
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number => {
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
    console.warn('Geocoding error:', err);
    return [];
  }
};
