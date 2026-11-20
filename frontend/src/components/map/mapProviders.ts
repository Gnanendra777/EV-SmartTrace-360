export type MapLayerType = 'street' | 'satellite' | 'hybrid' | 'terrain' | 'dark';

export interface MapLayerConfig {
  id: MapLayerType;
  label: string;
  description: string;
  url: string;
  attribution: string;
  maxZoom: number;
  subdomains?: string[];
  overlayUrl?: string;
  overlayAttribution?: string;
  cssClass?: string;
}

export const MAP_LAYERS: Record<MapLayerType, MapLayerConfig> = {
  street: {
    id: 'street',
    label: 'Street',
    description: 'Standard OpenStreetMap vector layout',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    maxZoom: 19,
    subdomains: ['a', 'b', 'c'],
  },
  satellite: {
    id: 'satellite',
    label: 'Satellite',
    description: 'High-resolution Esri World Imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19,
  },
  hybrid: {
    id: 'hybrid',
    label: 'Hybrid',
    description: 'Satellite imagery with roads and labels',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    overlayUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Boundaries &copy; Esri, HERE, Garmin',
    maxZoom: 19,
  },
  terrain: {
    id: 'terrain',
    label: 'Terrain',
    description: 'OpenTopoMap topographic contours & hillshading',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    maxZoom: 17,
    subdomains: ['a', 'b', 'c'],
  },
  dark: {
    id: 'dark',
    label: 'Dark Cockpit',
    description: 'High-contrast dark EV cockpit mode (OSM + CSS filter)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    maxZoom: 19,
    subdomains: ['a', 'b', 'c'],
    cssClass: 'dark-tile-filter',
  },
};

const STORAGE_KEY = 'ev_smart_map_layer';

export function getStoredMapLayer(): MapLayerType {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (saved in MAP_LAYERS)) {
      return saved as MapLayerType;
    }
  } catch {
    // ignore localStorage errors (e.g. private browsing)
  }
  return 'dark'; // default to cockpit dark mode
}

export function setStoredMapLayer(layer: MapLayerType): void {
  try {
    localStorage.setItem(STORAGE_KEY, layer);
  } catch {
    // ignore
  }
}
