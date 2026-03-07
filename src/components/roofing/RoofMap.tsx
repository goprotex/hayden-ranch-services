'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';

/* ───── Edge / polygon types ───── */
export type EdgeType = 'ridge' | 'hip' | 'valley' | 'eave' | 'rake';

export interface RoofEdge {
  from: [number, number]; // [lng, lat]
  to: [number, number];
  type: EdgeType;
}

export interface RoofPolygon {
  id: string;
  name: string;
  coordinates: [number, number][];
  edges: RoofEdge[];
  areaSqFt: number;
  pitch: string;
  color: string;
}

export interface CutListPanel {
  facetId: string;
  coords: [number, number][]; // 4 corners of the panel strip
}

interface RoofMapProps {
  onPolygonsChange?: (polys: RoofPolygon[]) => void;
  center?: [number, number];
  zoom?: number;
  cutListPanels?: CutListPanel[];
}

const FACET_COLORS = [
  '#f59e0b', '#3b82f6', '#10b981', '#f43f5e', '#8b5cf6',
  '#06b6d4', '#ec4899', '#14b8a6', '#eab308', '#6366f1',
];

const EDGE_COLORS: Record<EdgeType, string> = {
  ridge: '#ef4444',
  hip: '#f97316',
  valley: '#3b82f6',
  eave: '#22c55e',
  rake: '#a855f7',
};

const EDGE_LABELS: Record<EdgeType, string> = {
  ridge: 'Ridge',
  hip: 'Hip',
  valley: 'Valley',
  eave: 'Eave',
  rake: 'Rake',
};

const SNAP_PX = 12; // snap threshold in pixels
const ANGLE_SNAP_DEG = 8; // snap to 90° if within this many degrees

function uid() { return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7); }

/* ── Geo helpers ── */
function calcPolygonAreaSqFt(coords: [number, number][]): number {
  if (coords.length < 3) return 0;
  const R = 20902231;
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
  const avgLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const cosLat = Math.cos(avgLat * Math.PI / 180);
  return Math.round(area * cosLat);
}

