'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';

/* ===== Types ===== */
export type EdgeType = 'ridge' | 'hip' | 'valley' | 'eave' | 'rake' | 'endwall' | 'step_flashing';

export interface RoofEdge {
  from: [number, number];
  to: [number, number];
  type: EdgeType;
  /** true if edge also has flashing (endwall/step) in addition to its structural type */
  hasFlashing?: boolean;
  flashingType?: 'endwall' | 'step_flashing';
}

export interface InteriorLine {
  id: string;
  from: [number, number];
  to: [number, number];
  type: EdgeType;
}

export interface RoofPolygon {
  id: string;
  name: string;
  coordinates: [number, number][];
  edges: RoofEdge[];
  interiorLines: InteriorLine[];
  areaSqFt: number;
  pitch: string;
  color: string;
}

export interface CutListPanel {
  facetId: string;
  coords: [number, number][];
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
  ridge: '#ef4444', hip: '#f97316', valley: '#3b82f6',
  eave: '#22c55e', rake: '#a855f7',
  endwall: '#facc15', step_flashing: '#fb923c',
};

const EDGE_LABELS: Record<EdgeType, string> = {
  ridge: 'Ridge', hip: 'Hip', valley: 'Valley',
  eave: 'Eave', rake: 'Rake',
  endwall: 'Endwall', step_flashing: 'Step Flash',
};

const INTERIOR_TYPES: EdgeType[] = ['ridge', 'valley', 'hip', 'endwall', 'step_flashing'];

const SNAP_PX = 14;
const ANGLE_SNAP_DEG = 8;

function uid() { return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7); }

/* == Geo helpers == */
function calcAreaSqFt(coords: [number, number][]): number {
  if (coords.length < 3) return 0;
  const R = 20902231;
  let area = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    const [lng1, lat1] = coords[i]; const [lng2, lat2] = coords[j];
    area += (lng2 - lng1) * Math.PI / 180 * (2 + Math.sin(lat1 * Math.PI / 180) + Math.sin(lat2 * Math.PI / 180));
  }
  area = Math.abs(area * R * R / 2);
  const avgLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  return Math.round(area * Math.cos(avgLat * Math.PI / 180));
}

