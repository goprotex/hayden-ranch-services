'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { RoofModel, RoofFacet, FacetEdge, EdgeType, CutList } from '@/types';
import { PANEL_SPECS } from '@/lib/roofing/panel-specs';

// ────────────────────────────────────────────────────────────────
// Color palette
// ────────────────────────────────────────────────────────────────

const FACET_FILLS = [
  'rgba(59,130,246,0.18)',   // blue
  'rgba(168,85,247,0.18)',   // purple
  'rgba(34,197,94,0.18)',    // green
  'rgba(245,158,11,0.18)',   // amber
  'rgba(239,68,68,0.18)',    // red
  'rgba(20,184,166,0.18)',   // teal
  'rgba(236,72,153,0.18)',   // pink
  'rgba(99,102,241,0.18)',   // indigo
];

const FACET_STROKES = [
  '#3b82f6', '#a855f7', '#22c55e', '#f59e0b',
  '#ef4444', '#14b8a6', '#ec4899', '#6366f1',
];

const EDGE_COLORS: Record<EdgeType, string> = {
  ridge:      '#ef4444',
  hip:        '#f97316',
  valley:     '#eab308',
  eave:       '#22c55e',
  rake:       '#8b5cf6',
  sidewall:   '#ec4899',
  headwall:   '#14b8a6',
  drip_edge:  '#22c55e',
  transition: '#06b6d4',
};

const EDGE_LABELS: Record<EdgeType, string> = {
  ridge:      'Ridge',
  hip:        'Hip',
  valley:     'Valley',
  eave:       'Eave',
  rake:       'Rake',
  sidewall:   'Sidewall',
  headwall:   'Headwall',
  drip_edge:  'Drip Edge',
  transition: 'Transition',
};

const EDGE_WIDTHS: Record<EdgeType, number> = {
  ridge: 3, hip: 2.5, valley: 2.5, eave: 2, rake: 2,
  sidewall: 1.5, headwall: 1.5, drip_edge: 1.5, transition: 1.5,
};

const EDGE_DASHES: Partial<Record<EdgeType, string>> = {
  sidewall: '6,3',
  headwall: '6,3',
  transition: '4,4',
};

// ────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────

interface RoofViewerProps {
  model: RoofModel;
  cutList?: CutList | null;
  /** Show raw XML text in a collapsible panel */
  xmlSource?: string;
}

// ────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────

