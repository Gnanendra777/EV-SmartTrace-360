import React, { useState } from 'react';
import { 
  Search, X, Share2, Globe, Navigation, Star, Zap, Clock, Phone,
  SlidersHorizontal, Check, AlertCircle, RefreshCw, ChevronDown
} from 'lucide-react';
import { ChargingStation } from '../types';

/**
 * Switchable constant for panel layout placement:
 * Set to 'right' (default, matches requested layout) or 'left'.
 */
export const STATIONS_PANEL_SIDE: 'right' | 'left' = 'right';

interface StationsPanelProps {
  stations: ChargingStation[];
  isLoading: boolean;
  selectedStation: ChargingStation | null;
  onSelectStation: (station: ChargingStation) => void;
  onHoverStation?: (station: ChargingStation | null) => void;
  onAddWaypoint?: (station: ChargingStation) => void;
  onRouteToStation?: (station: ChargingStation) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  connectorFilter: string;
  onConnectorFilterChange: (connector: string) => void;
  minPowerFilter: number;
  onMinPowerFilterChange: (power: number) => void;
  updateOnMove: boolean;
  onToggleUpdateOnMove: (val: boolean) => void;
  isOfflineSample?: boolean;
  onRefresh?: () => void;
  onExpandRadius?: () => void;
}

const CONNECTOR_CHIPS = ['All', 'CCS2', 'Type 2', 'CHAdeMO'];

