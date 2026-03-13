'use client';

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
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
  /** Called when a new point is added along a fence line (for gates, braces, etc.) */
  onAddPointOnLine?: (coordinate: [number, number], type: FencePointType, nearestLineId: string) => void;
  center?: [number, number];
  zoom?: number;
}

export interface FenceMapHandle {
  /** Fit all drawn fence lines in view, capture a screenshot, and restore the previous view. */
  captureOverview: () => Promise<string | null>;
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

/** Elevation data for a segment between two sampled points */
export interface ElevationSegment {
  from: [number, number];
  to: [number, number];
  slopePct: number;       // rise/run * 100
  elevationChange: number; // feet
  distanceFeet: number;
  steep: boolean;          // true if slopePct > 15%
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
  // Per-segment elevation data for steep section highlighting & surcharge
  elevationSegments?: ElevationSegment[];
  steepFootage?: number;  // total feet of steep terrain (>15% slope)
}

/** Snap a point to the nearest position on a line segment */
function snapToSegment(p: [number, number], a: [number, number], b: [number, number]): [number, number] {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return a;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return [a[0] + t * dx, a[1] + t * dy];
}

const FenceMap = forwardRef<FenceMapHandle, FenceMapProps>(function FenceMap({
  onFenceLinesChange,
  onTerrainAnalyzed,
  onMapCapture,
  onGatesPlaced,
  onPointTypeChange,
  onAddPointOnLine,
  center = [-98.23, 30.75],
  zoom = 16,
}, ref) {
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
  // Add-point-on-line mode: click fence line to place a new brace/gate/etc.
  const [addPointMode, setAddPointMode] = useState(false);
  const [addPointType, setAddPointType] = useState<FencePointType>('h_brace');
  const [addedPoints, setAddedPoints] = useState<{ coordinate: [number, number]; type: FencePointType; lineId: string }[]>([]);
  const addedPointMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const [terrain3d, setTerrain3d] = useState(false);

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

      // Build elevation segments for steep-section highlighting
      const elevSegs: ElevationSegment[] = [];
      let steepFt = 0;
      const profile = analysis.elevationProfile;
      for (let i = 1; i < profile.length; i++) {
        const from: [number, number] = [profile[i - 1].lng, profile[i - 1].lat];
        const to: [number, number] = [profile[i].lng, profile[i].lat];
        const dist = calcLineLengthFeet([from, to]);
        const elevChg = Math.abs(profile[i].elevation - profile[i - 1].elevation);
        const slopePct = dist > 0 ? (elevChg / dist) * 100 : 0;
        const steep = slopePct > 15;
        if (steep) steepFt += dist;
        elevSegs.push({ from, to, slopePct, elevationChange: elevChg, distanceFeet: dist, steep });
      }

      // Draw steep segments as red overlay lines on the map
      const map = mapRef.current;
      if (map && map.loaded()) {
        // Remove old steep layers
        if (map.getLayer('steep-segments')) map.removeLayer('steep-segments');
        if (map.getSource('steep-segments')) map.removeSource('steep-segments');

        const steepFeatures = elevSegs.filter(s => s.steep).map(s => ({
          type: 'Feature' as const,
          properties: { slope: Math.round(s.slopePct) },
          geometry: { type: 'LineString' as const, coordinates: [s.from, s.to] },
        }));

        if (steepFeatures.length > 0) {
          map.addSource('steep-segments', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: steepFeatures },
          });
          map.addLayer({
            id: 'steep-segments',
            type: 'line',
            source: 'steep-segments',
            paint: {
              'line-color': '#ef4444',
              'line-width': 6,
              'line-opacity': 0.75,
              'line-dasharray': [2, 1],
            },
          });
        }
      }

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
        // Elevation segments & steep footage
        elevationSegments: elevSegs,
        steepFootage: Math.round(steepFt),
      });
    } catch (err) {
      console.error('Terrain analysis error:', err);
    } finally {
      setAnalyzing(false);
    }
  }, [token, onTerrainAnalyzed, calcLineLengthFeet]);

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

  // Gate placement or add-point: snap click to nearest point on a fence line
  const handleMapClick = useCallback((e: { lngLat: { lng: number; lat: number } }) => {
    if ((!gatePlaceMode && !addPointMode) || drawnLinesRef.current.length === 0) return;

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

    if (gatePlaceMode) {
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
    } else if (addPointMode) {
      const newPt = { coordinate: bestPoint, type: addPointType, lineId: bestLineId };
      setAddedPoints(prev => [...prev, newPt]);
      onAddPointOnLine?.(bestPoint, addPointType, bestLineId);
    }
  }, [gatePlaceMode, addPointMode, addPointType, onGatesPlaced, onAddPointOnLine]);

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

  // Render added-point markers (points placed along fence lines)
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    addedPointMarkersRef.current.forEach(m => m.remove());
    addedPointMarkersRef.current = [];

    for (const pt of addedPoints) {
      const opt = POINT_TYPE_OPTIONS.find(o => o.value === pt.type);
      const el = document.createElement('div');
      el.style.width = '18px';
      el.style.height = '18px';
      el.style.borderRadius = pt.type === 'gate' ? '4px' : '50%';
      el.style.border = '2px solid #fff';
      el.style.backgroundColor = opt?.color ?? '#16a34a';
      el.style.cursor = 'pointer';
      el.style.boxShadow = '0 0 6px rgba(0,0,0,0.5)';
      el.title = opt?.label ?? pt.type;

      import('mapbox-gl').then(mod => {
        if (!mapRef.current) return;
        const marker = new mod.default.Marker({ element: el })
          .setLngLat(pt.coordinate)
          .addTo(mapRef.current);
        addedPointMarkersRef.current.push(marker);
      });
    }
  }, [addedPoints, mapLoaded]);

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

      // Draw added-point markers (colored circles)
      for (const pt of addedPoints) {
        const projected = map.project(pt.coordinate);
        const x = projected.x * dpr;
        const y = projected.y * dpr;
        const r = 9 * dpr;
        const opt = POINT_TYPE_OPTIONS.find(o => o.value === pt.type);

        ctx.beginPath();
        ctx.arc(x, y, r + 2 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = opt?.color ?? '#16a34a';
        ctx.fill();
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

      // Legend items: Orange=fence, Red=end post, Blue=corner, Green=H-brace, Yellow=gate, Dashed red=steep
      const legendItems: [string, string][] = [
        ['#f59e0b', 'Fence Line'],
        ['#dc2626', 'End Post'],
        ['#2563eb', 'Corner Brace'],
        ['#16a34a', 'H-Brace'],
        ['#f59e0b', 'Gate'],
        ['#ef4444', 'Steep Grade'],
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
        } else if (label === 'Fence Line' || label === 'Steep Grade') {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2 * dpr;
          ctx.setLineDash(label === 'Steep Grade' ? [4 * dpr, 3 * dpr] : [4 * dpr, 3 * dpr]);
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
  }, [onMapCapture, braceMarkers, placedGates, addedPoints]);

  // captureOverview: fit all fence lines, capture, then restore previous view
  const captureOverview = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      const map = mapRef.current;
      if (!map) { resolve(null); return; }

      const lines = drawnLinesRef.current;
      if (lines.length === 0) { resolve(null); return; }

      // Collect all coordinates from all drawn lines
      const allCoords = lines.flatMap(l => l.coordinates);
      if (allCoords.length === 0) { resolve(null); return; }

      // Compute bounding box
      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const [lng, lat] of allCoords) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }

      // Save current view
      const prevCenter = map.getCenter();
      const prevZoom = map.getZoom();
      const prevBearing = map.getBearing();
      const prevPitch = map.getPitch();

      // Fit bounds with padding
      map.fitBounds(
        [[minLng, minLat], [maxLng, maxLat]],
        { padding: 80, duration: 0, bearing: 0, pitch: 0 }
      );

      // Wait for render then capture
      const doCapture = () => {
        try {
          const srcCanvas = map.getCanvas();
          const w = srcCanvas.width;
          const h = srcCanvas.height;
          const offscreen = document.createElement('canvas');
          offscreen.width = w;
          offscreen.height = h;
          const ctx = offscreen.getContext('2d');
          if (!ctx) { resolve(srcCanvas.toDataURL('image/png')); return; }
          ctx.drawImage(srcCanvas, 0, 0);

          const dpr = window.devicePixelRatio || 1;

          // Composite brace markers
          for (const brace of braceMarkers) {
            const pt = map.project(brace.coordinate);
            const x = pt.x * dpr;
            const y = pt.y * dpr;
            const r = 10 * dpr;
            ctx.beginPath();
            ctx.arc(x, y, r + 2 * dpr, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            if (brace.type === 'double_h') ctx.fillStyle = '#dc2626';
            else if (brace.type === 'corner_brace') ctx.fillStyle = '#2563eb';
            else ctx.fillStyle = '#16a34a';
            ctx.fill();
          }

          // Composite gate markers
          for (const gate of placedGates) {
            const pt = map.project(gate.coordinate);
            const x = pt.x * dpr;
            const y = pt.y * dpr;
            const sz = 13 * dpr;
            ctx.fillStyle = '#f59e0b';
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2 * dpr;
            ctx.fillRect(x - sz, y - sz, sz * 2, sz * 2);
            ctx.strokeRect(x - sz, y - sz, sz * 2, sz * 2);
            ctx.fillStyle = '#1b2636';
            ctx.font = `bold ${12 * dpr}px Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('G', x, y);
          }

          // Composite added-point markers
          for (const pt of addedPoints) {
            const projected = map.project(pt.coordinate);
            const x = projected.x * dpr;
            const y = projected.y * dpr;
            const r = 9 * dpr;
            const opt = POINT_TYPE_OPTIONS.find(o => o.value === pt.type);
            ctx.beginPath();
            ctx.arc(x, y, r + 2 * dpr, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = opt?.color ?? '#16a34a';
            ctx.fill();
          }

          // "OVERVIEW" label in top-left
          ctx.fillStyle = 'rgba(27, 38, 54, 0.75)';
          ctx.fillRect(0, 0, 180 * dpr, 28 * dpr);
          ctx.font = `bold ${12 * dpr}px Arial, sans-serif`;
          ctx.fillStyle = '#d1d5db';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText('FULL FENCE OVERVIEW', 10 * dpr, 14 * dpr);

          const dataUrl = offscreen.toDataURL('image/png');

          // Restore previous view
          map.jumpTo({ center: prevCenter, zoom: prevZoom, bearing: prevBearing, pitch: prevPitch });

          resolve(dataUrl);
        } catch {
          resolve(null);
        }
      };

      // Use idle event (fires after all rendering) or fall back to timeout
      const onIdle = () => {
        map.off('idle', onIdle);
        doCapture();
      };
      map.on('idle', onIdle);
      // Safety timeout in case idle never fires
      setTimeout(() => {
        map.off('idle', onIdle);
        doCapture();
      }, 1500);
    });
  }, [braceMarkers, placedGates, addedPoints]);

  // Expose captureOverview to parent via ref
  useImperativeHandle(ref, () => ({
    captureOverview,
  }), [captureOverview]);

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
        map.on('load', () => {
          if (!cancelled) setMapLoaded(true);

          // Add Mapbox DEM source for 3D terrain
          map.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14,
          });

          // Add sky layer for 3D mode atmosphere
          map.addLayer({
            id: 'sky',
            type: 'sky',
            paint: {
              'sky-type': 'atmosphere',
              'sky-atmosphere-sun': [0.0, 0.0],
              'sky-atmosphere-sun-intensity': 15,
            },
          });

          // Add Bing Maps aerial tile layer for higher resolution imagery
          map.addSource('bing-aerial', {
            type: 'raster',
            tiles: [
              'https://ecn.t0.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=587&n=z',
              'https://ecn.t1.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=587&n=z',
              'https://ecn.t2.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=587&n=z',
              'https://ecn.t3.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=587&n=z',
            ],
            tileSize: 256,
            maxzoom: 20,
          });
          // Insert below labels but above default satellite base
          const firstSymbolLayer = map.getStyle().layers?.find(l => l.type === 'symbol');
          map.addLayer({
            id: 'bing-aerial-layer',
            type: 'raster',
            source: 'bing-aerial',
            paint: { 'raster-opacity': 0.85 },
          }, firstSymbolLayer?.id);
        });

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
      <div className="bg-steel-900 flex items-center justify-center rounded-xl" style={{ height: '500px' }}>
        <div className="text-center max-w-sm">
          <p className="text-steel-400 font-medium mb-2">Mapbox Token Required</p>
          <p className="text-steel-500 text-sm">Add <code className="bg-black px-1.5 py-0.5 rounded text-white">NEXT_PUBLIC_MAPBOX_TOKEN</code> to <code className="bg-black px-1.5 py-0.5 rounded text-white">.env.local</code></p>
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
    <div className="rounded-xl overflow-hidden border border-steel-800">
      <div className="flex gap-2 p-3 bg-steel-900 border-b border-steel-800">
        <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleGeocode()}
          placeholder="Search address to fly to location\u2026"
          className="flex-1 bg-black border border-steel-800 rounded-lg px-3 py-2 text-sm text-steel-200 placeholder-steel-500 focus:ring-2 focus:ring-tan-400/40 focus:border-white/20" />
        <button onClick={handleGeocode}
          className="bg-tan-400 text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-tan-300 transition">Go</button>
      </div>
      <div ref={mapContainer} style={{ height: '500px', width: '100%' }} />
      {/* Controls bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-steel-900 text-steel-300 text-sm">
        <div className="flex gap-4 items-center">
          <span>&#x1f4cf; Lines: <strong className="text-steel-100">{lineCount}</strong></span>
          <span>&#x1f4d0; Total: <strong className="text-white">{Math.round(totalLength).toLocaleString()} ft</strong></span>
          {totalLength > 0 && <span className="text-steel-500">({(totalLength / 5280).toFixed(2)} mi)</span>}
          {mapLoaded && (
            <button
              onClick={() => {
                const map = mapRef.current;
                if (!map) return;
                const next = !terrain3d;
                setTerrain3d(next);
                if (next) {
                  map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
                  map.easeTo({ pitch: 60, bearing: map.getBearing(), duration: 800 });
                } else {
                  map.setTerrain();
                  map.easeTo({ pitch: 0, duration: 800 });
                }
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                terrain3d
                  ? 'bg-tan-400 text-black shadow-md'
                  : 'bg-steel-800 text-steel-300 hover:bg-steel-700'
              }`}
              title={terrain3d ? 'Switch to 2D view' : 'Switch to 3D terrain view'}
            >
              {terrain3d ? '\u{1F3D4}\uFE0F 3D On' : '\u{1F3D4}\uFE0F 3D'}
            </button>
          )}
        </div>
        <div className="flex gap-2 text-xs text-steel-500 items-center">
          {analyzing && <span className="text-white animate-pulse">&#x26a1; Analyzing terrain...</span>}
          {!mapLoaded && <span className="animate-pulse">Loading map&hellip;</span>}
          {mapLoaded && !analyzing && <span>&#x2713; Draw fence lines on satellite view</span>}
        </div>
      </div>
      {/* Gate placement, add-point & capture bar */}
      {lineCount > 0 && (
        <div className="flex flex-col gap-2 px-4 py-2 bg-black border-t border-white/[0.06] text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => { setGatePlaceMode(p => !p); if (!gatePlaceMode) setAddPointMode(false); }}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                gatePlaceMode
                  ? 'bg-tan-400 text-black shadow-md'
                  : 'bg-steel-900 text-steel-300 hover:bg-steel-900'
              }`}
            >
              {gatePlaceMode ? '&#x1f6aa; Click Fence Line to Place Gate' : '&#x1f6aa; Place Gate'}
            </button>
            {placedGates.length > 0 && (
              <button onClick={removeLastGate} className="px-3 py-1.5 rounded-lg bg-red-900/40 text-red-300 hover:bg-red-900/60 transition font-medium">
                Undo Gate ({placedGates.length})
              </button>
            )}

            {/* Add Point Along Line */}
            <div className="flex items-center gap-1.5 ml-2">
              <button
                onClick={() => { setAddPointMode(p => !p); if (!addPointMode) setGatePlaceMode(false); }}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  addPointMode
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'bg-steel-900 text-steel-300 hover:bg-steel-900'
                }`}
              >
                {addPointMode ? '&#x2795; Click Line to Add Point' : '&#x2795; Add Point'}
              </button>
              {addPointMode && (
                <select
                  title="Point type to add"
                  value={addPointType}
                  onChange={e => setAddPointType(e.target.value as FencePointType)}
                  className="bg-steel-900 border border-steel-800 rounded-lg px-2 py-1.5 text-[11px] text-steel-200"
                >
                  {POINT_TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              )}
            </div>
            {addedPoints.length > 0 && (
              <button
                onClick={() => setAddedPoints(prev => prev.slice(0, -1))}
                className="px-3 py-1.5 rounded-lg bg-red-900/40 text-red-300 hover:bg-red-900/60 transition font-medium"
              >
                Undo Point ({addedPoints.length})
              </button>
            )}

            {onMapCapture && (
              <button onClick={captureMap} className="px-3 py-1.5 rounded-lg bg-steel-900 text-steel-300 hover:bg-steel-900 transition font-medium ml-auto">
                &#x1f4f8; Capture for PDF
              </button>
            )}
          </div>
          {/* Legend */}
          <div className="flex gap-3 text-[10px] text-steel-400 flex-wrap items-center">
            {braceMarkers.length > 0 && (
              <>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 border border-white/50"></span> End Post</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-600 border border-white/50"></span> Corner</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-green-600 border border-white/50"></span> H-Brace</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-violet-600 border border-white/50"></span> Kicker</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-cyan-500 border border-white/50"></span> Water Gap</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-0.5 bg-red-500"></span><span className="inline-block w-2.5 h-0.5 bg-red-500 ml-0.5"></span> Steep (&gt;15% grade)</span>
                <span className="text-steel-500 italic">Click markers to change type</span>
              </>
            )}
            {placedGates.length > 0 && (
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded bg-white border border-white/30"></span> Gate ({placedGates.length})</span>
            )}
            {addedPoints.length > 0 && (
              <span className="flex items-center gap-1 text-emerald-400">&#x2795; {addedPoints.length} added point{addedPoints.length > 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default FenceMap;