export default function RoofXmlViewer({ model, cutList, xmlSource }: RoofViewerProps) {
  const [hoveredFacet, setHoveredFacet] = useState<string | null>(null);
  const [selectedFacet, setSelectedFacet] = useState<string | null>(null);
  const [showPanels, setShowPanels] = useState(true);
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [showXmlSource, setShowXmlSource] = useState(false);
  const [viewTab, setViewTab] = useState<'sketch' | 'data' | 'xml'>('sketch');

  const svgRef = useRef<SVGSVGElement>(null);

  // ── Bounding box ────────────────────────────────────────────
  const bbox = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const f of model.facets) {
      for (const v of f.vertices) {
        minX = Math.min(minX, v.x);
        minY = Math.min(minY, v.y);
        maxX = Math.max(maxX, v.x);
        maxY = Math.max(maxY, v.y);
      }
      for (const e of f.edgeTypes) {
        minX = Math.min(minX, e.start.x, e.end.x);
        minY = Math.min(minY, e.start.y, e.end.y);
        maxX = Math.max(maxX, e.start.x, e.end.x);
        maxY = Math.max(maxY, e.start.y, e.end.y);
      }
    }
    const pad = Math.max(maxX - minX, maxY - minY) * 0.08 + 5;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }, [model]);

  const viewBox = `${bbox.minX} ${bbox.minY} ${bbox.maxX - bbox.minX} ${bbox.maxY - bbox.minY}`;
  const viewW = bbox.maxX - bbox.minX;

  // scale for text sizing (approx)
  const textScale = Math.max(viewW / 600, 0.5);

  // ── Facet summary stats ─────────────────────────────────────
  const stats = useMemo(() => {
    const totalArea = model.facets.reduce((s, f) => s + f.areaSquareFeet, 0);
    const edgeTotals: Partial<Record<EdgeType, number>> = {};
    for (const f of model.facets) {
      for (const e of f.edgeTypes) {
        edgeTotals[e.type] = (edgeTotals[e.type] || 0) + e.lengthFeet;
      }
    }
    return { totalArea, edgeTotals };
  }, [model]);

  // ── Edge midpoint for label placement ───────────────────────
  const edgeMid = (e: FacetEdge) => ({
    x: (e.start.x + e.end.x) / 2,
    y: (e.start.y + e.end.y) / 2,
  });

  // ── Facet centroid ──────────────────────────────────────────
  const centroid = (f: RoofFacet) => {
    const n = f.vertices.length || 1;
    return {
      x: f.vertices.reduce((s, v) => s + v.x, 0) / n,
      y: f.vertices.reduce((s, v) => s + v.y, 0) / n,
    };
  };

  // ── Panels for overlay ─────────────────────────────────────
  const panelRects = useMemo(() => {
    if (!cutList || !showPanels) return [];
    const spec = PANEL_SPECS[cutList.panelProfile];
    return cutList.panels.map(p => {
      const w = spec.widthInches / 12;
      return { id: p.id, x: p.position.x, y: p.position.y, w, h: p.lengthFeet, rot: p.position.rotation };
    });
  }, [cutList, showPanels]);

  return (
    <div className="space-y-4">
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <TabBtn active={viewTab === 'sketch'} onClick={() => setViewTab('sketch')}>🏠 Roof Sketch</TabBtn>
        <TabBtn active={viewTab === 'data'} onClick={() => setViewTab('data')}>📊 Facet Data</TabBtn>
        {xmlSource && <TabBtn active={viewTab === 'xml'} onClick={() => setViewTab('xml')}>📄 XML Source</TabBtn>}

        {viewTab === 'sketch' && (
          <>
            <span className="mx-2 w-px h-5 bg-steel-700" />
            <label className="flex items-center gap-1.5 text-xs text-steel-400 cursor-pointer select-none">
              <input type="checkbox" checked={showEdgeLabels} onChange={e => setShowEdgeLabels(e.target.checked)} className="accent-tan-400 w-3.5 h-3.5" />
              Edge labels
            </label>
            {cutList && (
              <label className="flex items-center gap-1.5 text-xs text-steel-400 cursor-pointer select-none">
                <input type="checkbox" checked={showPanels} onChange={e => setShowPanels(e.target.checked)} className="accent-tan-400 w-3.5 h-3.5" />
                Panel overlay
              </label>
            )}
          </>
        )}
      </div>

      {/* ── Summary banner ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Facets" value={String(model.facets.length)} />
        <StatCard label="Total Area" value={`${Math.round(stats.totalArea).toLocaleString()} sf`} />
        <StatCard label="Source" value={model.source.replace(/_/g, ' ').toUpperCase()} />
        <StatCard label="Edges" value={String(model.facets.reduce((s, f) => s + f.edgeTypes.length, 0))} />
      </div>

      {/* ── Tab content ────────────────────────────────────── */}
      {viewTab === 'sketch' && (
        <div className="card-dark overflow-hidden">
          <svg
            ref={svgRef}
            viewBox={viewBox}
            className="w-full bg-black rounded-xl"
            style={{ height: 520 }}
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Grid dots */}
            <defs>
              <pattern id="gridDots" width={viewW / 30} height={viewW / 30} patternUnits="userSpaceOnUse">
                <circle cx={viewW / 60} cy={viewW / 60} r={viewW / 500} fill="rgba(148,163,184,0.12)" />
              </pattern>
            </defs>
            <rect x={bbox.minX} y={bbox.minY} width={bbox.maxX - bbox.minX} height={bbox.maxY - bbox.minY} fill="url(#gridDots)" />

            {/* Facets */}
            {model.facets.map((f, idx) => {
              const pts = f.vertices.map(v => `${v.x},${v.y}`).join(' ');
              const isHovered = hoveredFacet === f.id;
              const isSelected = selectedFacet === f.id;
              const c = centroid(f);

              return (
                <g key={f.id}
                  onMouseEnter={() => setHoveredFacet(f.id)}
                  onMouseLeave={() => setHoveredFacet(null)}
                  onClick={() => setSelectedFacet(selectedFacet === f.id ? null : f.id)}
                  className="cursor-pointer"
                >
                  {/* Fill */}
                  <polygon
                    points={pts}
                    fill={isHovered || isSelected ? FACET_FILLS[idx % FACET_FILLS.length].replace('0.18', '0.35') : FACET_FILLS[idx % FACET_FILLS.length]}
                    stroke={FACET_STROKES[idx % FACET_STROKES.length]}
                    strokeWidth={isSelected ? 2.5 * textScale : 1.5 * textScale}
                  />

                  {/* Edges (drawn individually for color-coding) */}
                  {f.edgeTypes.map((edge) => {
                    const mid = edgeMid(edge);
                    return (
                      <g key={edge.id}>
                        <line
                          x1={edge.start.x} y1={edge.start.y}
                          x2={edge.end.x} y2={edge.end.y}
                          stroke={EDGE_COLORS[edge.type]}
                          strokeWidth={(EDGE_WIDTHS[edge.type] || 1.5) * textScale}
                          strokeDasharray={EDGE_DASHES[edge.type] ? EDGE_DASHES[edge.type]!.split(',').map(n => String(Number(n) * textScale)).join(',') : undefined}
                          strokeLinecap="round"
                        />
                        {showEdgeLabels && edge.lengthFeet >= 2 && (
                          <text
                            x={mid.x} y={mid.y - 1.2 * textScale}
                            textAnchor="middle"
                            fill={EDGE_COLORS[edge.type]}
                            fontSize={3 * textScale}
                            fontWeight="600"
                            style={{ userSelect: 'none' }}
                          >
                            {EDGE_LABELS[edge.type]} {edge.lengthFeet.toFixed(1)}ft
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Facet label */}
                  <text x={c.x} y={c.y - 2.2 * textScale} textAnchor="middle"
                    fill="#e2e8f0" fontSize={4.5 * textScale} fontWeight="700"
                    style={{ userSelect: 'none' }}>
                    {f.label}
                  </text>
                  <text x={c.x} y={c.y + 2.5 * textScale} textAnchor="middle"
                    fill="#94a3b8" fontSize={3 * textScale}
                    style={{ userSelect: 'none' }}>
                    {Math.round(f.areaSquareFeet)} sf • {f.pitchRatio}
                  </text>
                </g>
              );
            })}

            {/* Panel overlay */}
            {panelRects.map(p => (
              <rect key={p.id}
                x={p.x} y={p.y} width={p.w} height={p.h}
                fill="rgba(99,102,241,0.06)"
                stroke="rgba(99,102,241,0.3)"
                strokeWidth={0.3 * textScale}
                transform={`rotate(${p.rot} ${p.x + p.w / 2} ${p.y + p.h / 2})`}
              />
            ))}
          </svg>

          {/* Edge type legend */}
          <div className="px-4 py-3 border-t border-steel-800 flex flex-wrap gap-x-4 gap-y-1">
            {(Object.entries(EDGE_COLORS) as [EdgeType, string][]).filter(([type]) =>
              model.facets.some(f => f.edgeTypes.some(e => e.type === type))
            ).map(([type, color]) => (
              <span key={type} className="flex items-center gap-1.5 text-xs text-steel-400">
                <span className="w-4 h-0.5 rounded-full inline-block" style={{ backgroundColor: color }} />
                {EDGE_LABELS[type]} <span className="text-steel-500">({Math.round(stats.edgeTotals[type] || 0)}ft)</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {viewTab === 'data' && (
        <div className="card-dark overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-black text-steel-400 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3">Facet</th>
                  <th className="px-4 py-3 text-right">Area (sf)</th>
                  <th className="px-4 py-3 text-right">Slope Area (sf)</th>
                  <th className="px-4 py-3 text-center">Pitch</th>
                  <th className="px-4 py-3 text-right">Vertices</th>
                  <th className="px-4 py-3 text-right">Edges</th>
                  <th className="px-4 py-3">Edge Breakdown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-700/20">
                {model.facets.map((f, idx) => (
                  <tr key={f.id}
                    className={`hover:bg-steel-900/50 cursor-pointer transition ${selectedFacet === f.id ? 'bg-white/10' : ''}`}
                    onClick={() => { setSelectedFacet(selectedFacet === f.id ? null : f.id); setViewTab('sketch'); }}
                  >
                    <td className="px-4 py-3 font-medium text-steel-200 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: FACET_STROKES[idx % FACET_STROKES.length] }} />
                      {f.label}
                    </td>
                    <td className="px-4 py-3 text-right text-steel-300 tabular-nums">{Math.round(f.areaSquareFeet).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-steel-300 tabular-nums">{Math.round(f.slopeAreaSquareFeet).toLocaleString()}</td>
                    <td className="px-4 py-3 text-center text-steel-300">{f.pitchRatio}</td>
                    <td className="px-4 py-3 text-right text-steel-400">{f.vertices.length}</td>
                    <td className="px-4 py-3 text-right text-steel-400">{f.edgeTypes.length}</td>
                    <td className="px-4 py-3 text-steel-500 text-xs">
                      {Object.entries(
                        f.edgeTypes.reduce<Record<string, number>>((acc, e) => {
                          acc[e.type] = (acc[e.type] || 0) + e.lengthFeet;
                          return acc;
                        }, {}),
                      ).map(([type, len]) => (
                        <span key={type} className="mr-2 whitespace-nowrap">
                          <span className="inline-block w-2 h-2 rounded-full mr-0.5" style={{ backgroundColor: EDGE_COLORS[type as EdgeType] }} />
                          {EDGE_LABELS[type as EdgeType]} {Math.round(len as number)}ft
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-steel-900/50 font-semibold text-steel-300 text-xs">
                <tr>
                  <td className="px-4 py-3">TOTAL ({model.facets.length} facets)</td>
                  <td className="px-4 py-3 text-right tabular-nums">{Math.round(stats.totalArea).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{Math.round(model.facets.reduce((s, f) => s + f.slopeAreaSquareFeet, 0)).toLocaleString()}</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right">{model.facets.reduce((s, f) => s + f.vertices.length, 0)}</td>
                  <td className="px-4 py-3 text-right">{model.facets.reduce((s, f) => s + f.edgeTypes.length, 0)}</td>
                  <td className="px-4 py-3 text-xs">
                    {Object.entries(stats.edgeTotals).map(([type, len]) => (
                      <span key={type} className="mr-2 whitespace-nowrap">
                        <span className="inline-block w-2 h-2 rounded-full mr-0.5" style={{ backgroundColor: EDGE_COLORS[type as EdgeType] }} />
                        {Math.round(len as number)}ft
                      </span>
                    ))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {viewTab === 'xml' && xmlSource && (
        <div className="card-dark overflow-hidden">
          <div className="px-4 py-3 border-b border-steel-800 flex items-center justify-between">
            <span className="text-sm font-medium text-steel-300">XML Source ({xmlSource.length.toLocaleString()} chars)</span>
            <button onClick={() => { navigator.clipboard.writeText(xmlSource); }}
              className="text-xs bg-steel-700/30 text-steel-300 px-3 py-1 rounded-lg hover:bg-steel-700/50 transition">
              Copy
            </button>
          </div>
          <pre className="p-4 text-xs text-steel-400 font-mono overflow-auto max-h-[500px] whitespace-pre-wrap break-all leading-relaxed">
            {xmlSource}
          </pre>
        </div>
      )}

      {/* Selected facet detail panel */}
      {selectedFacet && (() => {
        const f = model.facets.find(x => x.id === selectedFacet);
        if (!f) return null;
        return (
          <div className="card-dark p-4 border-l-4 border-white/20 animate-fade-in-up">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-steel-200 font-semibold">{f.label}</h3>
              <button onClick={() => setSelectedFacet(null)} className="text-xs text-steel-500 hover:text-steel-300">✕ Close</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><p className="text-[10px] text-steel-500 uppercase">Area</p><p className="font-bold text-steel-200">{Math.round(f.areaSquareFeet)} sf</p></div>
              <div><p className="text-[10px] text-steel-500 uppercase">Slope Area</p><p className="font-bold text-steel-200">{Math.round(f.slopeAreaSquareFeet)} sf</p></div>
              <div><p className="text-[10px] text-steel-500 uppercase">Pitch</p><p className="font-bold text-steel-200">{f.pitchRatio} ({f.pitchDegrees.toFixed(1)}°)</p></div>
              <div><p className="text-[10px] text-steel-500 uppercase">Vertices</p><p className="font-bold text-steel-200">{f.vertices.length}</p></div>
            </div>
            <div className="mt-3">
              <p className="text-[10px] text-steel-500 uppercase mb-1">Edges</p>
              <div className="flex flex-wrap gap-2">
                {f.edgeTypes.map(e => (
                  <span key={e.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-black text-steel-300">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: EDGE_COLORS[e.type] }} />
                    {EDGE_LABELS[e.type]} — {e.lengthFeet.toFixed(1)}ft
                  </span>
                ))}
              </div>
            </div>
            {f.vertices.length >= 3 && (
              <div className="mt-3">
                <p className="text-[10px] text-steel-500 uppercase mb-1">Vertex Coordinates</p>
                <div className="flex flex-wrap gap-2">
                  {f.vertices.map((v, i) => (
                    <span key={i} className="text-xs text-steel-500 font-mono bg-black px-2 py-0.5 rounded">
                      ({v.x.toFixed(1)}, {v.y.toFixed(1)})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${active ? 'bg-tan-400/10 text-tan-300 ring-1 ring-tan-400/30' : 'bg-black text-steel-400 hover:text-steel-300 hover:bg-steel-900'}`}>
      {children}
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-black rounded-xl px-4 py-3">
      <p className="text-[10px] text-steel-500 uppercase tracking-wider">{label}</p>
      <p className="text-lg font-bold text-steel-200 mt-0.5">{value}</p>
    </div>
  );
}