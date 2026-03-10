'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { RoofFacet, Point2D, FacetEdge, EdgeType } from '@/types';

interface Props {
  facets: RoofFacet[];
  onFacetsChange: (facets: RoofFacet[]) => void;
  selectedFacetId: string | null;
  onSelectFacet: (id: string | null) => void;
}

const EDGE_COLORS: Record<EdgeType, string> = {
  ridge: '#ef4444',
  hip: '#f97316',
  valley: '#eab308',
  eave: '#22c55e',
  rake: '#8b5cf6',
  sidewall: '#ec4899',
  headwall: '#14b8a6',
  drip_edge: '#22c55e',
  transition: '#06b6d4',
};

const EDGE_LABELS: Record<EdgeType, string> = {
  ridge: 'Ridge',
  hip: 'Hip',
  valley: 'Valley',
  eave: 'Eave',
  rake: 'Rake',
  sidewall: 'Sidewall',
  headwall: 'Headwall',
  drip_edge: 'Drip Edge',
  transition: 'Transition',
};

type FacetShape = 'rectangle' | 'triangle' | 'trapezoid' | 'parallelogram';

interface FacetTemplate {
  shape: FacetShape;
  label: string;
  icon: string;
}

const FACET_TEMPLATES: FacetTemplate[] = [
  { shape: 'rectangle', label: 'Rectangle', icon: '▬' },
  { shape: 'triangle', label: 'Triangle', icon: '△' },
  { shape: 'trapezoid', label: 'Trapezoid', icon: '⏢' },
  { shape: 'parallelogram', label: 'Parallelogram', icon: '▱' },
];

