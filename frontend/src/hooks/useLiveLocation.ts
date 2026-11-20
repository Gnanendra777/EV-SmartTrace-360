import { useState, useEffect, useCallback, useRef } from 'react';

export interface LiveLocation {
  coords: [number, number] | null;
  accuracy: number | null; // in meters
  heading?: number | null;
  speed?: number | null;
  status: 'locating' | 'ready' | 'error' | 'denied';
  source: 'gps' | 'ip' | 'manual';
  isApproximate: boolean;
  errorMessage: string | null;
  placeLabel?: string;
  timestamp?: number;
}

const STORAGE_LAST_LOCATION_KEY = 'ev_smart_last_location';

export function useLiveLocation() {
  const [location, setLocation] = useState<LiveLocation>(() => {
    // Attempt to restore last known location from localStorage for instant map render
    try {
      const saved = localStorage.getItem(STORAGE_LAST_LOCATION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.coords) && parsed.coords.length === 2) {
          return {
            coords: [parsed.coords[0], parsed.coords[1]],
            accuracy: parsed.accuracy ?? null,
            status: 'locating',
            source: parsed.source || 'gps',
            isApproximate: Boolean(parsed.isApproximate),
            errorMessage: null,
            placeLabel: parsed.placeLabel,
            timestamp: parsed.timestamp,
          };
        }
      }
    } catch {
      // ignore
    }
    return {
      coords: null,
      accuracy: null,
      status: 'locating',
      source: 'gps',
      isApproximate: false,
      errorMessage: null,
    };
  });

  const watchIdRef = useRef<number | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const persistLocation = (loc: Partial<LiveLocation>) => {
    try {
      if (loc.coords) {
        localStorage.setItem(
          STORAGE_LAST_LOCATION_KEY,
          JSON.stringify({
            coords: loc.coords,
            accuracy: loc.accuracy,
            source: loc.source,
            isApproximate: loc.isApproximate,
            placeLabel: loc.placeLabel,
            timestamp: Date.now(),
          })
        );
      }
    } catch {
      // ignore
    }
  };

  // Fallback to IP geolocation when browser GPS is denied or completely unavailable
  const fetchIpLocation = useCallback(async (errorMsg?: string) => {
    try {
      const res = await fetch('https://ipwho.is/');
      if (!res.ok) throw new Error('IP lookup failed');
      const data = await res.json();
      if (data && data.success && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        if (!isMountedRef.current) return;
        const newLoc: LiveLocation = {
          coords: [data.latitude, data.longitude],
          accuracy: 10000, // IP accuracy ~10km
          status: 'ready',
          source: 'ip',
          isApproximate: true,
          errorMessage: errorMsg || 'Using approximate location based on IP network.',
          placeLabel: [data.city, data.region, data.country].filter(Boolean).join(', '),
          timestamp: Date.now(),
        };
        setLocation(newLoc);
        persistLocation(newLoc);
        return;
      }
    } catch {
      // silent fallback fail
    }

    if (isMountedRef.current) {
      setLocation((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: errorMsg || 'Unable to determine location. Please search manually.',
      }));
    }
  }, []);

  const startWatchingGps = useCallback(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      fetchIpLocation('Geolocation not supported by your browser.');
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setLocation((prev) => ({ ...prev, status: 'locating', errorMessage: null }));

    const handleSuccess = (pos: GeolocationPosition) => {
      if (!isMountedRef.current) return;
      const { latitude, longitude, accuracy, heading, speed } = pos.coords;
      const newLoc: LiveLocation = {
        coords: [latitude, longitude],
        accuracy: typeof accuracy === 'number' ? Math.round(accuracy) : null,
        heading: typeof heading === 'number' ? heading : null,
        speed: typeof speed === 'number' ? speed : null,
        status: 'ready',
        source: 'gps',
        isApproximate: false,
        errorMessage: null,
        timestamp: pos.timestamp,
      };
      setLocation(newLoc);
      persistLocation(newLoc);
    };

    const handleError = (err: GeolocationPositionError) => {
      if (!isMountedRef.current) return;
      let msg = 'Failed to acquire GPS location.';
      let denied = false;

      switch (err.code) {
        case err.PERMISSION_DENIED:
          msg = 'Location permission was denied. Tap Locate Me or allow location access in your browser settings.';
          denied = true;
          break;
        case err.POSITION_UNAVAILABLE:
          msg = 'GPS signal unavailable. Falling back to network location.';
          break;
        case err.TIMEOUT:
          msg = 'GPS location timed out. Preserving last known position.';
          break;
      }

      // If we don't have coordinates yet, try IP fallback
      setLocation((prev) => {
        if (!prev.coords) {
          fetchIpLocation(msg);
        }
        return {
          ...prev,
          status: denied ? 'denied' : 'error',
          errorMessage: msg,
        };
      });
    };

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(handleSuccess, handleError, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 5000,
      });
    } catch (e) {
      fetchIpLocation('Unable to start GPS watch.');
    }
  }, [fetchIpLocation]);

  const locateMe = useCallback(() => {
    startWatchingGps();
  }, [startWatchingGps]);

  const setManualLocation = useCallback((coords: [number, number], label?: string) => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    const newLoc: LiveLocation = {
      coords,
      accuracy: 50,
      status: 'ready',
      source: 'manual',
      isApproximate: false,
      errorMessage: null,
      placeLabel: label,
      timestamp: Date.now(),
    };
    setLocation(newLoc);
    persistLocation(newLoc);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    startWatchingGps();

    return () => {
      isMountedRef.current = false;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [startWatchingGps]);

  return {
    ...location,
    locateMe,
    setManualLocation,
  };
}