function edgeLenFt(a: [number, number], b: [number, number]): number {
  const R = 20902231;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function midpoint(a: [number, number], b: [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/* ── Snapping helpers ── */
function findSnapVertex(
  map: mapboxgl.Map,
  clickPt: [number, number],
  allPolygons: RoofPolygon[],
  currentVerts: [number, number][],
  closeSelf: boolean
): [number, number] | null {
  const clickPx = map.project(clickPt);
  // Check against all existing polygon vertices
  for (const poly of allPolygons) {
    for (const v of poly.coordinates) {
      const vPx = map.project(v);
      const dx = clickPx.x - vPx.x;
      const dy = clickPx.y - vPx.y;
      if (Math.sqrt(dx * dx + dy * dy) < SNAP_PX) return v;
    }
  }
  // Check against current drawing vertices (for closing the shape)
  if (closeSelf && currentVerts.length >= 3) {
    const first = currentVerts[0];
    const fPx = map.project(first);
    const dx = clickPx.x - fPx.x;
    const dy = clickPx.y - fPx.y;
    if (Math.sqrt(dx * dx + dy * dy) < SNAP_PX) return first;
  }
  return null;
}

function snap90(
  prev: [number, number],
  candidate: [number, number],
  map: mapboxgl.Map
): [number, number] {
  // Work in pixel space for angle calculation
  const pPx = map.project(prev);
  const cPx = map.project(candidate);
  const dx = cPx.x - pPx.x;
  const dy = cPx.y - pPx.y;
  const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
  // Snap to nearest 90° (0, 90, 180, 270)
  const nearest90 = Math.round(angleDeg / 90) * 90;
  const diff = Math.abs(angleDeg - nearest90);
  if (diff < ANGLE_SNAP_DEG) {
    const dist = Math.sqrt(dx * dx + dy * dy);
    const snapRad = nearest90 * Math.PI / 180;
    const snappedPx = { x: pPx.x + dist * Math.cos(snapRad), y: pPx.y + dist * Math.sin(snapRad) };
    const lngLat = map.unproject([snappedPx.x, snappedPx.y]);
    return [lngLat.lng, lngLat.lat];
  }
  return candidate;
}

export default function RoofMap({
  onPolygonsChange,
  center = [-98.23, 30.75],
  zoom = 18,
  cutListPanels,
}: RoofMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [token] = useState(process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '');
  const [error, setError] = useState('');
  const [address, setAddress] = useState('');

  // Polygon state
  const [polygons, setPolygons] = useState<RoofPolygon[]>([]);
  const polygonsRef = useRef<RoofPolygon[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Drawing state
  const [drawing, setDrawing] = useState(false);
  const drawingRef = useRef(false);
  const currentVertsRef = useRef<[number, number][]>([]);
  const [currentVerts, setCurrentVerts] = useState<[number, number][]>([]);
  const cursorRef = useRef<[number, number] | null>(null);

  // Edge type editing
  const [edgeEditPoly, setEdgeEditPoly] = useState<string | null>(null);

  /* Keep ref in sync */
  useEffect(() => { polygonsRef.current = polygons; }, [polygons]);
  useEffect(() => { drawingRef.current = drawing; }, [drawing]);

  /* ── Map rendering ── */
  const renderMap = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    // Build GeoJSON for polygons
    const polyFeatures: GeoJSON.Feature[] = [];
    const edgeFeatures: GeoJSON.Feature[] = [];
    const labelFeatures: GeoJSON.Feature[] = [];
    const vertexFeatures: GeoJSON.Feature[] = [];

    polygonsRef.current.forEach((poly, pIdx) => {
      const ring = [...poly.coordinates, poly.coordinates[0]];
      // Fill polygon
      polyFeatures.push({
        type: 'Feature',
        properties: { color: FACET_COLORS[pIdx % FACET_COLORS.length], name: poly.name, area: poly.areaSqFt },
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
      // Edges with type colors + labels
      poly.edges.forEach((edge, eIdx) => {
        edgeFeatures.push({
          type: 'Feature',
          properties: { color: EDGE_COLORS[edge.type], type: edge.type },
          geometry: { type: 'LineString', coordinates: [edge.from, edge.to] },
        });
        const mid = midpoint(edge.from, edge.to);
        const lenFt = Math.round(edgeLenFt(edge.from, edge.to));
        labelFeatures.push({
          type: 'Feature',
          properties: { label: EDGE_LABELS[edge.type] + ' ' + lenFt + "'", color: EDGE_COLORS[edge.type] },
          geometry: { type: 'Point', coordinates: mid },
        });
      });
      // Vertices
      poly.coordinates.forEach(v => {
        vertexFeatures.push({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: v },
        });
      });
    });

    // Drawing-in-progress line
    const drawFeatures: GeoJSON.Feature[] = [];
    const cv = currentVertsRef.current;
    if (cv.length > 0) {
      const pts = [...cv];
      if (cursorRef.current) pts.push(cursorRef.current);
      if (pts.length >= 2) {
        drawFeatures.push({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: pts },
        });
      }
      cv.forEach(v => {
        drawFeatures.push({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: v },
        });
      });
    }

    // Cut list panels
    const panelFeatures: GeoJSON.Feature[] = [];
    if (cutListPanels) {
      cutListPanels.forEach(panel => {
        if (panel.coords.length >= 4) {
          panelFeatures.push({
            type: 'Feature',
            properties: {},
            geometry: { type: 'Polygon', coordinates: [[...panel.coords, panel.coords[0]]] },
          });
        }
      });
    }

    // Set sources
    const setSrc = (id: string, data: GeoJSON.FeatureCollection) => {
      const src = map.getSource(id) as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(data);
    };
    setSrc('roof-polygons', { type: 'FeatureCollection', features: polyFeatures });
    setSrc('roof-edges', { type: 'FeatureCollection', features: edgeFeatures });
    setSrc('roof-labels', { type: 'FeatureCollection', features: labelFeatures });
    setSrc('roof-vertices', { type: 'FeatureCollection', features: vertexFeatures });
    setSrc('roof-drawing', { type: 'FeatureCollection', features: drawFeatures });
    setSrc('roof-panels', { type: 'FeatureCollection', features: panelFeatures });
  }, [cutListPanels]);

  /* ── Geocode ── */
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

  /* ── Start / stop drawing ── */
  const startDrawing = useCallback(() => {
    setDrawing(true);
    currentVertsRef.current = [];
    setCurrentVerts([]);
    cursorRef.current = null;
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'crosshair';
  }, []);

  const cancelDrawing = useCallback(() => {
    setDrawing(false);
    currentVertsRef.current = [];
    setCurrentVerts([]);
    cursorRef.current = null;
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
    renderMap();
  }, [renderMap]);

  /* ── Finish polygon ── */
  const finishPolygon = useCallback(() => {
    const verts = currentVertsRef.current;
    if (verts.length < 3) { cancelDrawing(); return; }

    // Build edges - default eave for bottom edges, ridge for top
    const edges: RoofEdge[] = [];
    for (let i = 0; i < verts.length; i++) {
      const next = verts[(i + 1) % verts.length];
      // Guess edge type: bottom edges = eave, top = ridge, sides = rake
      const from = verts[i];
      const to = next;
      const isHorizontal = Math.abs(from[1] - to[1]) < Math.abs(from[0] - to[0]);
      let type: EdgeType = 'rake'; // default
      if (isHorizontal) {
        // Lower horizontal = eave, upper = ridge
        const avgLat = (from[1] + to[1]) / 2;
        const centerLat = verts.reduce((s, v) => s + v[1], 0) / verts.length;
        type = avgLat < centerLat ? 'eave' : 'ridge';
      }
      edges.push({ from, to, type });
    }

    const idx = polygonsRef.current.length;
    const poly: RoofPolygon = {
      id: uid(),
      name: 'Facet ' + (idx + 1),
      coordinates: [...verts],
      edges,
      areaSqFt: calcPolygonAreaSqFt(verts),
      pitch: '6/12',
      color: FACET_COLORS[idx % FACET_COLORS.length],
    };

    const updated = [...polygonsRef.current, poly];
    polygonsRef.current = updated;
    setPolygons(updated);
    onPolygonsChange?.(updated);
    setDrawing(false);
    currentVertsRef.current = [];
    setCurrentVerts([]);
    cursorRef.current = null;
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
    setTimeout(() => renderMap(), 50);
  }, [onPolygonsChange, cancelDrawing, renderMap]);

  /* ── Handle map click (drawing) ── */
  const handleMapClick = useCallback((e: mapboxgl.MapMouseEvent) => {
    if (!drawingRef.current || !mapRef.current) return;
    const map = mapRef.current;
    const clickPt: [number, number] = [e.lngLat.lng, e.lngLat.lat];
    const cv = currentVertsRef.current;

    // Check snap to existing vertex or self-close
    const snapPt = findSnapVertex(map, clickPt, polygonsRef.current, cv, true);

    let finalPt: [number, number] = snapPt || clickPt;

    // If snapping to first vertex, close the polygon
    if (snapPt && cv.length >= 3 && snapPt[0] === cv[0][0] && snapPt[1] === cv[0][1]) {
      finishPolygon();
      return;
    }

    // 90° angle snap (if we have at least one previous vertex)
    if (!snapPt && cv.length > 0) {
      finalPt = snap90(cv[cv.length - 1], clickPt, map);
    }

    cv.push(finalPt);
    currentVertsRef.current = cv;
    setCurrentVerts([...cv]);
    renderMap();
  }, [finishPolygon, renderMap]);

  /* ── Mouse move for live preview line ── */
  const handleMouseMove = useCallback((e: mapboxgl.MapMouseEvent) => {
    if (!drawingRef.current || !mapRef.current) return;
    const map = mapRef.current;
    const cv = currentVertsRef.current;
    let pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];

    // Snap preview
    const snap = findSnapVertex(map, pt, polygonsRef.current, cv, true);
    if (snap) {
      pt = snap;
    } else if (cv.length > 0) {
      pt = snap90(cv[cv.length - 1], pt, map);
    }
    cursorRef.current = pt;
    renderMap();
  }, [renderMap]);

  /* ── Delete polygon ── */
  const deletePolygon = useCallback((id: string) => {
    const updated = polygonsRef.current.filter(p => p.id !== id);
    polygonsRef.current = updated;
    setPolygons(updated);
    onPolygonsChange?.(updated);
    setEdgeEditPoly(null);
    renderMap();
  }, [onPolygonsChange, renderMap]);

  /* ── Update polygon meta ── */
  const updateMeta = useCallback((id: string, key: 'name' | 'pitch', value: string) => {
    const updated = polygonsRef.current.map(p => p.id === id ? { ...p, [key]: value } : p);
    polygonsRef.current = updated;
    setPolygons(updated);
    onPolygonsChange?.(updated);
  }, [onPolygonsChange]);

  /* ── Update edge type ── */
  const updateEdgeType = useCallback((polyId: string, edgeIdx: number, type: EdgeType) => {
    const updated = polygonsRef.current.map(p => {
      if (p.id !== polyId) return p;
      const newEdges = [...p.edges];
      newEdges[edgeIdx] = { ...newEdges[edgeIdx], type };
      return { ...p, edges: newEdges };
    });
    polygonsRef.current = updated;
    setPolygons(updated);
    onPolygonsChange?.(updated);
    renderMap();
  }, [onPolygonsChange, renderMap]);

  /* ── Init Mapbox ── */
  useEffect(() => {
    if (!token) { setError('Missing NEXT_PUBLIC_MAPBOX_TOKEN.'); return; }
    if (!mapContainer.current || mapRef.current) return;
    let cancelled = false;

    async function initMap() {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
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

        map.on('load', () => {
          if (cancelled) return;
          const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
          // Sources
          map.addSource('roof-polygons', { type: 'geojson', data: empty });
          map.addSource('roof-edges', { type: 'geojson', data: empty });
          map.addSource('roof-labels', { type: 'geojson', data: empty });
          map.addSource('roof-vertices', { type: 'geojson', data: empty });
          map.addSource('roof-drawing', { type: 'geojson', data: empty });
          map.addSource('roof-panels', { type: 'geojson', data: empty });

          // Polygon fills
          map.addLayer({ id: 'roof-poly-fill', type: 'fill', source: 'roof-polygons',
            paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.25 } });
          // Polygon outlines (thin, under edge lines)
          map.addLayer({ id: 'roof-poly-outline', type: 'line', source: 'roof-polygons',
            paint: { 'line-color': ['get', 'color'], 'line-width': 1, 'line-opacity': 0.4 } });
          // Edge lines (colored by type)
          map.addLayer({ id: 'roof-edge-lines', type: 'line', source: 'roof-edges',
            paint: { 'line-color': ['get', 'color'], 'line-width': 3 } });
          // Edge labels
          map.addLayer({ id: 'roof-edge-labels', type: 'symbol', source: 'roof-labels',
            layout: {
              'text-field': ['get', 'label'],
              'text-size': 11,
              'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
              'text-offset': [0, -0.8],
              'text-allow-overlap': true,
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': ['get', 'color'],
              'text-halo-width': 2,
            },
          });
          // Vertices
          map.addLayer({ id: 'roof-vertex-dots', type: 'circle', source: 'roof-vertices',
            paint: { 'circle-radius': 5, 'circle-color': '#ea580c', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } });
          // Drawing-in-progress
          map.addLayer({ id: 'roof-draw-line', type: 'line', source: 'roof-drawing',
            paint: { 'line-color': '#fbbf24', 'line-width': 2, 'line-dasharray': [3, 2] },
            filter: ['==', ['geometry-type'], 'LineString'] });
          map.addLayer({ id: 'roof-draw-pts', type: 'circle', source: 'roof-drawing',
            paint: { 'circle-radius': 5, 'circle-color': '#fbbf24', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' },
            filter: ['==', ['geometry-type'], 'Point'] });
          // Cut list panels
          map.addLayer({ id: 'roof-panel-fill', type: 'fill', source: 'roof-panels',
            paint: { 'fill-color': '#60a5fa', 'fill-opacity': 0.3 } });
          map.addLayer({ id: 'roof-panel-stroke', type: 'line', source: 'roof-panels',
            paint: { 'line-color': '#93c5fd', 'line-width': 0.5 } });

          setMapLoaded(true);
        });

        mapRef.current = map;
      } catch (err) {
        if (!cancelled) { console.error('Map init error:', err); setError('Failed to load Mapbox.'); }
      }
    }
    initMap();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /* ── Attach click/move handlers ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    map.on('click', handleMapClick);
    map.on('mousemove', handleMouseMove);
    return () => { map.off('click', handleMapClick); map.off('mousemove', handleMouseMove); };
  }, [mapLoaded, handleMapClick, handleMouseMove]);

  /* ── Re-render when polygons or panels change ── */
  useEffect(() => { if (mapLoaded) renderMap(); }, [mapLoaded, polygons, cutListPanels, renderMap]);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawingRef.current) cancelDrawing();
      if (e.key === 'Enter' && drawingRef.current && currentVertsRef.current.length >= 3) finishPolygon();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cancelDrawing, finishPolygon]);

  /* ── Capture map as image ── */
  const captureMapImage = useCallback((): string | null => {
    if (!mapRef.current) return null;
    try { return mapRef.current.getCanvas().toDataURL('image/jpeg', 0.85); } catch { return null; }
  }, []);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__roofMapCapture = captureMapImage;
    return () => { delete (window as unknown as Record<string, unknown>).__roofMapCapture; };
  }, [captureMapImage]);

  const totalArea = polygons.reduce((s, p) => s + p.areaSqFt, 0);

  /* ── Render ── */
  if (!token) return (
    <div className="bg-surface-50 flex items-center justify-center rounded-xl" style={{ height: '500px' }}>
      <div className="text-center max-w-sm">
        <p className="text-steel-400 font-medium mb-2">Mapbox Token Required</p>
        <p className="text-steel-500 text-sm">Add <code className="bg-surface-200 px-1.5 py-0.5 rounded text-amber-400">NEXT_PUBLIC_MAPBOX_TOKEN</code> to <code className="bg-surface-200 px-1.5 py-0.5 rounded text-amber-400">.env.local</code></p>
      </div>
    </div>
  );

  if (error) return (
    <div className="bg-red-950/30 flex items-center justify-center p-8 rounded-xl" style={{ height: '500px' }}>
      <p className="text-red-400 text-sm">{error}</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="rounded-xl overflow-hidden border border-steel-700/30">
        {/* Toolbar */}
        <div className="flex gap-2 p-3 bg-surface-50 border-b border-steel-700/30 flex-wrap">
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGeocode()}
            placeholder="Search address\u2026"
            className="flex-1 min-w-[200px] bg-surface-200 border border-steel-700/30 rounded-lg px-3 py-2 text-sm text-steel-200 placeholder-steel-500 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50" />
          <button onClick={handleGeocode} className="bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-amber-500 transition">Go</button>
          <div className="border-l border-steel-700/30 mx-1" />
          {!drawing ? (
            <button onClick={startDrawing} className="bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-emerald-500 transition">
              \u2b23 Draw Facet
            </button>
          ) : (
            <div className="flex gap-2 items-center">
              <span className="text-amber-400 text-sm animate-pulse">Click to place vertices\u2026</span>
              {currentVerts.length >= 3 && (
                <button onClick={finishPolygon} className="bg-amber-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-amber-500 transition">
                  \u2713 Close Shape (Enter)
                </button>
              )}
              <button onClick={cancelDrawing} className="bg-steel-700 text-steel-300 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-steel-600 transition">
                Cancel (Esc)
              </button>
            </div>
          )}
        </div>

        {/* Map */}
        <div ref={mapContainer} style={{ height: '500px', width: '100%' }} />

        {/* Status bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-surface-100 text-steel-300 text-sm">
          <div className="flex gap-4">
            <span>\u2b1f Facets: <strong className="text-steel-100">{polygons.length}</strong></span>
            <span>\ud83d\udcd0 Area: <strong className="text-amber-400">{totalArea.toLocaleString()} sq ft</strong></span>
          </div>
          <div className="flex gap-3 text-xs">
            {Object.entries(EDGE_COLORS).map(([type, color]) => (
              <span key={type} className="flex items-center gap-1">
                <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: color }} />
                <span className="text-steel-400">{EDGE_LABELS[type as EdgeType]}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Polygon list with edge editors */}
      {polygons.length > 0 && (
        <div className="space-y-2">
          {polygons.map((poly, idx) => (
            <div key={poly.id} className="card-dark p-3 space-y-2 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: FACET_COLORS[idx % FACET_COLORS.length] }} />
                {editingId === poly.id ? (
                  <input type="text" value={poly.name} autoFocus
                    onChange={e => updateMeta(poly.id, 'name', e.target.value)}
                    onBlur={() => setEditingId(null)}
                    onKeyDown={e => e.key === 'Enter' && setEditingId(null)}
                    className="flex-1 bg-surface-200 border border-steel-600 rounded px-2 py-1 text-sm text-steel-200" />
                ) : (
                  <span className="flex-1 text-sm text-steel-200 cursor-pointer hover:text-amber-400 transition"
                    onClick={() => setEditingId(poly.id)}>{poly.name}</span>
                )}
                <select title="Pitch" value={poly.pitch} onChange={e => updateMeta(poly.id, 'pitch', e.target.value)}
                  className="bg-surface-200 border border-steel-700/30 rounded px-2 py-1 text-xs text-steel-300">
                  {['2/12','3/12','4/12','5/12','6/12','7/12','8/12','9/12','10/12','12/12','14/12'].map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <span className="text-sm font-semibold text-amber-400 min-w-[80px] text-right">{poly.areaSqFt.toLocaleString()} sf</span>
                <button onClick={() => setEdgeEditPoly(edgeEditPoly === poly.id ? null : poly.id)}
                  className="text-steel-400 hover:text-amber-400 transition text-xs border border-steel-700/30 rounded px-2 py-1">
                  {edgeEditPoly === poly.id ? 'Hide Edges' : 'Edit Edges'}
                </button>
                <button onClick={() => deletePolygon(poly.id)}
                  className="text-steel-500 hover:text-red-400 transition text-lg">\u00d7</button>
              </div>

              {/* Edge type editor */}
              {edgeEditPoly === poly.id && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-6">
                  {poly.edges.map((edge, eIdx) => {
                    const len = Math.round(edgeLenFt(edge.from, edge.to));
                    return (
                      <div key={eIdx} className="flex items-center gap-2 bg-surface-200/50 rounded px-2 py-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: EDGE_COLORS[edge.type] }} />
                        <span className="text-steel-400 text-xs w-16">Edge {eIdx + 1} ({len}')</span>
                        <select value={edge.type} onChange={e => updateEdgeType(poly.id, eIdx, e.target.value as EdgeType)}
                          className="bg-surface-100 border border-steel-700/30 rounded px-1.5 py-0.5 text-xs text-steel-300 flex-1">
                          {(['ridge', 'hip', 'valley', 'eave', 'rake'] as EdgeType[]).map(t => (
                            <option key={t} value={t}>{EDGE_LABELS[t]}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}