function edgeLen(a: [number, number], b: [number, number]): number {
  const R = 20902231;
  const toR = (d: number) => d * Math.PI / 180;
  const dLat = toR(b[1] - a[1]); const dLng = toR(b[0] - a[0]);
  const sinLat = Math.sin(dLat / 2); const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toR(a[1])) * Math.cos(toR(b[1])) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function mid(a: [number, number], b: [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/* == Snapping == */
function snapToAny(
  map: mapboxgl.Map, pt: [number, number],
  perimVerts: [number, number][], interiorEnds: [number, number][],
  drawVerts: [number, number][], closeSelf: boolean
): [number, number] | null {
  const px = map.project(pt);
  const check = (v: [number, number]) => {
    const vp = map.project(v);
    return Math.sqrt((px.x - vp.x) ** 2 + (px.y - vp.y) ** 2) < SNAP_PX;
  };
  for (const v of perimVerts) if (check(v)) return v;
  for (const v of interiorEnds) if (check(v)) return v;
  if (closeSelf && drawVerts.length >= 3) { const f = drawVerts[0]; if (check(f)) return f; }
  return null;
}

function snap90(prev: [number, number], cand: [number, number], map: mapboxgl.Map): [number, number] {
  const pp = map.project(prev); const cp = map.project(cand);
  const dx = cp.x - pp.x; const dy = cp.y - pp.y;
  const a = Math.atan2(dy, dx) * 180 / Math.PI;
  const n90 = Math.round(a / 90) * 90;
  if (Math.abs(a - n90) < ANGLE_SNAP_DEG) {
    const d = Math.sqrt(dx * dx + dy * dy);
    const r = n90 * Math.PI / 180;
    const ll = map.unproject([pp.x + d * Math.cos(r), pp.y + d * Math.sin(r)]);
    return [ll.lng, ll.lat];
  }
  return cand;
}

/* == Auto-classify perimeter edges == */
function classifyPerimeterEdges(coords: [number, number][]): RoofEdge[] {
  if (coords.length < 3) return [];
  const edges: { from: [number, number]; to: [number, number]; len: number }[] = [];
  for (let i = 0; i < coords.length; i++) {
    const from = coords[i]; const to = coords[(i + 1) % coords.length];
    edges.push({ from, to, len: edgeLen(from, to) });
  }
  // Sort by length descending to find the cutoff
  const sorted = [...edges].sort((a, b) => b.len - a.len);
  // Median length
  const medianLen = sorted[Math.floor(sorted.length / 2)].len;
  // Edges longer than median are eave, shorter are rake
  // This works because eaves (long horizontal runs) are typically the longest edges
  return edges.map(e => ({
    from: e.from, to: e.to,
    type: (e.len >= medianLen ? 'eave' : 'rake') as EdgeType,
  }));
}

/* ===== Component ===== */
export default function RoofMap({
  onPolygonsChange, center = [-98.23, 30.75], zoom = 18, cutListPanels,
}: RoofMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [token] = useState(process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '');
  const [error, setError] = useState('');
  const [address, setAddress] = useState('');

  // Roof data
  const [polygons, setPolygons] = useState<RoofPolygon[]>([]);
  const polysRef = useRef<RoofPolygon[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edgeEditPoly, setEdgeEditPoly] = useState<string | null>(null);

  // Drawing modes
  type DrawMode = 'none' | 'perimeter' | EdgeType;
  const [drawMode, setDrawMode] = useState<DrawMode>('none');
  const drawModeRef = useRef<DrawMode>('none');
  const vertsRef = useRef<[number, number][]>([]);
  const [drawVerts, setDrawVerts] = useState<[number, number][]>([]);
  const cursorRef = useRef<[number, number] | null>(null);

  useEffect(() => { polysRef.current = polygons; }, [polygons]);
  useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);

  /* Collect all snap targets */
  const getSnapTargets = useCallback(() => {
    const perimVerts: [number, number][] = [];
    const interiorEnds: [number, number][] = [];
    for (const p of polysRef.current) {
      perimVerts.push(...p.coordinates);
      for (const il of p.interiorLines) { interiorEnds.push(il.from, il.to); }
    }
    return { perimVerts, interiorEnds };
  }, []);

  /* == Render GeoJSON to map == */
  const renderMap = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const polyF: GeoJSON.Feature[] = [];
    const edgeF: GeoJSON.Feature[] = [];
    const labelF: GeoJSON.Feature[] = [];
    const vertF: GeoJSON.Feature[] = [];

    polysRef.current.forEach((poly, pi) => {
      const ring = [...poly.coordinates, poly.coordinates[0]];
      polyF.push({ type: 'Feature', properties: { color: poly.color || FACET_COLORS[pi % FACET_COLORS.length] }, geometry: { type: 'Polygon', coordinates: [ring] } });

      // Perimeter edges
      for (const e of poly.edges) {
        edgeF.push({ type: 'Feature', properties: { color: EDGE_COLORS[e.type] }, geometry: { type: 'LineString', coordinates: [e.from, e.to] } });
        const m = mid(e.from, e.to); const len = Math.round(edgeLen(e.from, e.to));
        let lbl = EDGE_LABELS[e.type] + ' ' + len + "'";
        if (e.hasFlashing && e.flashingType) lbl += ' + ' + EDGE_LABELS[e.flashingType];
        labelF.push({ type: 'Feature', properties: { label: lbl, color: EDGE_COLORS[e.type] }, geometry: { type: 'Point', coordinates: m } });
      }
      // Interior lines
      for (const il of poly.interiorLines) {
        edgeF.push({ type: 'Feature', properties: { color: EDGE_COLORS[il.type] }, geometry: { type: 'LineString', coordinates: [il.from, il.to] } });
        const m = mid(il.from, il.to); const len = Math.round(edgeLen(il.from, il.to));
        labelF.push({ type: 'Feature', properties: { label: EDGE_LABELS[il.type] + ' ' + len + "'", color: EDGE_COLORS[il.type] }, geometry: { type: 'Point', coordinates: m } });
      }
      // Vertices
      poly.coordinates.forEach(v => vertF.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: v } }));
    });

    // Drawing in progress
    const drawF: GeoJSON.Feature[] = [];
    const cv = vertsRef.current;
    if (cv.length > 0) {
      const pts = [...cv]; if (cursorRef.current) pts.push(cursorRef.current);
      if (pts.length >= 2) drawF.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } });
      cv.forEach(v => drawF.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: v } }));
    }

    // Cut list panels
    const panelF: GeoJSON.Feature[] = [];
    if (cutListPanels) cutListPanels.forEach(p => { if (p.coords.length >= 4) panelF.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...p.coords, p.coords[0]]] } }); });

    const set = (id: string, fc: GeoJSON.Feature[]) => { const s = map.getSource(id) as mapboxgl.GeoJSONSource | undefined; if (s) s.setData({ type: 'FeatureCollection', features: fc }); };
    set('roof-polygons', polyF); set('roof-edges', edgeF); set('roof-labels', labelF);
    set('roof-vertices', vertF); set('roof-drawing', drawF); set('roof-panels', panelF);
  }, [cutListPanels]);

  /* == Geocode == */
  const handleGeocode = useCallback(async () => {
    if (!address.trim() || !token || !mapRef.current) return;
    try {
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${token}&limit=1`);
      const d = await res.json();
      if (d.features?.length) { const [lng, lat] = d.features[0].center; mapRef.current.flyTo({ center: [lng, lat], zoom: 20, duration: 2000 }); }
    } catch {}
  }, [address, token]);

  /* == Start drawing == */
  const startDraw = useCallback((mode: DrawMode) => {
    setDrawMode(mode);
    vertsRef.current = []; setDrawVerts([]); cursorRef.current = null;
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'crosshair';
  }, []);

  const cancelDraw = useCallback(() => {
    setDrawMode('none'); vertsRef.current = []; setDrawVerts([]); cursorRef.current = null;
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
    renderMap();
  }, [renderMap]);

  /* == Finish perimeter polygon == */
  const finishPerimeter = useCallback(() => {
    const verts = vertsRef.current;
    if (verts.length < 3) { cancelDraw(); return; }
    const edges = classifyPerimeterEdges(verts);
    const idx = polysRef.current.length;
    const poly: RoofPolygon = {
      id: uid(), name: 'Roof ' + (idx + 1), coordinates: [...verts],
      edges, interiorLines: [],
      areaSqFt: calcAreaSqFt(verts), pitch: '6/12',
      color: FACET_COLORS[idx % FACET_COLORS.length],
    };
    const updated = [...polysRef.current, poly];
    polysRef.current = updated; setPolygons(updated); onPolygonsChange?.(updated);
    setDrawMode('none'); vertsRef.current = []; setDrawVerts([]); cursorRef.current = null;
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
    setTimeout(() => renderMap(), 50);
  }, [onPolygonsChange, cancelDraw, renderMap]);

  /* == Finish interior line (2-point) == */
  const finishInteriorLine = useCallback((type: EdgeType) => {
    const verts = vertsRef.current;
    if (verts.length < 2) { cancelDraw(); return; }
    const from = verts[0]; const to = verts[1];

    // Find which polygon this line belongs to (closest centroid or contains)
    let bestPoly = polysRef.current[polysRef.current.length - 1]; // default to last drawn
    if (polysRef.current.length > 1) {
      const mx = (from[0] + to[0]) / 2; const my = (from[1] + to[1]) / 2;
      let bestDist = Infinity;
      for (const p of polysRef.current) {
        const cx = p.coordinates.reduce((s, v) => s + v[0], 0) / p.coordinates.length;
        const cy = p.coordinates.reduce((s, v) => s + v[1], 0) / p.coordinates.length;
        const d = (mx - cx) ** 2 + (my - cy) ** 2;
        if (d < bestDist) { bestDist = d; bestPoly = p; }
      }
    }

    const newLine: InteriorLine = { id: uid(), from, to, type };
    const updated = polysRef.current.map(p =>
      p.id === bestPoly.id ? { ...p, interiorLines: [...p.interiorLines, newLine] } : p
    );
    polysRef.current = updated; setPolygons(updated); onPolygonsChange?.(updated);
    setDrawMode('none'); vertsRef.current = []; setDrawVerts([]); cursorRef.current = null;
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
    setTimeout(() => renderMap(), 50);
  }, [onPolygonsChange, cancelDraw, renderMap]);

  /* == Map click handler == */
  const handleClick = useCallback((e: mapboxgl.MapMouseEvent) => {
    const mode = drawModeRef.current;
    if (mode === 'none' || !mapRef.current) return;
    const map = mapRef.current;
    const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];
    const cv = vertsRef.current;
    const { perimVerts, interiorEnds } = getSnapTargets();

    if (mode === 'perimeter') {
      // Perimeter drawing: snap to vertices, close on first vertex
      const snap = snapToAny(map, pt, perimVerts, interiorEnds, cv, true);
      let final = snap || pt;
      if (snap && cv.length >= 3 && snap[0] === cv[0][0] && snap[1] === cv[0][1]) { finishPerimeter(); return; }
      if (!snap && cv.length > 0) final = snap90(cv[cv.length - 1], pt, map);
      cv.push(final); vertsRef.current = cv; setDrawVerts([...cv]); renderMap();
    } else {
      // Interior line: exactly 2 points, snap to perimeter + interior vertices
      const snap = snapToAny(map, pt, perimVerts, interiorEnds, [], false);
      const final = snap || pt;
      cv.push(final); vertsRef.current = cv; setDrawVerts([...cv]);
      if (cv.length >= 2) { finishInteriorLine(mode); return; }
      renderMap();
    }
  }, [getSnapTargets, finishPerimeter, finishInteriorLine, renderMap]);

  /* == Mouse move == */
  const handleMove = useCallback((e: mapboxgl.MapMouseEvent) => {
    const mode = drawModeRef.current;
    if (mode === 'none' || !mapRef.current) return;
    const map = mapRef.current; const cv = vertsRef.current;
    let pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];
    const { perimVerts, interiorEnds } = getSnapTargets();
    const snap = snapToAny(map, pt, perimVerts, interiorEnds, cv, mode === 'perimeter');
    if (snap) pt = snap;
    else if (cv.length > 0 && mode === 'perimeter') pt = snap90(cv[cv.length - 1], pt, map);
    cursorRef.current = pt; renderMap();
  }, [getSnapTargets, renderMap]);

  /* == Polygon ops == */
  const deletePoly = useCallback((id: string) => {
    const u = polysRef.current.filter(p => p.id !== id);
    polysRef.current = u; setPolygons(u); onPolygonsChange?.(u); setEdgeEditPoly(null); renderMap();
  }, [onPolygonsChange, renderMap]);

  const updateMeta = useCallback((id: string, key: 'name' | 'pitch', val: string) => {
    const u = polysRef.current.map(p => p.id === id ? { ...p, [key]: val } : p);
    polysRef.current = u; setPolygons(u); onPolygonsChange?.(u);
  }, [onPolygonsChange]);

  const updateEdgeType = useCallback((pid: string, ei: number, type: EdgeType) => {
    const u = polysRef.current.map(p => {
      if (p.id !== pid) return p;
      const ne = [...p.edges]; ne[ei] = { ...ne[ei], type }; return { ...p, edges: ne };
    });
    polysRef.current = u; setPolygons(u); onPolygonsChange?.(u); renderMap();
  }, [onPolygonsChange, renderMap]);

  const toggleFlashing = useCallback((pid: string, ei: number, fType: 'endwall' | 'step_flashing') => {
    const u = polysRef.current.map(p => {
      if (p.id !== pid) return p;
      const ne = [...p.edges]; const e = ne[ei];
      if (e.hasFlashing && e.flashingType === fType) { ne[ei] = { ...e, hasFlashing: false, flashingType: undefined }; }
      else { ne[ei] = { ...e, hasFlashing: true, flashingType: fType }; }
      return { ...p, edges: ne };
    });
    polysRef.current = u; setPolygons(u); onPolygonsChange?.(u); renderMap();
  }, [onPolygonsChange, renderMap]);

  const updateInteriorType = useCallback((pid: string, ilId: string, type: EdgeType) => {
    const u = polysRef.current.map(p => {
      if (p.id !== pid) return p;
      return { ...p, interiorLines: p.interiorLines.map(il => il.id === ilId ? { ...il, type } : il) };
    });
    polysRef.current = u; setPolygons(u); onPolygonsChange?.(u); renderMap();
  }, [onPolygonsChange, renderMap]);

  const deleteInterior = useCallback((pid: string, ilId: string) => {
    const u = polysRef.current.map(p => {
      if (p.id !== pid) return p;
      return { ...p, interiorLines: p.interiorLines.filter(il => il.id !== ilId) };
    });
    polysRef.current = u; setPolygons(u); onPolygonsChange?.(u); renderMap();
  }, [onPolygonsChange, renderMap]);

  /* == Init Mapbox == */
  useEffect(() => {
    if (!token) { setError('Missing NEXT_PUBLIC_MAPBOX_TOKEN.'); return; }
    if (!mapContainer.current || mapRef.current) return;
    let cancelled = false;
    async function init() {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
        if (cancelled || !mapContainer.current) return;
        mapboxgl.accessToken = token;
        const map = new mapboxgl.Map({ container: mapContainer.current, style: 'mapbox://styles/mapbox/satellite-streets-v12', center, zoom, attributionControl: false });
        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
        map.on('load', () => {
          if (cancelled) return;
          const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
          ['roof-polygons','roof-edges','roof-labels','roof-vertices','roof-drawing','roof-panels'].forEach(id => map.addSource(id, { type: 'geojson', data: empty }));
          map.addLayer({ id: 'roof-poly-fill', type: 'fill', source: 'roof-polygons', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.25 } });
          map.addLayer({ id: 'roof-poly-outline', type: 'line', source: 'roof-polygons', paint: { 'line-color': ['get', 'color'], 'line-width': 1, 'line-opacity': 0.4 } });
          map.addLayer({ id: 'roof-edge-lines', type: 'line', source: 'roof-edges', paint: { 'line-color': ['get', 'color'], 'line-width': 3.5 } });
          map.addLayer({ id: 'roof-edge-labels', type: 'symbol', source: 'roof-labels', layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'], 'text-offset': [0, -0.8], 'text-allow-overlap': true }, paint: { 'text-color': '#fff', 'text-halo-color': ['get', 'color'], 'text-halo-width': 2 } });
          map.addLayer({ id: 'roof-vertex-dots', type: 'circle', source: 'roof-vertices', paint: { 'circle-radius': 5, 'circle-color': '#ea580c', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } });
          map.addLayer({ id: 'roof-draw-line', type: 'line', source: 'roof-drawing', paint: { 'line-color': '#fbbf24', 'line-width': 2, 'line-dasharray': [3, 2] }, filter: ['==', ['geometry-type'], 'LineString'] });
          map.addLayer({ id: 'roof-draw-pts', type: 'circle', source: 'roof-drawing', paint: { 'circle-radius': 5, 'circle-color': '#fbbf24', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' }, filter: ['==', ['geometry-type'], 'Point'] });
          map.addLayer({ id: 'roof-panel-fill', type: 'fill', source: 'roof-panels', paint: { 'fill-color': '#60a5fa', 'fill-opacity': 0.3 } });
          map.addLayer({ id: 'roof-panel-stroke', type: 'line', source: 'roof-panels', paint: { 'line-color': '#93c5fd', 'line-width': 0.5 } });
          setMapLoaded(true);
        });
        mapRef.current = map;
      } catch (err) { if (!cancelled) { console.error(err); setError('Failed to load Mapbox.'); } }
    }
    init();
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { const m = mapRef.current; if (!m || !mapLoaded) return; m.on('click', handleClick); m.on('mousemove', handleMove); return () => { m.off('click', handleClick); m.off('mousemove', handleMove); }; }, [mapLoaded, handleClick, handleMove]);
  useEffect(() => { if (mapLoaded) renderMap(); }, [mapLoaded, polygons, cutListPanels, renderMap]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && drawModeRef.current !== 'none') cancelDraw(); if (e.key === 'Enter' && drawModeRef.current === 'perimeter' && vertsRef.current.length >= 3) finishPerimeter(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [cancelDraw, finishPerimeter]);

  const captureMapImage = useCallback((): string | null => { if (!mapRef.current) return null; try { return mapRef.current.getCanvas().toDataURL('image/jpeg', 0.85); } catch { return null; } }, []);
  useEffect(() => { (window as unknown as Record<string, unknown>).__roofMapCapture = captureMapImage; return () => { delete (window as unknown as Record<string, unknown>).__roofMapCapture; }; }, [captureMapImage]);

  const totalArea = polygons.reduce((s, p) => s + p.areaSqFt, 0);
  const hasPerimeter = polygons.length > 0;
  const isDrawing = drawMode !== 'none';

  /* == JSX == */
  if (!token) return (<div className="bg-surface-50 flex items-center justify-center rounded-xl" style={{ height: '500px' }}><div className="text-center max-w-sm"><p className="text-steel-400 font-medium mb-2">Mapbox Token Required</p><p className="text-steel-500 text-sm">Add <code className="bg-surface-200 px-1.5 py-0.5 rounded text-amber-400">NEXT_PUBLIC_MAPBOX_TOKEN</code> to <code className="bg-surface-200 px-1.5 py-0.5 rounded text-amber-400">.env.local</code></p></div></div>);
  if (error) return (<div className="bg-red-950/30 flex items-center justify-center p-8 rounded-xl" style={{ height: '500px' }}><p className="text-red-400 text-sm">{error}</p></div>);

  return (
    <div className="space-y-3">
      <div className="rounded-xl overflow-hidden border border-steel-700/30">

        {/* Toolbar */}
        <div className="flex gap-2 p-3 bg-surface-50 border-b border-steel-700/30 flex-wrap items-center">
          <input type="text" value={address} onChange={e => setAddress(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGeocode()}
            placeholder="Search address\u2026"
            className="flex-1 min-w-[180px] bg-surface-200 border border-steel-700/30 rounded-lg px-3 py-2 text-sm text-steel-200 placeholder-steel-500 focus:ring-2 focus:ring-amber-500/50" />
          <button onClick={handleGeocode} className="bg-amber-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-amber-500 transition">Go</button>
          <div className="border-l border-steel-700/30 h-8 mx-1" />

          {isDrawing ? (
            <div className="flex gap-2 items-center">
              <span className="text-amber-400 text-sm animate-pulse">{drawMode === 'perimeter' ? 'Click vertices to trace perimeter\u2026' : 'Click 2 points for ' + EDGE_LABELS[drawMode as EdgeType] + ' line\u2026'}</span>
              {drawMode === 'perimeter' && drawVerts.length >= 3 && (
                <button onClick={finishPerimeter} className="bg-amber-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-amber-500 transition">\u2713 Close (Enter)</button>
              )}
              <button onClick={cancelDraw} className="bg-steel-700 text-steel-300 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-steel-600 transition">Cancel (Esc)</button>
            </div>
          ) : (
            <div className="flex gap-1.5 flex-wrap">
              {/* Step 1: Perimeter */}
              <button onClick={() => startDraw('perimeter')} className="bg-emerald-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-emerald-500 transition">
                \u2b23 {hasPerimeter ? 'Add Perimeter' : '1. Draw Perimeter'}
              </button>
              {/* Step 2: Interior lines (only if perimeter exists) */}
              {hasPerimeter && (<>
                <div className="border-l border-steel-700/30 h-6 mx-0.5" />
                <span className="text-steel-500 text-xs self-center mr-1">Interior:</span>
                {INTERIOR_TYPES.map(t => (
                  <button key={t} onClick={() => startDraw(t)}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-lg transition border"
                    style={{ borderColor: EDGE_COLORS[t] + '60', color: EDGE_COLORS[t], backgroundColor: EDGE_COLORS[t] + '15' }}>
                    + {EDGE_LABELS[t]}
                  </button>
                ))}
              </>)}
            </div>
          )}
        </div>

        <div ref={mapContainer} style={{ height: '500px', width: '100%' }} />

        {/* Status bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-surface-100 text-steel-300 text-sm">
          <div className="flex gap-4">
            <span>\u2b1f Roofs: <strong className="text-steel-100">{polygons.length}</strong></span>
            <span>\ud83d\udcd0 Area: <strong className="text-amber-400">{totalArea.toLocaleString()} sq ft</strong></span>
          </div>
          <div className="flex gap-2.5 text-xs flex-wrap">
            {Object.entries(EDGE_COLORS).map(([t, c]) => (
              <span key={t} className="flex items-center gap-1"><span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: c }} /><span className="text-steel-400">{EDGE_LABELS[t as EdgeType]}</span></span>
            ))}
          </div>
        </div>
      </div>

      {/* Roof list with edge editors */}
      {polygons.map((poly, pi) => (
        <div key={poly.id} className="card-dark p-3 space-y-2 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: poly.color || FACET_COLORS[pi % FACET_COLORS.length] }} />
            {editingId === poly.id ? (
              <input type="text" value={poly.name} autoFocus onChange={e => updateMeta(poly.id, 'name', e.target.value)} onBlur={() => setEditingId(null)} onKeyDown={e => e.key === 'Enter' && setEditingId(null)} className="flex-1 bg-surface-200 border border-steel-600 rounded px-2 py-1 text-sm text-steel-200" />
            ) : (
              <span className="flex-1 text-sm text-steel-200 cursor-pointer hover:text-amber-400 transition" onClick={() => setEditingId(poly.id)}>{poly.name}</span>
            )}
            <select title="Pitch" value={poly.pitch} onChange={e => updateMeta(poly.id, 'pitch', e.target.value)} className="bg-surface-200 border border-steel-700/30 rounded px-2 py-1 text-xs text-steel-300">
              {['2/12','3/12','4/12','5/12','6/12','7/12','8/12','9/12','10/12','12/12','14/12'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <span className="text-sm font-semibold text-amber-400 min-w-[80px] text-right">{poly.areaSqFt.toLocaleString()} sf</span>
            <button onClick={() => setEdgeEditPoly(edgeEditPoly === poly.id ? null : poly.id)} className="text-steel-400 hover:text-amber-400 transition text-xs border border-steel-700/30 rounded px-2 py-1">{edgeEditPoly === poly.id ? 'Hide Details' : 'Edit Edges'}</button>
            <button onClick={() => deletePoly(poly.id)} className="text-steel-500 hover:text-red-400 transition text-lg">\u00d7</button>
          </div>

          {edgeEditPoly === poly.id && (
            <div className="space-y-2 pl-6">
              {/* Perimeter edges */}
              <p className="text-steel-500 text-xs font-semibold uppercase tracking-wide">Perimeter Edges</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {poly.edges.map((e, ei) => {
                  const len = Math.round(edgeLen(e.from, e.to));
                  return (
                    <div key={ei} className="flex items-center gap-2 bg-surface-200/50 rounded px-2 py-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: EDGE_COLORS[e.type] }} />
                      <span className="text-steel-400 text-xs w-14">Edge {ei+1} ({len}')</span>
                      <select value={e.type} onChange={ev => updateEdgeType(poly.id, ei, ev.target.value as EdgeType)} className="bg-surface-100 border border-steel-700/30 rounded px-1.5 py-0.5 text-xs text-steel-300 flex-1">
                        {(['eave','rake','hip','endwall','step_flashing'] as EdgeType[]).map(t => <option key={t} value={t}>{EDGE_LABELS[t]}</option>)}
                      </select>
                      <button onClick={() => toggleFlashing(poly.id, ei, 'endwall')} className={'text-xs px-1.5 py-0.5 rounded border transition ' + (e.hasFlashing && e.flashingType === 'endwall' ? 'border-yellow-500 text-yellow-400 bg-yellow-500/10' : 'border-steel-700/30 text-steel-500 hover:text-yellow-400')}>+EW</button>
                      <button onClick={() => toggleFlashing(poly.id, ei, 'step_flashing')} className={'text-xs px-1.5 py-0.5 rounded border transition ' + (e.hasFlashing && e.flashingType === 'step_flashing' ? 'border-orange-500 text-orange-400 bg-orange-500/10' : 'border-steel-700/30 text-steel-500 hover:text-orange-400')}>+SF</button>
                    </div>
                  );
                })}
              </div>

              {/* Interior lines */}
              {poly.interiorLines.length > 0 && (<>
                <p className="text-steel-500 text-xs font-semibold uppercase tracking-wide mt-2">Interior Lines</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {poly.interiorLines.map(il => {
                    const len = Math.round(edgeLen(il.from, il.to));
                    return (
                      <div key={il.id} className="flex items-center gap-2 bg-surface-200/50 rounded px-2 py-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: EDGE_COLORS[il.type] }} />
                        <span className="text-steel-400 text-xs w-14">{EDGE_LABELS[il.type]} ({len}')</span>
                        <select value={il.type} onChange={ev => updateInteriorType(poly.id, il.id, ev.target.value as EdgeType)} className="bg-surface-100 border border-steel-700/30 rounded px-1.5 py-0.5 text-xs text-steel-300 flex-1">
                          {INTERIOR_TYPES.map(t => <option key={t} value={t}>{EDGE_LABELS[t]}</option>)}
                        </select>
                        <button onClick={() => deleteInterior(poly.id, il.id)} className="text-steel-500 hover:text-red-400 transition text-sm">\u00d7</button>
                      </div>
                    );
                  })}
                </div>
              </>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}