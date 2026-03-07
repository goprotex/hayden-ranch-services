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

/**
 * Generate panel cuts for a single roof facet.
 * Panels run from eave edge toward ridge edge.
 */
function generateFacetPanels(
  facet: RoofFacet,
  spec: PanelSpec,
  profile: PanelProfile
): PanelCut[] {
  const panels: PanelCut[] = [];
  const coverageWidthFeet = spec.widthInches / 12;

  // Find eave and ridge edges to determine panel run direction
  const eaveEdges = facet.edgeTypes.filter(e => e.type === 'eave');
  const ridgeEdges = facet.edgeTypes.filter(e => e.type === 'ridge');

  // Calculate bounding box
  const minX = Math.min(...facet.vertices.map(v => v.x));
  const maxX = Math.max(...facet.vertices.map(v => v.x));
  const minY = Math.min(...facet.vertices.map(v => v.y));
  const maxY = Math.max(...facet.vertices.map(v => v.y));

  // Determine eave and ridge Y positions
  let eaveY = minY;
  let ridgeY = maxY;
  if (eaveEdges.length > 0) {
    eaveY = eaveEdges.reduce((s, e) => s + (e.start.y + e.end.y) / 2, 0) / eaveEdges.length;
  }
  if (ridgeEdges.length > 0) {
    ridgeY = ridgeEdges.reduce((s, e) => s + (e.start.y + e.end.y) / 2, 0) / ridgeEdges.length;
  }

  // Panel length = eave-to-ridge distance, accounting for pitch
  const eaveToRidgeFeet = Math.abs(ridgeY - eaveY);
  const pitchFactor = 1 / Math.cos((facet.pitchDegrees * Math.PI) / 180);
  const panelLength = eaveToRidgeFeet * pitchFactor;

  // Lay panels side by side across the facet width (perpendicular to eave)
  const facetWidthFeet = maxX - minX;
  const numPanels = Math.ceil(facetWidthFeet / coverageWidthFeet);

  for (let i = 0; i < numPanels; i++) {
    const xPos = minX + i * coverageWidthFeet;
    const clampedLength = Math.min(
      Math.max(panelLength, spec.minLengthFeet),
      spec.maxLengthFeet
    );
    panels.push({
      id: 'p_' + facet.id + '_' + i,
      facetId: facet.id,
      panelProfile: profile,
      lengthFeet: Math.ceil(clampedLength * 4) / 4,
      widthInches: spec.widthInches,
      position: {
        x: xPos,
        y: Math.min(eaveY, ridgeY),
        rotation: 0,
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
