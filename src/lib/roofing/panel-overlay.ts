import type { RoofPolygon, CutListPanel, EdgeType } from '@/components/roofing/RoofMap';

/**
 * Generate cut-list panel overlay rectangles from map polygons.
 * Each panel strip runs eave-to-ridge, laid side by side across the facet width.
 */
export function generatePanelOverlay(
  polygons: RoofPolygon[],
  panelWidthInches: number = 16,
): CutListPanel[] {
  const panels: CutListPanel[] = [];
  const panelWidthDeg = inchesToLngDeg(panelWidthInches, polygons[0]?.coordinates[0]?.[1] ?? 30);

  for (const poly of polygons) {
    if (poly.coordinates.length < 3) continue;

    // Find eave and ridge edges
    const eaveEdges = poly.edges.filter(e => e.type === 'eave');
    const ridgeEdges = poly.edges.filter(e => e.type === 'ridge');

    if (eaveEdges.length === 0 || ridgeEdges.length === 0) {
      // Fall back: use bottom/top of bounding box
      const lats = poly.coordinates.map(c => c[1]);
      const lngs = poly.coordinates.map(c => c[0]);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const width = maxLng - minLng;
      const numPanels = Math.ceil(width / panelWidthDeg);
      for (let i = 0; i < numPanels; i++) {
        const x0 = minLng + i * panelWidthDeg;
        const x1 = Math.min(x0 + panelWidthDeg, maxLng);
        panels.push({
          facetId: poly.id,
          coords: [[x0, minLat], [x1, minLat], [x1, maxLat], [x0, maxLat]],
        });
      }
      continue;
    }

    // Average eave line: leftmost to rightmost point on eave edges
    const eavePts = eaveEdges.flatMap(e => [e.from, e.to]);
    const ridgePts = ridgeEdges.flatMap(e => [e.from, e.to]);

    // Sort by longitude to get left-to-right sweep
    eavePts.sort((a, b) => a[0] - b[0]);
    ridgePts.sort((a, b) => a[0] - b[0]);

    const eaveLeft = eavePts[0];
    const eaveRight = eavePts[eavePts.length - 1];
    const ridgeLeft = ridgePts[0];
    const ridgeRight = ridgePts[ridgePts.length - 1];

    // Width across the eave in degrees
    const eaveWidth = eaveRight[0] - eaveLeft[0];
    const numPanels = Math.max(1, Math.ceil(eaveWidth / panelWidthDeg));

    for (let i = 0; i < numPanels; i++) {
      const t0 = i / numPanels;
      const t1 = Math.min((i + 1) / numPanels, 1);

      // Interpolate along eave and ridge
      const e0 = lerp2(eaveLeft, eaveRight, t0);
      const e1 = lerp2(eaveLeft, eaveRight, t1);
      const r0 = lerp2(ridgeLeft, ridgeRight, t0);
      const r1 = lerp2(ridgeLeft, ridgeRight, t1);

      panels.push({
        facetId: poly.id,
        coords: [e0, e1, r1, r0], // eave-left, eave-right, ridge-right, ridge-left
      });
    }
  }

  return panels;
}

function lerp2(a: [number, number], b: [number, number], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function inchesToLngDeg(inches: number, lat: number): number {
  const feetPerDegLng = 364320 * Math.cos(lat * Math.PI / 180); // approx feet per degree longitude
  return (inches / 12) / feetPerDegLng;
}