export const StationsPanel: React.FC<StationsPanelProps> = ({
  stations,
  isLoading,
  selectedStation,
  onSelectStation,
  onHoverStation,
  onAddWaypoint,
  onRouteToStation,
  searchQuery,
  onSearchChange,
  connectorFilter,
  onConnectorFilterChange,
  minPowerFilter,
  onMinPowerFilterChange,
  updateOnMove,
  onToggleUpdateOnMove,
  isOfflineSample,
  onRefresh,
  onExpandRadius,
}) => {
  const [copiedShare, setCopiedShare] = useState<boolean>(false);
  const [showFiltersDropdown, setShowFiltersDropdown] = useState<boolean>(false);
  const [onlyOpen24Hours, setOnlyOpen24Hours] = useState<boolean>(false);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'EV Charging Stations',
          text: 'Check out nearby EV charging stations on EV SmartTrace 360',
          url,
        });
        return;
      } catch {
        // user cancelled or share failed, fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2500);
    } catch {
      // ignore
    }
  };

  const filteredStations = stations.filter((s) => {
    if (onlyOpen24Hours) {
      const hours = (s.opening_hours || '').toLowerCase();
      if (!hours.includes('24')) return false;
    }
    return true;
  });

  return (
    <aside
      aria-label="Charging stations search and results"
      className="w-full h-full flex flex-col bg-slate-900/95 backdrop-blur-md border border-slate-800 text-slate-100 shadow-2xl overflow-hidden"
    >
      {/* Search Bar Header */}
      <div className="p-3.5 border-b border-slate-800 space-y-3 bg-slate-900/70">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search stations, area or operator..."
            className="w-full bg-slate-800/90 text-sm text-slate-100 pl-9 pr-9 py-2 rounded-lg border border-slate-700/80 focus:outline-none focus:border-cyan-500/80 transition-colors placeholder:text-slate-500"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="absolute right-2.5 p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Chips Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          {/* Quick Hours Filter */}
          <button
            onClick={() => setOnlyOpen24Hours(!onlyOpen24Hours)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border transition-all whitespace-nowrap font-medium ${
              onlyOpen24Hours
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                : 'bg-slate-800/80 text-slate-300 border-slate-700/80 hover:bg-slate-800'
            }`}
          >
            <Clock className="w-3 h-3 text-cyan-400" />
            <span>24 Hours</span>
          </button>

          {/* Power Fast Charger Filter */}
          <button
            onClick={() => onMinPowerFilterChange(minPowerFilter >= 50 ? 0 : 50)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border transition-all whitespace-nowrap font-medium ${
              minPowerFilter >= 50
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                : 'bg-slate-800/80 text-slate-300 border-slate-700/80 hover:bg-slate-800'
            }`}
          >
            <Zap className="w-3 h-3 text-emerald-400" />
            <span>Fast (≥50 kW)</span>
          </button>

          {/* Connector Filters */}
          {CONNECTOR_CHIPS.map((chip) => {
            const active = connectorFilter === chip;
            return (
              <button
                key={chip}
                onClick={() => onConnectorFilterChange(chip)}
                className={`px-2.5 py-1 rounded-full border transition-all whitespace-nowrap font-medium ${
                  active
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/50'
                    : 'bg-slate-800/80 text-slate-300 border-slate-700/80 hover:bg-slate-800'
                }`}
              >
                {chip}
              </button>
            );
          })}
        </div>

        {/* Results Bar with Share */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-200">
              Results ({filteredStations.length})
            </span>
            {isLoading && (
              <span className="inline-flex items-center gap-1 text-[11px] text-cyan-400 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Scanning live...
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              title="Share station list link"
              className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 px-2 py-1 rounded hover:bg-cyan-950/40 transition-colors"
            >
              {copiedShare ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3 h-3" />
                  <span>Share</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Offline Sample Warning Banner */}
      {isOfflineSample && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-3.5 py-2 text-xs text-amber-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span>Showing local demo preview stations.</span>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="text-[11px] font-semibold underline hover:text-amber-200"
            >
              Retry Live
            </button>
          )}
        </div>
      )}

      {/* Station List Content */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80">
        {isLoading && filteredStations.length === 0 ? (
          // Skeleton loader
          <div className="p-4 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 animate-pulse space-y-2.5"
              >
                <div className="h-4 bg-slate-700/60 rounded w-3/4" />
                <div className="h-3 bg-slate-700/40 rounded w-1/2" />
                <div className="h-3 bg-slate-700/30 rounded w-2/3" />
                <div className="flex gap-2 pt-2">
                  <div className="h-6 bg-slate-700/50 rounded w-20" />
                  <div className="h-6 bg-slate-700/50 rounded w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredStations.length === 0 ? (
          // Empty state
          <div className="p-8 text-center space-y-3 text-slate-400">
            <div className="w-12 h-12 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
              <Zap className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-slate-200">No charging stations found</h4>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              No matching EV stations found in this radius with current filters. Try broadening your criteria.
            </p>
            {onExpandRadius && (
              <button
                onClick={onExpandRadius}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 text-xs font-medium border border-cyan-500/40 transition-colors"
              >
                Expand Search to 50 km
              </button>
            )}
          </div>
        ) : (
          // Station Cards List
          filteredStations.map((station) => {
            const isSelected = selectedStation?.id === station.id;

            return (
              <article
                key={station.id}
                onClick={() => onSelectStation(station)}
                onMouseEnter={() => onHoverStation?.(station)}
                onMouseLeave={() => onHoverStation?.(null)}
                className={`p-3.5 cursor-pointer transition-all border-l-4 ${
                  isSelected
                    ? 'bg-slate-800/90 border-l-cyan-400 shadow-inner'
                    : 'bg-slate-900/40 border-l-transparent hover:bg-slate-800/50 hover:border-l-slate-600'
                }`}
              >
                {/* Station Title & Rating */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-100 truncate hover:text-cyan-300 transition-colors">
                      {station.station_name}
                    </h3>

                    {/* Rating row: only render when actual rating is available from provider */}
                    {typeof station.rating === 'number' && (
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs">
                        <span className="font-semibold text-amber-300">{station.rating.toFixed(1)}</span>
                        <div className="flex items-center text-amber-400">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3 h-3 ${
                                i < Math.round(station.rating || 0)
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-600'
                              }`}
                            />
                          ))}
                        </div>
                        {station.reviews_count !== null && station.reviews_count !== undefined && (
                          <span className="text-slate-400">({station.reviews_count})</span>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      Electric vehicle charging station · {station.operator || 'EV Network'}
                    </p>
                  </div>

                  {/* Distance badge */}
                  {station.distance_km !== undefined && (
                    <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 border border-slate-700">
                      {station.distance_km < 1
                        ? `${Math.round(station.distance_km * 1000)} m`
                        : `${station.distance_km.toFixed(1)} km`}
                    </span>
                  )}
                </div>

                {/* Address & Hours */}
                <div className="mt-2 text-xs text-slate-300 space-y-1">
                  <p className="line-clamp-1 text-slate-400">{station.address}</p>

                  <div className="flex flex-wrap items-center gap-3 text-[11px]">
                    {station.opening_hours ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <Clock className="w-3 h-3" />
                        {station.opening_hours}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Clock className="w-3 h-3" />
                        Open 24 hours
                      </span>
                    )}

                    {station.phone_number && (
                      <a
                        href={`tel:${station.phone_number}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-slate-300 hover:text-cyan-300 transition-colors"
                      >
                        <Phone className="w-3 h-3 text-cyan-400" />
                        {station.phone_number}
                      </a>
                    )}
                  </div>
                </div>

                {/* Review Snippet: only if present */}
                {station.review_snippet && (
                  <p className="mt-2 text-[11px] text-slate-300 italic bg-slate-800/40 p-2 rounded-lg border border-slate-800">
                    "{station.review_snippet}"
                  </p>
                )}

                {/* Connectors & Power details */}
                <div className="mt-2.5 space-y-1.5 pt-2 border-t border-slate-800/60">
                  {station.ports_detail && station.ports_detail.length > 0 ? (
                    station.ports_detail.map((port, pIdx) => (
                      <div
                        key={pIdx}
                        className="flex items-center justify-between text-xs bg-slate-800/50 px-2.5 py-1.5 rounded-md border border-slate-800"
                      >
                        <div className="flex items-center gap-1.5 text-slate-200">
                          <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="font-medium">{port.connector}</span>
                          <span className="text-slate-400">· {port.power_kw} kW</span>
                        </div>
                        {port.available !== null && port.available !== undefined ? (
                          <span
                            className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                              port.available > 0
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-red-500/20 text-red-300'
                            }`}
                          >
                            {port.available}/{port.total} available
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {port.total} ports
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-between text-xs bg-slate-800/50 px-2.5 py-1.5 rounded-md border border-slate-800">
                      <div className="flex items-center gap-1.5 text-slate-200">
                        <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{station.connector_type || 'Type 2'}</span>
                        <span className="text-slate-400">· {station.charging_power} kW</span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {station.connections_count || 2} ports
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions row matching Google Maps card UI */}
                <div className="mt-3 flex items-center gap-2 pt-1">
                  {station.website_url && (
                    <a
                      href={station.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700/80 text-xs font-medium text-slate-200 border border-slate-700 transition-colors"
                    >
                      <Globe className="w-3 h-3 text-cyan-400" />
                      <span>Website</span>
                    </a>
                  )}

                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-xs font-medium text-cyan-300 border border-cyan-500/40 transition-colors"
                  >
                    <Navigation className="w-3 h-3" />
                    <span>Directions</span>
                  </a>

                  {onRouteToStation && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRouteToStation(station);
                      }}
                      className="py-1.5 px-2.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-xs font-medium text-emerald-300 border border-emerald-500/40 transition-colors"
                    >
                      Route
                    </button>
                  )}

                  {onAddWaypoint && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddWaypoint(station);
                      }}
                      title="Add as charging stop"
                      className="py-1.5 px-2 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-xs font-medium text-purple-300 border border-purple-500/40 transition-colors"
                    >
                      + Stop
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Footer check: Update results when map moves */}
      <div className="p-2.5 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400">
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={updateOnMove}
            onChange={(e) => onToggleUpdateOnMove(e.target.checked)}
            className="w-3.5 h-3.5 rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
          />
          <span className="text-[11px] text-slate-300">Update results when map moves</span>
        </label>
        {onRefresh && (
          <button
            onClick={onRefresh}
            title="Refresh stations"
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>
    </aside>
  );
};

export default StationsPanel;
