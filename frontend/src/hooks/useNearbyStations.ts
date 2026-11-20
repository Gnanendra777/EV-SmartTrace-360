import { useState, useEffect, useRef, useCallback } from 'react';
import { ChargingStation } from '../types';
import { api, generateOfflineSampleStations } from '../services/api';

interface UseNearbyStationsOptions {
  userCoords: [number, number] | null;
  radiusKm?: number;
  connectorFilter?: string;
  minPowerFilter?: number;
  searchQuery?: string;
}

// Distance helper
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function useNearbyStations({
  userCoords,
  radiusKm = 25,
  connectorFilter = 'All',
  minPowerFilter = 0,
  searchQuery = '',
}: UseNearbyStationsOptions) {
  const [stations, setStations] = useState<ChargingStation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isOfflineSample, setIsOfflineSample] = useState<boolean>(false);

  const lastFetchCenterRef = useRef<[number, number] | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const fetchStations = useCallback(async (
    lat: number,
    lng: number,
    force: boolean = false
  ) => {
    // If not forced and user moved less than 500m (0.5km), do not re-query the network
    if (
      !force &&
      lastFetchCenterRef.current &&
      distanceKm(lastFetchCenterRef.current[0], lastFetchCenterRef.current[1], lat, lng) < 0.5
    ) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await api.getNearbyStations(
        lat,
        lng,
        radiusKm,
        connectorFilter,
        minPowerFilter,
        60
      );

      if (!isMountedRef.current) return;

      lastFetchCenterRef.current = [lat, lng];
      const hasSample = data.some((s) => s.is_offline_sample);
      setIsOfflineSample(hasSample);
      setStations(data);
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.warn('Failed to fetch nearby stations, applying local sample:', err);
      const fallback = generateOfflineSampleStations(lat, lng);
      setStations(fallback);
      setIsOfflineSample(true);
      setError('Live station network unreachable. Showing local offline preview.');
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [radiusKm, connectorFilter, minPowerFilter]);

  const searchInArea = useCallback(async (bounds: { south: number; west: number; north: number; east: number }) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getStationsInBounds(
        bounds.south,
        bounds.west,
        bounds.north,
        bounds.east,
        connectorFilter,
        minPowerFilter
      );
      if (!isMountedRef.current) return;
      setIsOfflineSample(false);
      setStations(data);
      const centerLat = (bounds.south + bounds.north) / 2;
      const centerLng = (bounds.west + bounds.east) / 2;
      lastFetchCenterRef.current = [centerLat, centerLng];
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setError('Failed to search area. Please try again.');
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [connectorFilter, minPowerFilter]);

  // Debounced effect when userCoords change
  useEffect(() => {
    if (!userCoords) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchStations(userCoords[0], userCoords[1], false);
    }, 600);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [userCoords, fetchStations]);

  // Filter stations locally based on client search query
  const filteredStations = stations.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      s.station_name.toLowerCase().includes(q) ||
      (s.address && s.address.toLowerCase().includes(q)) ||
      (s.operator && s.operator.toLowerCase().includes(q)) ||
      (s.connector_type && s.connector_type.toLowerCase().includes(q))
    );
  });

  const refresh = useCallback(() => {
    if (userCoords) {
      fetchStations(userCoords[0], userCoords[1], true);
    }
  }, [userCoords, fetchStations]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    stations: filteredStations,
    rawStations: stations,
    isLoading,
    error,
    isOfflineSample,
    searchInArea,
    refresh,
  };
}
