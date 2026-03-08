import {
  RoofModel,
  RoofFacet,
  PanelProfile,
  PanelSpec,
  CutList,
  PanelCut,
  TrimPiece,
  TrimType,
  FastenerRequirement,
  Accessory,
  FacetEdge,
  Point2D,
} from '@/types';
import {
  PANEL_SPECS,
  EDGE_TRIM_MAP,
  TRIM_STANDARD_LENGTH,
  FASTENER_SPECS,
  DEFAULT_WASTE_FACTOR,
} from './panel-specs';

/**
 * Generate a complete cut list for a roof model with a given panel profile.
 */
export function generateCutList(
  roofModel: RoofModel,
  panelProfile: PanelProfile,
  gauge: number = 26,
  wasteFactor?: number
): CutList {
  const spec = PANEL_SPECS[panelProfile];
  const waste = wasteFactor ?? DEFAULT_WASTE_FACTOR[panelProfile];

  const allPanels: PanelCut[] = [];
  const allTrim: TrimPiece[] = [];
  let totalPanelSqFt = 0;

  // Process each facet
  for (const facet of roofModel.facets) {
    // Generate panels for this facet
    const facetPanels = generateFacetPanels(facet, spec, panelProfile);
    allPanels.push(...facetPanels);

    // Calculate panel area for this facet
    for (const panel of facetPanels) {
      totalPanelSqFt += (panel.lengthFeet * panel.widthInches) / 12;
    }

    // Generate trim for each edge
    for (const edge of facet.edgeTypes) {
      const edgeTrim = generateEdgeTrim(edge, facet.id);
      allTrim.push(...edgeTrim);
    }
  }

  // Deduplicate shared trim (ridges, hips shared between facets)
  const deduplicatedTrim = deduplicateTrim(allTrim);

  // Calculate fasteners
  const fasteners = calculateFasteners(totalPanelSqFt, panelProfile);

  // Calculate accessories
  const accessories = calculateAccessories(roofModel, panelProfile);

  const totalWasteSqFt = totalPanelSqFt * waste;

  return {
    id: `cl_${Date.now()}`,
    roofModelId: roofModel.id,
    panelProfile,
    gauge,
    panels: allPanels,
    trim: deduplicatedTrim,
    fasteners,
    accessories,
    wasteFactor: waste,
    totalPanelSqFt,
    totalWasteSqFt,
  };
}

/* ── Geometry helpers ─────────────────────────────────────────── */

/** Rotate point around an origin by angle (radians). */
function rotPt(p: Point2D, o: Point2D, a: number): Point2D {
  const c = Math.cos(a), s = Math.sin(a);
  const dx = p.x - o.x, dy = p.y - o.y;
  return { x: o.x + dx * c - dy * s, y: o.y + dx * s + dy * c };
}

/**
 * For a closed polygon, find all Y-values where a vertical line at X
 * intersects the polygon edges.  Uses a small epsilon nudge so we
 * never land exactly on a vertex.
 */
function polyYsAtX(verts: Point2D[], rawX: number): number[] {
  const EPS = 1e-9;
  const onVtx = verts.some(v => Math.abs(v.x - rawX) < EPS);
  const x = onVtx ? rawX + EPS * 10 : rawX;
  const ys: number[] = [];
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    if (x < lo || x > hi || Math.abs(a.x - b.x) < EPS) continue;
    const t = (x - a.x) / (b.x - a.x);
    if (t >= 0 && t <= 1) ys.push(a.y + t * (b.y - a.y));
  }
  return ys.sort((a, b) => a - b);
}

/**
 * Generate panel cuts for a single roof facet.
 *
 * All panels within a facet are PARALLEL, running perpendicular to the
 * eave edge.  Each panel is clipped to the closed polygon shape of the
 * facet so hip-end / valley facets produce progressively shorter panels.
 */
