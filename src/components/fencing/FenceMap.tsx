'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { calculateVertexAngle } from '@/lib/fencing/fence-materials';

interface FenceMapProps {
  onFenceLinesChange?: (lines: DrawnLine[]) => void;
  onTerrainAnalyzed?: (analysis: TerrainSuggestion) => void;
  center?: [number, number];
  zoom?: number;
}

export interface DrawnLine {
  id: string;
  coordinates: [number, number][];
  lengthFeet: number;
  vertexAngles: VertexAngle[];
}

export interface VertexAngle {
  index: number;
  coordinate: [number, number];
  angleDegrees: number;
  deviation: number; // from 180 (straight)
}

export interface TerrainSuggestion {
  suggestedDifficulty: 'easy' | 'moderate' | 'difficult' | 'very_difficult';
  avgElevation: number;
  elevationChange: number;
  soilType: string | null;
  drainage: string | null;
  hydric: string | null;
  components: { name: string; percent: number; drainage?: string; hydric?: string }[];
  source: string | null;
  confidence: number;
}

export default function FenceMap({
  onFenceLinesChange,
  onTerrainAnalyzed,
  center = [-98.23, 30.75],
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
  const [analyzing, setAnalyzing] = useState(false);

  type MapboxDraw = {
    getAll: () => GeoJSON.FeatureCollection;
    deleteAll: () => void;
    set: (fc: GeoJSON.FeatureCollection) => void;
  };

  const calcLineLengthFeet = useCallback((coords: [number, number][]) => {
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
      const [lng1, lat1] = coords[i - 1];
      const [lng2, lat2] = coords[i];
      const R = 20902231;
      const dLat = (lat2 - lat1) * (Math.PI / 180);
      const dLng = (lng2 - lng1) * (Math.PI / 180);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
      total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    return total;
  }, []);

  // Calculate vertex angles for all intermediate vertices in a line
  const calcVertexAngles = useCallback((coords: [number, number][]): VertexAngle[] => {
    const angles: VertexAngle[] = [];
    for (let i = 1; i < coords.length - 1; i++) {
      const angle = calculateVertexAngle(coords[i - 1], coords[i], coords[i + 1]);
      angles.push({
        index: i,
        coordinate: coords[i],
        angleDegrees: angle,
        deviation: Math.abs(180 - angle),
      });
    }
    return angles;
  }, []);

  const analyzeTerrainForLines = useCallback(async (allCoords: [number, number][]) => {
    if (!token || allCoords.length < 2) return;
    setAnalyzing(true);
    try {
      const { analyzeTerrain } = await import('@/lib/fencing/terrain-analysis');
      const analysis = await analyzeTerrain(allCoords, token);
      onTerrainAnalyzed?.({
        suggestedDifficulty: analysis.suggestedDifficulty,
        avgElevation: analysis.avgElevation,
        elevationChange: analysis.totalElevationChange,
        soilType: analysis.soilType,
        drainage: analysis.soilInfo?.drainage ?? null,
        hydric: analysis.soilInfo?.hydric ?? null,
        components: analysis.soilInfo?.components ?? [],
        source: analysis.soilInfo?.source ?? null,
        confidence: analysis.confidence,
      });
    } catch (err) {
      console.error('Terrain analysis error:', err);
    } finally {
      setAnalyzing(false);
    }
  }, [token, onTerrainAnalyzed]);

  const syncDrawnLines = useCallback(() => {
    if (!drawRef.current) return;
    const fc = drawRef.current.getAll();
    const drawnLines: DrawnLine[] = [];
    let total = 0;
    const allCoords: [number, number][] = [];

    for (const feature of fc.features) {
      if (feature.geometry.type === 'LineString') {
        const coords = feature.geometry.coordinates as [number, number][];
        const len = calcLineLengthFeet(coords);
        const angles = calcVertexAngles(coords);
        total += len;
        allCoords.push(...coords);
        drawnLines.push({ id: feature.id as string, coordinates: coords, lengthFeet: len, vertexAngles: angles });
      }
    }

    setTotalLength(total);
    setLineCount(drawnLines.length);
    onFenceLinesChange?.(drawnLines);

    // Trigger terrain analysis
    if (allCoords.length >= 2) {
      analyzeTerrainForLines(allCoords);
    }
  }, [calcLineLengthFeet, calcVertexAngles, onFenceLinesChange, analyzeTerrainForLines]);

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
    } catch { /* silently fail */ }
  }, [address, token]);

  useEffect(() => {
    if (!token) {
      setError('Missing NEXT_PUBLIC_MAPBOX_TOKEN.');
      return;
    }
    if (!mapContainer.current || mapRef.current) return;
    let cancelled = false;

    async function initMap() {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
        const MapboxDrawModule = (await import('@mapbox/mapbox-gl-draw')).default;
        if (cancelled || !mapContainer.current) return;
        mapboxgl.accessToken = token;

        const map = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/satellite-streets-v12',
          center, zoom,
          attributionControl: false,
        });

        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

        const draw = new MapboxDrawModule({
          displayControlsDefault: false,
          controls: { line_string: true, trash: true },
          defaultMode: 'simple_select',
          styles: [
            { id: 'gl-draw-line', type: 'line', filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']], paint: { 'line-color': '#f59e0b', 'line-width': 3, 'line-dasharray': [2, 1] } },
            { id: 'gl-draw-line-static', type: 'line', filter: ['all', ['==', '$type', 'LineString'], ['==', 'mode', 'static']], paint: { 'line-color': '#f59e0b', 'line-width': 3 } },
            { id: 'gl-draw-point', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex']], paint: { 'circle-radius': 6, 'circle-color': '#ea580c' } },
            { id: 'gl-draw-point-mid', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']], paint: { 'circle-radius': 4, 'circle-color': '#f59e0b' } },
          ],
        }) as unknown as MapboxDraw;

        map.addControl(draw as unknown as mapboxgl.IControl);
        map.on('draw.create', () => syncDrawnLines());
        map.on('draw.update', () => syncDrawnLines());
        map.on('draw.delete', () => syncDrawnLines());
        map.on('load', () => { if (!cancelled) setMapLoaded(true); });

        mapRef.current = map;
        drawRef.current = draw;
      } catch (err) {
        if (!cancelled) {
          console.error('Map init error:', err);
          setError('Failed to load Mapbox.');
        }
      }
    }
    initMap();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) {
    return (
      <div className="bg-surface-50 flex items-center justify-center rounded-xl" style={{ height: '500px' }}>
        <div className="text-center max-w-sm">
          <p className="text-steel-400 font-medium mb-2">Mapbox Token Required</p>
          <p className="text-steel-500 text-sm">Add <code className="bg-surface-200 px-1.5 py-0.5 rounded text-amber-400">NEXT_PUBLIC_MAPBOX_TOKEN</code> to <code className="bg-surface-200 px-1.5 py-0.5 rounded text-amber-400">.env.local</code></p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-950/30 flex items-center justify-center p-8 rounded-xl" style={{ height: '500px' }}>
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-steel-700/30">
      <div className="flex gap-2 p-3 bg-surface-50 border-b border-steel-700/30">
        <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleGeocode()}
          placeholder="Search address to fly to location\u2026"
          className="flex-1 bg-surface-200 border border-steel-700/30 rounded-lg px-3 py-2 text-sm text-steel-200 placeholder-steel-500 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50" />
        <button onClick={handleGeocode}
          className="bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-amber-500 transition">Go</button>
      </div>
      <div ref={mapContainer} style={{ height: '500px', width: '100%' }} />
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-100 text-steel-300 text-sm">
        <div className="flex gap-4">
          <span>\ud83d\udccf Lines: <strong className="text-steel-100">{lineCount}</strong></span>
          <span>\ud83d\udcd0 Total: <strong className="text-amber-400">{Math.round(totalLength).toLocaleString()} ft</strong></span>
          {totalLength > 0 && <span className="text-steel-500">({(totalLength / 5280).toFixed(2)} mi)</span>}
        </div>
        <div className="flex gap-2 text-xs text-steel-500">
          {analyzing && <span className="text-amber-400 animate-pulse">\u26a1 Analyzing terrain...</span>}
          {!mapLoaded && <span className="animate-pulse">Loading map\u2026</span>}
          {mapLoaded && !analyzing && <span>\u2713 Draw fence lines on satellite view</span>}
        </div>
      </div>
    </div>
  );
}