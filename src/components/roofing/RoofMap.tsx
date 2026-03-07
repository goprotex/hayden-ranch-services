'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

export interface RoofPolygon {
  id: string;
  name: string;
  coordinates: [number, number][];
  areaSqFt: number;
  pitch: string;
  color: string;
}

interface RoofMapProps {
  onPolygonsChange?: (polys: RoofPolygon[]) => void;
  center?: [number, number];
  zoom?: number;
}

const FACET_COLORS = [
  '#f59e0b', '#3b82f6', '#10b981', '#f43f5e', '#8b5cf6',
  '#06b6d4', '#ec4899', '#14b8a6', '#eab308', '#6366f1',
];

function calcPolygonAreaSqFt(coords: [number, number][]): number {
  if (coords.length < 3) return 0;
  const R = 20902231; // Earth radius in feet
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[j];
    const lat1r = lat1 * Math.PI / 180;
    const lat2r = lat2 * Math.PI / 180;
    const dlng = (lng2 - lng1) * Math.PI / 180;
    area += dlng * (2 + Math.sin(lat1r) + Math.sin(lat2r));
  }
  area = Math.abs(area * R * R / 2);
  // Correct for geodesic to planar approximation
  const avgLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const cosLat = Math.cos(avgLat * Math.PI / 180);
  return Math.round(area * cosLat);
}