function createFacetFromShape(
  shape: FacetShape,
  offsetX: number,
  offsetY: number,
  widthFt: number = 20,
  heightFt: number = 15,
  pitch: string = '6/12'
): RoofFacet {
  const id = `facet_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  let vertices: Point2D[];
  let edges: FacetEdge[];

  const pitchNum = parseInt(pitch.split('/')[0]) || 6;
  const pitchDeg = Math.atan(pitchNum / 12) * (180 / Math.PI);

  switch (shape) {
    case 'rectangle':
      vertices = [
        { x: offsetX, y: offsetY },
        { x: offsetX + widthFt, y: offsetY },
        { x: offsetX + widthFt, y: offsetY + heightFt },
        { x: offsetX, y: offsetY + heightFt },
      ];
      edges = [
        makeEdge(id, vertices[0], vertices[1], 'ridge', 0),
        makeEdge(id, vertices[1], vertices[2], 'rake', 1),
        makeEdge(id, vertices[2], vertices[3], 'eave', 2),
        makeEdge(id, vertices[3], vertices[0], 'rake', 3),
      ];
      break;

    case 'triangle':
      vertices = [
        { x: offsetX + widthFt / 2, y: offsetY },
        { x: offsetX + widthFt, y: offsetY + heightFt },
        { x: offsetX, y: offsetY + heightFt },
      ];
      edges = [
        makeEdge(id, vertices[0], vertices[1], 'hip', 0),
        makeEdge(id, vertices[1], vertices[2], 'eave', 1),
        makeEdge(id, vertices[2], vertices[0], 'hip', 2),
      ];
      break;

    case 'trapezoid':
      const inset = widthFt * 0.2;
      vertices = [
        { x: offsetX + inset, y: offsetY },
        { x: offsetX + widthFt - inset, y: offsetY },
        { x: offsetX + widthFt, y: offsetY + heightFt },
        { x: offsetX, y: offsetY + heightFt },
      ];
      edges = [
        makeEdge(id, vertices[0], vertices[1], 'ridge', 0),
        makeEdge(id, vertices[1], vertices[2], 'hip', 1),
        makeEdge(id, vertices[2], vertices[3], 'eave', 2),
        makeEdge(id, vertices[3], vertices[0], 'hip', 3),
      ];
      break;

    case 'parallelogram':
      const skew = widthFt * 0.15;
      vertices = [
        { x: offsetX + skew, y: offsetY },
        { x: offsetX + widthFt + skew, y: offsetY },
        { x: offsetX + widthFt, y: offsetY + heightFt },
        { x: offsetX, y: offsetY + heightFt },
      ];
      edges = [
        makeEdge(id, vertices[0], vertices[1], 'ridge', 0),
        makeEdge(id, vertices[1], vertices[2], 'rake', 1),
        makeEdge(id, vertices[2], vertices[3], 'eave', 2),
        makeEdge(id, vertices[3], vertices[0], 'rake', 3),
      ];
      break;
  }

  const area = calculatePolygonArea(vertices);

  return {
    id,
    label: `Facet ${id.slice(-4).toUpperCase()}`,
    vertices,
    pitchRatio: pitch,
    pitchDegrees: pitchDeg,
    areaSquareFeet: Math.round(area),
    slopeAreaSquareFeet: Math.round(area / Math.cos(pitchDeg * Math.PI / 180)),
    edgeTypes: edges,
  };
}

function makeEdge(facetId: string, start: Point2D, end: Point2D, type: EdgeType, index: number): FacetEdge {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  return {
    id: `e_${facetId}_${index}`,
    start: { ...start },
    end: { ...end },
    lengthFeet: Math.round(len * 10) / 10,
    type,
  };
}

function calculatePolygonArea(vertices: Point2D[]): number {
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return Math.abs(area) / 2;
}

function recalcFacet(facet: RoofFacet): RoofFacet {
  const area = calculatePolygonArea(facet.vertices);
  const pitchNum = parseInt(facet.pitchRatio.split('/')[0]) || 6;
  const pitchDeg = Math.atan(pitchNum / 12) * (180 / Math.PI);
  const edges = facet.edgeTypes.map((edge, i) => {
    const v1 = facet.vertices[i % facet.vertices.length];
    const v2 = facet.vertices[(i + 1) % facet.vertices.length];
    if (!v1 || !v2) return edge;
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    return {
      ...edge,
      start: { ...v1 },
      end: { ...v2 },
      lengthFeet: Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10,
    };
  });
  return {
    ...facet,
    pitchDegrees: pitchDeg,
    areaSquareFeet: Math.round(area),
    slopeAreaSquareFeet: Math.round(area / Math.cos(pitchDeg * Math.PI / 180)),
    edgeTypes: edges,
  };
}

export default function RoofSketchBuilder({ facets, onFacetsChange, selectedFacetId, onSelectFacet }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragInfo, setDragInfo] = useState<{
    facetId: string;
    vertexIndex: number | null; // null = dragging entire facet
    startMouse: Point2D;
    startPositions: Point2D[];
  } | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{ facetId: string; edgeIndex: number } | null>(null);

  // Drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = containerRef.current;
    if (!container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;

    // Clear
    ctx.fillStyle = '#0e111b';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(148,163,184,0.06)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += 20) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    if (facets.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Add a facet shape below to start building your roof sketch', W / 2, H / 2);
      return;
    }

    // Calculate transform
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const f of facets) {
      for (const v of f.vertices) {
        minX = Math.min(minX, v.x); minY = Math.min(minY, v.y);
        maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y);
      }
    }
    const pad = 60;
    const mW = maxX - minX || 1;
    const mH = maxY - minY || 1;
    const sc = Math.min((W - pad * 2) / mW, (H - pad * 2) / mH);
    const oX = pad + (W - pad * 2 - mW * sc) / 2;
    const oY = pad + (H - pad * 2 - mH * sc) / 2;
    const toS = (x: number, y: number): [number, number] => [(x - minX) * sc + oX, (y - minY) * sc + oY];

    // Draw facets
    for (const facet of facets) {
      const isSelected = facet.id === selectedFacetId;

      // Fill
      ctx.beginPath();
      const [sx, sy] = toS(facet.vertices[0].x, facet.vertices[0].y);
      ctx.moveTo(sx, sy);
      for (let i = 1; i < facet.vertices.length; i++) {
        const [fx, fy] = toS(facet.vertices[i].x, facet.vertices[i].y);
        ctx.lineTo(fx, fy);
      }
      ctx.closePath();
      ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.2)' : 'rgba(245, 158, 11, 0.1)';
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#3b82f6' : '#f59e0b';
      ctx.lineWidth = isSelected ? 3 : 1.5;
      ctx.stroke();

      // Edges with color coding
      for (let ei = 0; ei < facet.edgeTypes.length; ei++) {
        const edge = facet.edgeTypes[ei];
        const [ex1, ey1] = toS(edge.start.x, edge.start.y);
        const [ex2, ey2] = toS(edge.end.x, edge.end.y);
        const isHovered = hoveredEdge?.facetId === facet.id && hoveredEdge.edgeIndex === ei;

        ctx.beginPath();
        ctx.moveTo(ex1, ey1);
        ctx.lineTo(ex2, ey2);
        ctx.strokeStyle = EDGE_COLORS[edge.type] || '#0284c7';
        ctx.lineWidth = isHovered ? 5 : (edge.type === 'ridge' || edge.type === 'hip' ? 3 : 2);
        ctx.stroke();

        // Edge length label
        const mx = (ex1 + ex2) / 2;
        const my = (ey1 + ey2) / 2;
        ctx.fillStyle = 'rgba(14,17,27,0.85)';
        const label = `${edge.lengthFeet}'`;
        const tw = ctx.measureText(label).width + 6;
        ctx.fillRect(mx - tw / 2, my - 8, tw, 16);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 10px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, mx, my);
      }

      // Vertex handles
      for (let vi = 0; vi < facet.vertices.length; vi++) {
        const [vx, vy] = toS(facet.vertices[vi].x, facet.vertices[vi].y);
        ctx.beginPath();
        ctx.arc(vx, vy, isSelected ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#2563eb' : '#0284c7';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Center label
      const cx = facet.vertices.reduce((s, v) => s + v.x, 0) / facet.vertices.length;
      const cy = facet.vertices.reduce((s, v) => s + v.y, 0) / facet.vertices.length;
      const [lcx, lcy] = toS(cx, cy);
      ctx.fillStyle = '#f1f5f9';
      ctx.font = 'bold 12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(facet.label, lcx, lcy - 12);
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`${facet.areaSquareFeet} sf • ${facet.pitchRatio}`, lcx, lcy + 4);
    }

    // Legend
    const legendItems: [string, string][] = [
      ['Ridge', EDGE_COLORS.ridge],
      ['Hip', EDGE_COLORS.hip],
      ['Valley', EDGE_COLORS.valley],
      ['Eave', EDGE_COLORS.eave],
      ['Rake', EDGE_COLORS.rake],
    ];
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    legendItems.forEach(([name, color], i) => {
      const ly = 20 + i * 18;
      ctx.fillStyle = color;
      ctx.fillRect(W - 70, ly - 2, 14, 4);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(name, W - 10, ly);
    });

  }, [facets, selectedFacetId, hoveredEdge, dragInfo]);

  // Mouse interaction
  const getTransform = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || facets.length === 0) return null;

    const rect = container.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const f of facets) {
      for (const v of f.vertices) {
        minX = Math.min(minX, v.x); minY = Math.min(minY, v.y);
        maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y);
      }
    }
    const pad = 60;
    const mW = maxX - minX || 1;
    const mH = maxY - minY || 1;
    const sc = Math.min((W - pad * 2) / mW, (H - pad * 2) / mH);
    const oX = pad + (W - pad * 2 - mW * sc) / 2;
    const oY = pad + (H - pad * 2 - mH * sc) / 2;

    return { minX, minY, sc, oX, oY, rect };
  }, [facets]);

  const screenToWorld = useCallback((sx: number, sy: number): Point2D | null => {
    const t = getTransform();
    if (!t) return null;
    return {
      x: (sx - t.oX) / t.sc + t.minX,
      y: (sy - t.oY) / t.sc + t.minY,
    };
  }, [getTransform]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const t = getTransform();
    if (!t) return;

    const mx = e.clientX - t.rect.left;
    const my = e.clientY - t.rect.top;

    // Check vertices first (for dragging)
    for (const facet of facets) {
      for (let vi = 0; vi < facet.vertices.length; vi++) {
        const vx = (facet.vertices[vi].x - t.minX) * t.sc + t.oX;
        const vy = (facet.vertices[vi].y - t.minY) * t.sc + t.oY;
        const dist = Math.sqrt((mx - vx) ** 2 + (my - vy) ** 2);
        if (dist < 10) {
          onSelectFacet(facet.id);
          setDragInfo({
            facetId: facet.id,
            vertexIndex: vi,
            startMouse: { x: mx, y: my },
            startPositions: facet.vertices.map(v => ({ ...v })),
          });
          return;
        }
      }
    }

    // Check if clicking inside a facet
    const wp = screenToWorld(mx, my);
    if (wp) {
      for (const facet of facets) {
        if (pointInPolygon(wp, facet.vertices)) {
          onSelectFacet(facet.id);
          setDragInfo({
            facetId: facet.id,
            vertexIndex: null,
            startMouse: { x: mx, y: my },
            startPositions: facet.vertices.map(v => ({ ...v })),
          });
          return;
        }
      }
    }

    onSelectFacet(null);
  }, [facets, getTransform, screenToWorld, onSelectFacet]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const t = getTransform();
    if (!t) return;

    const mx = e.clientX - t.rect.left;
    const my = e.clientY - t.rect.top;

    if (dragInfo) {
      const dx = (mx - dragInfo.startMouse.x) / t.sc;
      const dy = (my - dragInfo.startMouse.y) / t.sc;

      const updated = facets.map(f => {
        if (f.id !== dragInfo.facetId) return f;

        const newVerts = f.vertices.map((v, vi) => {
          if (dragInfo.vertexIndex === null) {
            // Move entire facet
            return {
              x: dragInfo.startPositions[vi].x + dx,
              y: dragInfo.startPositions[vi].y + dy,
            };
          } else if (vi === dragInfo.vertexIndex) {
            // Move single vertex
            return {
              x: dragInfo.startPositions[vi].x + dx,
              y: dragInfo.startPositions[vi].y + dy,
            };
          }
          return v;
        });

        return recalcFacet({ ...f, vertices: newVerts });
      });

      onFacetsChange(updated);
    }
  }, [dragInfo, facets, getTransform, onFacetsChange]);

  const handleMouseUp = useCallback(() => {
    setDragInfo(null);
  }, []);

  const addFacet = useCallback((shape: FacetShape) => {
    // Place new facet to the right of existing ones
    let maxX = 0;
    for (const f of facets) {
      for (const v of f.vertices) {
        maxX = Math.max(maxX, v.x);
      }
    }
    const newFacet = createFacetFromShape(shape, maxX + 5, 0);
    onFacetsChange([...facets, newFacet]);
    onSelectFacet(newFacet.id);
  }, [facets, onFacetsChange, onSelectFacet]);

  const deleteFacet = useCallback((id: string) => {
    onFacetsChange(facets.filter(f => f.id !== id));
    if (selectedFacetId === id) onSelectFacet(null);
  }, [facets, selectedFacetId, onFacetsChange, onSelectFacet]);

  const updateFacetProp = useCallback((id: string, key: string, value: string) => {
    onFacetsChange(facets.map(f => {
      if (f.id !== id) return f;
      if (key === 'label') return { ...f, label: value };
      if (key === 'pitch') return recalcFacet({ ...f, pitchRatio: value });
      return f;
    }));
  }, [facets, onFacetsChange]);

  const updateEdgeType = useCallback((facetId: string, edgeIndex: number, newType: EdgeType) => {
    onFacetsChange(facets.map(f => {
      if (f.id !== facetId) return f;
      const newEdges = [...f.edgeTypes];
      newEdges[edgeIndex] = { ...newEdges[edgeIndex], type: newType };
      return { ...f, edgeTypes: newEdges };
    }));
  }, [facets, onFacetsChange]);

  const selectedFacet = facets.find(f => f.id === selectedFacetId);

  return (
    <div className="space-y-4">
      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative bg-steel-900 rounded-lg border border-steel-800 overflow-hidden"
        style={{ height: '450px' }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      {/* Add Facet Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-steel-400">Add facet:</span>
        {FACET_TEMPLATES.map(t => (
          <button
            key={t.shape}
            onClick={() => addFacet(t.shape)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-tan-400/10 text-tan-300 rounded-lg text-sm font-medium hover:bg-white/20 transition border border-white/[0.06]"
          >
            <span className="text-base">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Selected Facet Editor */}
      {selectedFacet && (
        <div className="bg-steel-900 rounded-lg border border-steel-800 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-steel-200 text-sm">Edit Facet</h3>
            <button
              onClick={() => deleteFacet(selectedFacet.id)}
              className="text-xs text-red-400 hover:text-red-300 font-medium"
            >
              Delete Facet
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-steel-400 mb-1">Label</label>
              <input
                type="text"
                value={selectedFacet.label}
                onChange={e => updateFacetProp(selectedFacet.id, 'label', e.target.value)}
                className="w-full bg-steel-900 border border-steel-800 rounded px-2 py-1 text-sm text-steel-200 focus:border-white/20 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-steel-400 mb-1">Pitch</label>
              <select
                value={selectedFacet.pitchRatio}
                onChange={e => updateFacetProp(selectedFacet.id, 'pitch', e.target.value)}
                className="w-full bg-steel-900 border border-steel-800 rounded px-2 py-1 text-sm text-steel-200 focus:border-white/20 focus:outline-none"
              >
                {['2/12','3/12','4/12','5/12','6/12','7/12','8/12','9/12','10/12','12/12','14/12'].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-xs text-steel-400">
            Area: <strong className="text-steel-200">{selectedFacet.areaSquareFeet} sf</strong> • 
            Slope Area: <strong className="text-steel-200">{selectedFacet.slopeAreaSquareFeet} sf</strong> •
            Drag vertices to resize, drag body to move
          </div>

          {/* Edge Types */}
          <div>
            <label className="block text-xs text-steel-400 mb-2">Edge Types (click to change)</label>
            <div className="space-y-1.5">
              {selectedFacet.edgeTypes.map((edge, ei) => (
                <div key={edge.id} className="flex items-center gap-2">
                  <div
                    className="w-4 h-1 rounded-full"
                    style={{ backgroundColor: EDGE_COLORS[edge.type] }}
                  />
                  <select
                    value={edge.type}
                    onChange={e => updateEdgeType(selectedFacet.id, ei, e.target.value as EdgeType)}
                    className="flex-1 bg-steel-900 border border-steel-800 rounded px-2 py-1 text-xs text-steel-200 focus:border-white/20 focus:outline-none"
                    onMouseEnter={() => setHoveredEdge({ facetId: selectedFacet.id, edgeIndex: ei })}
                    onMouseLeave={() => setHoveredEdge(null)}
                  >
                    {Object.entries(EDGE_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                  <span className="text-xs text-steel-400 w-12 text-right">{edge.lengthFeet}&apos;</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function pointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (
      ((yi > point.y) !== (yj > point.y)) &&
      (point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi)
    ) {
      inside = !inside;
    }
  }
  return inside;
}
