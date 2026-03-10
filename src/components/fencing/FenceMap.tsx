'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { calculateVertexAngle, determineBraceType } from '@/lib/fencing/fence-materials';
import type { FencePointType } from '@/types';

const POINT_TYPE_OPTIONS: { value: FencePointType; label: string; color: string }[] = [
  { value: 'line_post', label: 'Line Post', color: '#9ca3af' },
  { value: 'h_brace', label: 'H-Brace', color: '#16a34a' },
  { value: 'n_brace', label: 'N-Brace', color: '#0d9488' },
  { value: 'corner_brace', label: 'Corner Brace', color: '#2563eb' },
  { value: 'double_h', label: 'Double H-Brace', color: '#dc2626' },
  { value: 'kicker', label: 'Line Post w/ Kicker', color: '#7c3aed' },
  { value: 'gate', label: 'Gate', color: '#f59e0b' },
  { value: 'water_gap', label: 'Water Gap', color: '#06b6d4' },
];

interface FenceMapProps {
  onFenceLinesChange?: (lines: DrawnLine[]) => void;
  onTerrainAnalyzed?: (analysis: TerrainSuggestion) => void;
  onMapCapture?: (dataUrl: string) => void;
  onGatesPlaced?: (gates: MapGate[]) => void;
  onPointTypeChange?: (coordinate: [number, number], type: FencePointType) => void;
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

export interface MapGate {
  id: string;
  coordinate: [number, number];
  type: string; // gate type label
  nearestLineId: string;
}

export interface BraceMarker {
  coordinate: [number, number];
  type: string; // 'h_brace' | 'corner_brace' | 'double_h' | 'end_brace'
  label: string;
  angleDegrees: number;
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
  // Enriched USDA SDA data
  bedrockDepthIn: number | null;
  restrictionType: string | null;
  slopeRange: string | null;
  slopeLow: number | null;
  slopeHigh: number | null;
  runoff: string | null;
  taxonomy: string | null;
  taxOrder: string | null;
  texture: string | null;
  clayPct: number | null;
  sandPct: number | null;
  rockFragmentPct: number | null;
  pH: number | null;
  organicMatter: number | null;
}

/** Snap a point to the nearest position on a line segment */
function snapToSegment(p: [number, number], a: [number, number], b: [number, number]): [number, number] {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return a;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return [a[0] + t * dx, a[1] + t * dy];
}

export default function FenceMap({
  onFenceLinesChange,
  onTerrainAnalyzed,
  onMapCapture,
  onGatesPlaced,
  onPointTypeChange,
  center = [-98.23, 30.75],
  zoom = 16,
}: FenceMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const gateMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [token] = useState(process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '');
  const [error, setError] = useState('');
  const [totalLength, setTotalLength] = useState(0);
  const [lineCount, setLineCount] = useState(0);
  const [address, setAddress] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [gatePlaceMode, setGatePlaceMode] = useState(false);
  const [placedGates, setPlacedGates] = useState<MapGate[]>([]);
  const [braceMarkers, setBraceMarkers] = useState<BraceMarker[]>([]);
  const [pointOverrides, setPointOverrides] = useState<Map<string, FencePointType>>(new Map());
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const drawnLinesRef = useRef<DrawnLine[]>([]);

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
        // Enriched USDA SDA data
        bedrockDepthIn: analysis.soilInfo?.bedrockDepthIn ?? null,
        restrictionType: analysis.soilInfo?.restrictionType ?? null,
        slopeRange: analysis.soilInfo?.slopeRange ?? null,
        slopeLow: analysis.soilInfo?.slopeLow ?? null,
        slopeHigh: analysis.soilInfo?.slopeHigh ?? null,
        runoff: analysis.soilInfo?.runoff ?? null,
        taxonomy: analysis.soilInfo?.taxonomy ?? null,
        taxOrder: analysis.soilInfo?.taxOrder ?? null,
        texture: analysis.soilInfo?.texture ?? null,
        clayPct: analysis.soilInfo?.clayPct ?? null,
        sandPct: analysis.soilInfo?.sandPct ?? null,
        rockFragmentPct: analysis.soilInfo?.rockFragmentPct ?? null,
        pH: analysis.soilInfo?.pH ?? null,
        organicMatter: analysis.soilInfo?.organicMatter ?? null,
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
    const braces: BraceMarker[] = [];

    for (const feature of fc.features) {
      if (feature.geometry.type === 'LineString') {
        const coords = feature.geometry.coordinates as [number, number][];
        const len = calcLineLengthFeet(coords);
        const angles = calcVertexAngles(coords);
        total += len;
        allCoords.push(...coords);
        drawnLines.push({ id: feature.id as string, coordinates: coords, lengthFeet: len, vertexAngles: angles });

        // End-of-line braces (double H-brace at start and end)
        if (coords.length >= 2) {
          braces.push({ coordinate: coords[0], type: 'double_h', label: 'Double H-Brace (end post)', angleDegrees: 0 });
          braces.push({ coordinate: coords[coords.length - 1], type: 'double_h', label: 'Double H-Brace (end post)', angleDegrees: 0 });
        }

        // Vertex braces (corners)
        for (const va of angles) {
          if (va.deviation > 8) {
            const braceRec = determineBraceType(va.angleDegrees);
            if (braceRec) {
              braces.push({ coordinate: va.coordinate, type: braceRec.type, label: braceRec.label, angleDegrees: va.angleDegrees });
            }
          }
        }
      }
    }

    setTotalLength(total);
    setLineCount(drawnLines.length);
    setBraceMarkers(braces);
    drawnLinesRef.current = drawnLines;
    onFenceLinesChange?.(drawnLines);

    // Trigger terrain analysis
    if (allCoords.length >= 2) {
      analyzeTerrainForLines(allCoords);
    }
  }, [calcLineLengthFeet, calcVertexAngles, onFenceLinesChange, analyzeTerrainForLines]);

  // Render brace markers on the map with click-to-change-type popups
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    // Clear old markers & popup
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; }

    const coordKey = (c: [number, number]) => `${c[0].toFixed(8)},${c[1].toFixed(8)}`;

    const createMarker = (mapboxgl: typeof import('mapbox-gl').default, brace: BraceMarker) => {
      if (!mapRef.current) return;
      const key = coordKey(brace.coordinate);
      const overrideType = pointOverrides.get(key);
      const activeType = overrideType ?? brace.type;
      const opt = POINT_TYPE_OPTIONS.find(o => o.value === activeType);

      const el = document.createElement('div');
      el.style.width = '20px';
      el.style.height = '20px';
      el.style.borderRadius = activeType === 'gate' ? '4px' : '50%';
      el.style.border = '2px solid #fff';
      el.style.cursor = 'pointer';
      el.style.backgroundColor = opt?.color ?? '#16a34a';
      el.title = `${opt?.label ?? brace.label}${brace.angleDegrees > 0 ? ` (${Math.round(brace.angleDegrees)}°)` : ''} — click to change`;

      // Click handler: show type-selection popup
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (!mapRef.current) return;
        if (popupRef.current) popupRef.current.remove();

        const popupHtml = `<div style="display:flex;flex-direction:column;gap:4px;padding:4px;min-width:140px">
          <div style="font-size:11px;font-weight:600;color:#ccc;margin-bottom:2px">Point Type</div>
          ${POINT_TYPE_OPTIONS.map(o => `<button data-pt="${o.value}" style="display:flex;align-items:center;gap:6px;padding:4px 8px;border:none;border-radius:4px;cursor:pointer;background:${activeType === o.value ? '#374151' : 'transparent'};color:#e5e7eb;font-size:12px;text-align:left" onmouseover="this.style.background='#374151'" onmouseout="this.style.background='${activeType === o.value ? '#374151' : 'transparent'}'"><span style="width:10px;height:10px;border-radius:${o.value === 'gate' ? '2px' : '50%'};background:${o.color};display:inline-block"></span>${o.label}</button>`).join('')}
        </div>`;

        const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true, className: 'fence-point-popup', maxWidth: '200px', offset: 15 })
          .setLngLat(brace.coordinate)
          .setHTML(popupHtml)
          .addTo(mapRef.current!);

        // Wire up button clicks inside popup
        setTimeout(() => {
          const container = popup.getElement();
          if (!container) return;
          container.querySelectorAll('button[data-pt]').forEach(btn => {
            btn.addEventListener('click', () => {
              const newType = btn.getAttribute('data-pt') as FencePointType;
              setPointOverrides(prev => {
                const next = new Map(prev);
                next.set(key, newType);
                return next;
              });
              onPointTypeChange?.(brace.coordinate, newType);
              popup.remove();
            });
          });
        }, 0);

        popupRef.current = popup;
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(brace.coordinate)
        .addTo(mapRef.current);
      markersRef.current.push(marker);
    };

    // Use globally cached mapboxgl, or dynamic import
    const cachedGl = (window as unknown as { mapboxgl?: typeof import('mapbox-gl').default }).mapboxgl;
    if (cachedGl) {
      for (const brace of braceMarkers) createMarker(cachedGl, brace);
    } else {
      import('mapbox-gl').then(mod => {
        for (const brace of braceMarkers) createMarker(mod.default, brace);
      });
    }
  }, [braceMarkers, mapLoaded, pointOverrides, onPointTypeChange]);

  // Gate placement: snap click to nearest point on a fence line
  const handleMapClick = useCallback((e: { lngLat: { lng: number; lat: number } }) => {
    if (!gatePlaceMode || drawnLinesRef.current.length === 0) return;

    const click: [number, number] = [e.lngLat.lng, e.lngLat.lat];
    let bestDist = Infinity;
    let bestPoint: [number, number] = click;
    let bestLineId = '';

    // Find closest point on any fence line
    for (const line of drawnLinesRef.current) {
      for (let i = 0; i < line.coordinates.length - 1; i++) {
        const a = line.coordinates[i];
        const b = line.coordinates[i + 1];
        const snapped = snapToSegment(click, a, b);
        const d = Math.hypot(snapped[0] - click[0], snapped[1] - click[1]);
        if (d < bestDist) {
          bestDist = d;
          bestPoint = snapped;
          bestLineId = line.id;
        }
      }
    }

    // Only accept if close enough (~100m in lng/lat units)
    if (bestDist > 0.002) return;

    const gate: MapGate = {
      id: `mg_${Date.now()}`,
      coordinate: bestPoint,
      type: 'Gate',
      nearestLineId: bestLineId,
    };
    setPlacedGates(prev => {
      const next = [...prev, gate];
      onGatesPlaced?.(next);
      return next;
    });
  }, [gatePlaceMode, onGatesPlaced]);

  // Render gate markers
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    gateMarkersRef.current.forEach(m => m.remove());
    gateMarkersRef.current = [];

    for (const gate of placedGates) {
      const el = document.createElement('div');
      el.style.width = '22px';
      el.style.height = '22px';
      el.style.borderRadius = '4px';
      el.style.border = '2px solid #fbbf24';
      el.style.backgroundColor = '#f59e0b';
      el.style.cursor = 'pointer';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.fontSize = '12px';
      el.style.fontWeight = 'bold';
      el.style.color = '#1b2636';
      el.textContent = 'G';
      el.title = `Gate: ${gate.type}`;

      import('mapbox-gl').then(mod => {
        if (!mapRef.current) return;
        const marker = new mod.default.Marker({ element: el })
          .setLngLat(gate.coordinate)
          .addTo(mapRef.current);
        gateMarkersRef.current.push(marker);
      });
    }
  }, [placedGates, mapLoaded]);

  // Wire up map click for gate placement
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const handler = (e: mapboxgl.MapMouseEvent) => handleMapClick(e);
    map.on('click', handler);
    return () => { map.off('click', handler); };
  }, [mapLoaded, handleMapClick]);

  // Remove a placed gate
  const removeLastGate = useCallback(() => {
    setPlacedGates(prev => {
      const next = prev.slice(0, -1);
      onGatesPlaced?.(next);
      return next;
    });
  }, [onGatesPlaced]);

  // Capture map screenshot — composites HTML markers (gates, braces) onto canvas
  const captureMap = useCallback(() => {
    if (!mapRef.current) return;
    try {
      const map = mapRef.current;
      const srcCanvas = map.getCanvas();
      const w = srcCanvas.width;
      const h = srcCanvas.height;

      // Create offscreen canvas and draw the base map
      const offscreen = document.createElement('canvas');
      offscreen.width = w;
      offscreen.height = h;
      const ctx = offscreen.getContext('2d');
      if (!ctx) { onMapCapture?.(srcCanvas.toDataURL('image/png')); return; }
      ctx.drawImage(srcCanvas, 0, 0);

      const dpr = window.devicePixelRatio || 1;

      // Draw brace markers (colored circles with white border)
      for (const brace of braceMarkers) {
        const pt = map.project(brace.coordinate);
        const x = pt.x * dpr;
        const y = pt.y * dpr;
        const r = 10 * dpr;

        // White border
        ctx.beginPath();
        ctx.arc(x, y, r + 2 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Colored fill
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        if (brace.type === 'double_h') ctx.fillStyle = '#dc2626';       // red — end posts
        else if (brace.type === 'corner_brace') ctx.fillStyle = '#2563eb'; // blue — corners
        else ctx.fillStyle = '#16a34a';                                    // green — H-braces
        ctx.fill();
      }

      // Draw gate markers (yellow squares with "G")
      for (const gate of placedGates) {
        const pt = map.project(gate.coordinate);
        const x = pt.x * dpr;
        const y = pt.y * dpr;
        const sz = 13 * dpr;

        // Yellow square with border
        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2 * dpr;
        ctx.fillRect(x - sz, y - sz, sz * 2, sz * 2);
        ctx.strokeRect(x - sz, y - sz, sz * 2, sz * 2);

        // "G" text
        ctx.fillStyle = '#1b2636';
        ctx.font = `bold ${12 * dpr}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('G', x, y);
      }

      // Draw legend bar at bottom
      const legendH = 28 * dpr;
      const legendY = h - legendH;
      ctx.fillStyle = 'rgba(27, 38, 54, 0.85)';
      ctx.fillRect(0, legendY, w, legendH);

      ctx.font = `${10 * dpr}px Arial, sans-serif`;
      ctx.textBaseline = 'middle';
      const cy = legendY + legendH / 2;
      let lx = 10 * dpr;

      // Legend items: Orange=fence, Red=end post, Blue=corner, Green=H-brace, Yellow=gate
      const legendItems: [string, string][] = [
        ['#f59e0b', 'Fence Line'],
        ['#dc2626', 'End Post'],
        ['#2563eb', 'Corner Brace'],
        ['#16a34a', 'H-Brace'],
        ['#f59e0b', 'Gate'],
      ];
      for (const [color, label] of legendItems) {
        // Swatch
        if (label === 'Gate') {
          ctx.fillStyle = color;
          ctx.fillRect(lx, cy - 5 * dpr, 10 * dpr, 10 * dpr);
          ctx.fillStyle = '#1b2636';
          ctx.font = `bold ${7 * dpr}px Arial, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('G', lx + 5 * dpr, cy);
          ctx.font = `${10 * dpr}px Arial, sans-serif`;
          ctx.textAlign = 'left';
        } else if (label === 'Fence Line') {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2 * dpr;
          ctx.setLineDash([4 * dpr, 3 * dpr]);
          ctx.beginPath();
          ctx.moveTo(lx, cy);
          ctx.lineTo(lx + 14 * dpr, cy);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.beginPath();
          ctx.arc(lx + 5 * dpr, cy, 5 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
        lx += 16 * dpr;
        ctx.fillStyle = '#d1d5db';
        ctx.textAlign = 'left';
        ctx.fillText(label, lx, cy);
        lx += ctx.measureText(label).width + 16 * dpr;
      }

      const dataUrl = offscreen.toDataURL('image/png');
      onMapCapture?.(dataUrl);
    } catch (err) {
      console.error('Map capture error:', err);
    }
  }, [onMapCapture, braceMarkers, placedGates]);

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
          maxZoom: 22,
          attributionControl: false,
          preserveDrawingBuffer: true, // required for canvas.toDataURL() map capture
        });

        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        map.addControl(new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false, showUserLocation: true }), 'top-right');
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

        // Auto-zoom to user location on first load
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (!cancelled && map) {
                map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16, duration: 2500 });
              }
            },
            () => { /* user denied or unavailable — stay on default center */ }
          );
        }

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

        // Inject dark-theme popup styles for point-type selector
        if (!document.getElementById('fence-point-popup-css')) {
          const style = document.createElement('style');
          style.id = 'fence-point-popup-css';
          style.textContent = `.fence-point-popup .mapboxgl-popup-content{background:#1f2937;border:1px solid #374151;border-radius:8px;padding:6px;box-shadow:0 4px 12px rgba(0,0,0,.5)}.fence-point-popup .mapboxgl-popup-tip{border-top-color:#1f2937}.fence-point-popup .mapboxgl-popup-close-button{color:#9ca3af;font-size:16px;padding:2px 6px}`;
          document.head.appendChild(style);
        }
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
      {/* Controls bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-100 text-steel-300 text-sm">
        <div className="flex gap-4 items-center">
          <span>&#x1f4cf; Lines: <strong className="text-steel-100">{lineCount}</strong></span>
          <span>&#x1f4d0; Total: <strong className="text-amber-400">{Math.round(totalLength).toLocaleString()} ft</strong></span>
          {totalLength > 0 && <span className="text-steel-500">({(totalLength / 5280).toFixed(2)} mi)</span>}
        </div>
        <div className="flex gap-2 text-xs text-steel-500 items-center">
          {analyzing && <span className="text-amber-400 animate-pulse">&#x26a1; Analyzing terrain...</span>}
          {!mapLoaded && <span className="animate-pulse">Loading map&hellip;</span>}
          {mapLoaded && !analyzing && <span>&#x2713; Draw fence lines on satellite view</span>}
        </div>
      </div>
      {/* Gate placement & capture bar */}
      {lineCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-surface-200 border-t border-steel-700/20 text-xs">
          <button
            onClick={() => setGatePlaceMode(p => !p)}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              gatePlaceMode
                ? 'bg-amber-500 text-surface-400 shadow-md'
                : 'bg-surface-50 text-steel-300 hover:bg-surface-100'
            }`}
          >
            {gatePlaceMode ? '&#x1f6aa; Click Fence Line to Place Gate' : '&#x1f6aa; Place Gate'}
          </button>
          {placedGates.length > 0 && (
            <button onClick={removeLastGate} className="px-3 py-1.5 rounded-lg bg-red-900/40 text-red-300 hover:bg-red-900/60 transition font-medium">
              Undo Gate ({placedGates.length})
            </button>
          )}
          {onMapCapture && (
            <button onClick={captureMap} className="px-3 py-1.5 rounded-lg bg-surface-50 text-steel-300 hover:bg-surface-100 transition font-medium ml-auto">
              &#x1f4f8; Capture for PDF
            </button>
          )}
          {/* Legend */}
          <div className="flex gap-3 ml-auto text-[10px] text-steel-400 flex-wrap items-center">
            {braceMarkers.length > 0 && (
              <>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 border border-white/50"></span> End Post</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-600 border border-white/50"></span> Corner</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-green-600 border border-white/50"></span> H-Brace</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-violet-600 border border-white/50"></span> Kicker</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-cyan-500 border border-white/50"></span> Water Gap</span>
                <span className="text-steel-500 italic">Click markers to change type</span>
              </>
            )}
            {placedGates.length > 0 && (
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded bg-amber-500 border border-amber-300"></span> Gate ({placedGates.length})</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}