export default function RoofMap({
  onPolygonsChange,
  center = [-98.23, 30.75],
  zoom = 18,
}: RoofMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [token] = useState(process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '');
  const [error, setError] = useState('');
  const [address, setAddress] = useState('');
  const [polygons, setPolygons] = useState<RoofPolygon[]>([]);
  const polygonNamesRef = useRef<Record<string, { name: string; pitch: string }>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  type MapboxDraw = {
    getAll: () => GeoJSON.FeatureCollection;
    deleteAll: () => void;
    delete: (ids: string[]) => void;
    set: (fc: GeoJSON.FeatureCollection) => void;
  };

  const syncPolygons = useCallback(() => {
    if (!drawRef.current) return;
    const fc = drawRef.current.getAll();
    const polys: RoofPolygon[] = [];

    for (const feature of fc.features) {
      if (feature.geometry.type === 'Polygon') {
        const coords = feature.geometry.coordinates[0] as [number, number][];
        const id = feature.id as string;
        const area = calcPolygonAreaSqFt(coords.slice(0, -1)); // last coord = first
        const saved = polygonNamesRef.current[id] || { name: `Facet ${polys.length + 1}`, pitch: '6/12' };
        polygonNamesRef.current[id] = saved;
        polys.push({
          id,
          name: saved.name,
          coordinates: coords,
          areaSqFt: area,
          pitch: saved.pitch,
          color: FACET_COLORS[polys.length % FACET_COLORS.length],
        });
      }
    }

    setPolygons(polys);
    onPolygonsChange?.(polys);
  }, [onPolygonsChange]);

  const handleGeocode = useCallback(async () => {
    if (!address.trim() || !token || !mapRef.current) return;
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${token}&limit=1`
      );
      const data = await res.json();
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        mapRef.current.flyTo({ center: [lng, lat], zoom: 20, duration: 2000 });
      }
    } catch { /* silently fail */ }
  }, [address, token]);

  const deletePolygon = useCallback((id: string) => {
    if (!drawRef.current) return;
    drawRef.current.delete([id]);
    delete polygonNamesRef.current[id];
    syncPolygons();
  }, [syncPolygons]);

  const updatePolygonMeta = useCallback((id: string, key: 'name' | 'pitch', value: string) => {
    if (!polygonNamesRef.current[id]) polygonNamesRef.current[id] = { name: 'Facet', pitch: '6/12' };
    polygonNamesRef.current[id][key] = value;
    syncPolygons();
  }, [syncPolygons]);

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
          controls: { polygon: true, trash: true },
          defaultMode: 'simple_select',
          styles: [
            { id: 'gl-draw-polygon-fill', type: 'fill', filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']], paint: { 'fill-color': '#f59e0b', 'fill-outline-color': '#f59e0b', 'fill-opacity': 0.2 } },
            { id: 'gl-draw-polygon-stroke', type: 'line', filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']], paint: { 'line-color': '#f59e0b', 'line-width': 2.5, 'line-dasharray': [2, 1] } },
            { id: 'gl-draw-polygon-fill-static', type: 'fill', filter: ['all', ['==', '$type', 'Polygon'], ['==', 'mode', 'static']], paint: { 'fill-color': '#f59e0b', 'fill-outline-color': '#f59e0b', 'fill-opacity': 0.15 } },
            { id: 'gl-draw-polygon-stroke-static', type: 'line', filter: ['all', ['==', '$type', 'Polygon'], ['==', 'mode', 'static']], paint: { 'line-color': '#f59e0b', 'line-width': 2.5 } },
            { id: 'gl-draw-point', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex']], paint: { 'circle-radius': 5, 'circle-color': '#ea580c' } },
            { id: 'gl-draw-point-mid', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']], paint: { 'circle-radius': 3, 'circle-color': '#f59e0b' } },
          ],
        }) as unknown as MapboxDraw;

        map.addControl(draw as unknown as mapboxgl.IControl);
        map.on('draw.create', () => syncPolygons());
        map.on('draw.update', () => syncPolygons());
        map.on('draw.delete', () => syncPolygons());
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

  const totalArea = polygons.reduce((s, p) => s + p.areaSqFt, 0);

  // Capture map as image for PDF
  const captureMapImage = useCallback((): string | null => {
    if (!mapRef.current) return null;
    try {
      const canvas = mapRef.current.getCanvas();
      return canvas.toDataURL('image/jpeg', 0.85);
    } catch {
      return null;
    }
  }, []);

  // Expose captureMapImage on window for PDF generator to use
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__roofMapCapture = captureMapImage;
    return () => { delete (window as unknown as Record<string, unknown>).__roofMapCapture; };
  }, [captureMapImage]);

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
    <div className="space-y-3">
      <div className="rounded-xl overflow-hidden border border-steel-700/30">
        {/* Address search */}
        <div className="flex gap-2 p-3 bg-surface-50 border-b border-steel-700/30">
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGeocode()}
            placeholder="Search address to fly to roof location\u2026"
            className="flex-1 bg-surface-200 border border-steel-700/30 rounded-lg px-3 py-2 text-sm text-steel-200 placeholder-steel-500 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50" />
          <button onClick={handleGeocode}
            className="bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-amber-500 transition">Go</button>
        </div>
        {/* Map */}
        <div ref={mapContainer} style={{ height: '500px', width: '100%' }} />
        {/* Status bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-surface-100 text-steel-300 text-sm">
          <div className="flex gap-4">
            <span>\u2b1f Facets: <strong className="text-steel-100">{polygons.length}</strong></span>
            <span>\ud83d\udcd0 Area: <strong className="text-amber-400">{totalArea.toLocaleString()} sq ft</strong></span>
          </div>
          <div className="flex gap-2 text-xs text-steel-500">
            {!mapLoaded && <span className="animate-pulse">Loading map\u2026</span>}
            {mapLoaded && <span>\u2713 Draw polygons over the roof</span>}
          </div>
        </div>
      </div>

      {/* Polygon list */}
      {polygons.length > 0 && (
        <div className="space-y-2">
          {polygons.map((poly, idx) => (
            <div key={poly.id} className="card-dark p-3 flex items-center gap-3 animate-fade-in">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: FACET_COLORS[idx % FACET_COLORS.length] }} />
              {editingId === poly.id ? (
                <input type="text" value={poly.name} autoFocus
                  onChange={e => updatePolygonMeta(poly.id, 'name', e.target.value)}
                  onBlur={() => setEditingId(null)}
                  onKeyDown={e => e.key === 'Enter' && setEditingId(null)}
                  className="flex-1 bg-surface-200 border border-steel-600 rounded px-2 py-1 text-sm text-steel-200" />
              ) : (
                <span className="flex-1 text-sm text-steel-200 cursor-pointer hover:text-amber-400 transition"
                  onClick={() => setEditingId(poly.id)}>{poly.name}</span>
              )}
              <select title="Pitch" value={poly.pitch} onChange={e => updatePolygonMeta(poly.id, 'pitch', e.target.value)}
                className="bg-surface-200 border border-steel-700/30 rounded px-2 py-1 text-xs text-steel-300">
                {['2/12','3/12','4/12','5/12','6/12','7/12','8/12','9/12','10/12','12/12','14/12'].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <span className="text-sm font-semibold text-amber-400 min-w-[80px] text-right">{poly.areaSqFt.toLocaleString()} sf</span>
              <button onClick={() => deletePolygon(poly.id)}
                className="text-steel-500 hover:text-red-400 transition text-lg">\u00d7</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