function generateFacetPanels(
  facet: RoofFacet,
  spec: PanelSpec,
  profile: PanelProfile,
): PanelCut[] {
  const panels: PanelCut[] = [];
  const verts = facet.vertices;
  if (verts.length < 3) return panels;

  const coverW = spec.widthInches / 12;          // coverage width (ft)

  /* ── 1. Determine eave direction so we can align panels ──────── */
  const eaveEdges = facet.edgeTypes.filter(
    e => e.type === 'eave' || e.type === 'drip_edge',
  );

  let eaveAngle = 0;                              // radians
  if (eaveEdges.length > 0) {
    const longest = eaveEdges.reduce((a, b) =>
      a.lengthFeet >= b.lengthFeet ? a : b,
    );
    eaveAngle = Math.atan2(
      longest.end.y - longest.start.y,
      longest.end.x - longest.start.x,
    );
  } else {
    // fallback: polygon edge with lowest average Y (likely eave)
    let bestIdx = 0, bestAvg = Infinity;
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i], b = verts[(i + 1) % verts.length];
      const avg = (a.y + b.y) / 2;
      if (avg < bestAvg) { bestAvg = avg; bestIdx = i; }
    }
    const a = verts[bestIdx], b = verts[(bestIdx + 1) % verts.length];
    eaveAngle = Math.atan2(b.y - a.y, b.x - a.x);
  }

  /* ── 2. Rotate polygon so eave is horizontal ─────────────────── */
  const origin = verts[0];
  const rot = -eaveAngle;
  const rv = verts.map(v => rotPt(v, origin, rot));   // rotated verts

  const rMinX = Math.min(...rv.map(v => v.x));
  const rMaxX = Math.max(...rv.map(v => v.x));
  const facetW = rMaxX - rMinX;
  if (facetW < 0.1) return panels;

  const numPanels = Math.ceil(facetW / coverW);
  const pitchFactor =
    1 / Math.cos((facet.pitchDegrees * Math.PI) / 180);

  /* ── 3. For each panel strip, clip to polygon ────────────────── */
  for (let i = 0; i < numPanels; i++) {
    // sample at the centre of this strip
    const cx = rMinX + (i + 0.5) * coverW;
    if (cx > rMaxX) continue;

    const ys = polyYsAtX(rv, cx);
    if (ys.length < 2) continue;

    const yMin = ys[0];
    const yMax = ys[ys.length - 1];
    const run = yMax - yMin;
    if (run < 0.1) continue;                       // skip tiny slivers

    const len = run * pitchFactor;
    const clamped = Math.min(
      Math.max(len, spec.minLengthFeet),
      spec.maxLengthFeet,
    );
    const rounded = Math.ceil(clamped * 4) / 4;    // nearest ¼ ft up

    // position in rotated space (left-x, bottom-y of panel rect)
    const rPos: Point2D = { x: rMinX + i * coverW, y: yMin };

    // rotate back to original model coordinates
    const oPos = rotPt(rPos, origin, -rot);

    panels.push({
      id: `p_${facet.id}_${i}`,
      facetId: facet.id,
      panelProfile: profile,
      lengthFeet: rounded,
      widthInches: spec.widthInches,
      position: {
        x: oPos.x,
        y: oPos.y,
        rotation: (eaveAngle * 180) / Math.PI + 90,
      },
    });
  }

  return panels;
}

/**
 * Generate trim pieces for an edge.
 */
function generateEdgeTrim(edge: FacetEdge, facetId: string): TrimPiece[] {
  const trimTypes = EDGE_TRIM_MAP[edge.type] || [];
  const pieces: TrimPiece[] = [];

  for (const trimTypeStr of trimTypes) {
    const trimType = trimTypeStr as TrimType;
    const quantity = Math.ceil(edge.lengthFeet / TRIM_STANDARD_LENGTH);

    pieces.push({
      id: `t_${facetId}_${edge.id}_${trimType}`,
      type: trimType,
      lengthFeet: TRIM_STANDARD_LENGTH,
      quantity,
      edgeId: edge.id,
    });
  }

  return pieces;
}

/**
 * Merge duplicate trim pieces (e.g., ridge shared by two facets).
 */
function deduplicateTrim(trim: TrimPiece[]): TrimPiece[] {
  const byEdge = new Map<string, TrimPiece>();
  for (const piece of trim) {
    const key = `${piece.edgeId}_${piece.type}`;
    if (byEdge.has(key)) {
      // Keep the one with higher quantity
      const existing = byEdge.get(key)!;
      if (piece.quantity > existing.quantity) {
        byEdge.set(key, piece);
      }
    } else {
      byEdge.set(key, piece);
    }
  }
  return Array.from(byEdge.values());
}

/**
 * Calculate fastener requirements based on total panel area.
 */
function calculateFasteners(
  totalSqFt: number,
  profile: PanelProfile
): FastenerRequirement[] {
  const spec = FASTENER_SPECS[profile];
  const squares = totalSqFt / 100;
  const quantity = Math.ceil(squares * spec.perSquare * 1.1); // 10% extra

  return [
    {
      type: spec.type,
      size: spec.size,
      quantity,
      perSquare: spec.perSquare,
    },
  ];
}

/**
 * Calculate additional accessories (sealant, tape, etc.).
 */
function calculateAccessories(
  roofModel: RoofModel,
  _profile: PanelProfile
): Accessory[] {
  const totalEdgeFeet = roofModel.facets.reduce((sum, facet) => {
    return sum + facet.edgeTypes.reduce((eSum, edge) => eSum + edge.lengthFeet, 0);
  }, 0);

  const totalSqFt = roofModel.totalAreaSqFt;

  return [
    {
      name: 'Butyl Tape / Sealant Tape',
      quantity: Math.ceil(totalEdgeFeet / 33), // 33ft per roll
      unit: 'rolls',
    },
    {
      name: 'Tube Caulk / Sealant',
      quantity: Math.ceil(totalEdgeFeet / 50), // ~50 linear ft per tube
      unit: 'tubes',
    },
    {
      name: 'Synthetic Underlayment',
      quantity: Math.ceil(totalSqFt / 1000), // 10 sq per roll
      unit: 'rolls (10 sq)',
    },
    {
      name: 'Touch-up Paint',
      quantity: 1,
      unit: 'quart',
    },
  ];
}
