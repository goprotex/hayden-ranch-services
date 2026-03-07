'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

/**
 * Mapbox satellite map with line drawing for fence bids.
 * Requires NEXT_PUBLIC_MAPBOX_TOKEN in env.
 */

interface FenceMapProps {
  onFenceLinesChange?: (lines: DrawnLine[]) => void;
  center?: [number, number]; // [lng, lat]
  zoom?: number;
}

export interface DrawnLine {
  id: string;
  coordinates: [number, number][];
  lengthFeet: number;
}

export default function FenceMap({
  onFenceLinesChange,
  center = [-98.23, 30.75], // Default: central Texas (Burnet area)
  zoom = 14,
}: FenceMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [token] = useState(process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '');
  const [error, setError] = useState('');
  const [totalLength, setTotalLength] = useState(0);
  const [lineCount, setLineCount] = useState(0);
  const [address, setAddress] = useState('');

  // Types for mapbox-gl-draw since we dynamic import
  type MapboxDraw = {
    getAll: () => GeoJSON.FeatureCollection;
    deleteAll: () => void;
    set: (fc: GeoJSON.FeatureCollection) => void;
  };

  // Calculate line length in feet from coordinate array
  const calcLineLengthFeet = useCallback((coords: [number, number][]) => {
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
      const [lng1, lat1] = coords[i - 1];
      const [lng2, lat2] = coords[i];
      // Haversine
      const R = 20902231; // Earth radius in feet
      const dLat = (lat2 - lat1) * (Math.PI / 180);
      const dLng = (lng2 - lng1) * (Math.PI / 180);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
      total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    return total;
  }, []);

  const syncDrawnLines = useCallback(() => {
    if (!drawRef.current) return;
    const fc = drawRef.current.getAll();
    const lines: DrawnLine[] = [];
    let total = 0;

    for (const feature of fc.features) {
      if (feature.geometry.type === 'LineString') {
        const coords = feature.geometry.coordinates as [number, number][];
        const len = calcLineLengthFeet(coords);
        total += len;
        lines.push({
          id: feature.id as string,
          coordinates: coords,
          lengthFeet: len,
        });
      }
    }

    setTotalLength(total);
    setLineCount(lines.length);
    onFenceLinesChange?.(lines);
  }, [calcLineLengthFeet, onFenceLinesChange]);

  // Geocode an address and fly to it
  const handleGeocode = useCallback(async () => {
    if (!address.trim() || !token || !mapRef.current) return;
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${token}&limit=1`
      );
      const data = await res.json();
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        mapRef.current.flyTo({ center: [lng, lat], zoom: 17, duration: 2000 });
      }
    } catch {
      // silently fail
    }
  }, [address, token]);

  useEffect(() => {
    if (!token) {
      setError('Missing NEXT_PUBLIC_MAPBOX_TOKEN. Add it to .env.local and restart.');
      return;
    }
    if (!mapContainer.current || mapRef.current) return;

    let cancelled = false;

    async function initMap() {
      try {
        // Dynamic imports so mapbox doesn't break SSR
        const mapboxgl = (await import('mapbox-gl')).default;

        const MapboxDrawModule = (await import('@mapbox/mapbox-gl-draw')).default;

        if (cancelled || !mapContainer.current) return;

        mapboxgl.accessToken = token;

        const map = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/satellite-streets-v12',
          center,
          zoom,
          attributionControl: false,
        });

        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        map.addControl(
          new mapboxgl.AttributionControl({ compact: true }),
          'bottom-right'
        );

        const draw = new MapboxDrawModule({
          displayControlsDefault: false,
          controls: {
            line_string: true,
            trash: true,
          },
          defaultMode: 'simple_select',
          styles: [
            // Line style - bright yellow for visibility on satellite
            {
              id: 'gl-draw-line',
              type: 'line',
              filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
              paint: { 'line-color': '#FFD700', 'line-width': 3, 'line-dasharray': [2, 1] },
            },
            {
              id: 'gl-draw-line-static',
              type: 'line',
              filter: ['all', ['==', '$type', 'LineString'], ['==', 'mode', 'static']],
              paint: { 'line-color': '#FFD700', 'line-width': 3 },
            },
            // Vertex points
            {
              id: 'gl-draw-point',
              type: 'circle',
              filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex']],
              paint: { 'circle-radius': 6, 'circle-color': '#FF4500' },
            },
            {
              id: 'gl-draw-point-mid',
              type: 'circle',
              filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
              paint: { 'circle-radius': 4, 'circle-color': '#FFD700' },
            },
          ],
        }) as unknown as MapboxDraw;

        map.addControl(draw as unknown as mapboxgl.IControl);

        map.on('draw.create', () => syncDrawnLines());
        map.on('draw.update', () => syncDrawnLines());
        map.on('draw.delete', () => syncDrawnLines());

        map.on('load', () => {
          if (!cancelled) setMapLoaded(true);
        });

        mapRef.current = map;
        drawRef.current = draw;
      } catch (err) {
        if (!cancelled) {
          console.error('Map init error:', err);
          setError('Failed to load Mapbox. Check your token and network connection.');
        }
      }
    }

    initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // No token — show setup instructions
  if (!token) {
    return (
      <div className="bg-steel-100 flex items-center justify-center" style={{ height: '500px' }}>
        <div className="text-center max-w-sm">
          <svg className="w-16 h-16 text-steel-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
          </svg>
          <p className="text-steel-500 font-medium mb-2">Mapbox Token Required</p>
          <p className="text-steel-400 text-sm">
            Create a <code className="bg-steel-200 px-1 rounded">.env.local</code> file with:
          </p>
          <code className="block bg-steel-800 text-green-400 text-xs rounded-lg p-3 mt-2 text-left">
            NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token_here
          </code>
          <p className="text-steel-400 text-xs mt-2">
            Get a free token at{' '}
            <a href="https://account.mapbox.com" target="_blank" className="text-blue-500 underline">
              account.mapbox.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 flex items-center justify-center p-8" style={{ height: '500px' }}>
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Address search bar */}
      <div className="flex gap-2 p-3 border-b border-steel-200 bg-white">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleGeocode()}
          placeholder="Search address to fly to location…"
          className="flex-1 border border-steel-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
        />
        <button
          onClick={handleGeocode}
          className="bg-amber-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-amber-600 transition"
        >
          Go
        </button>
      </div>

      {/* Map container */}
      <div ref={mapContainer} style={{ height: '500px', width: '100%' }} />

      {/* Stats bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-steel-800 text-white text-sm">
        <div className="flex gap-4">
          <span>📏 Lines: <strong>{lineCount}</strong></span>
          <span>📐 Total: <strong>{Math.round(totalLength).toLocaleString()} ft</strong></span>
          {totalLength > 0 && (
            <span className="text-steel-400">
              ({(totalLength / 5280).toFixed(2)} miles)
            </span>
          )}
        </div>
        <div className="flex gap-2 text-xs text-steel-400">
          {!mapLoaded && <span className="animate-pulse">Loading map…</span>}
          {mapLoaded && <span>✓ Satellite view • Click the line tool to draw fence lines</span>}
        </div>
      </div>
    </div>
  );
}
