/**
 * XML Roof Report Parser
 *
 * Parses industry-standard XML roof measurement exports from:
 * - GAF QuickMeasure
 * - EagleView
 * - Roofr
 * - Generic roof-sketch XML (faces / facets with polygon lines & 3-D vertices)
 *
 * The parser converts 3-D vertices (x, y, z) into our flat 2-D model by
 * projecting onto the XY plane (top-down view) while preserving the slope
 * information derived from Z coordinates.
 */

import {
  RoofModel,
  RoofFacet,
  Point2D,
  FacetEdge,
  EdgeType,
  ReportSource,
} from '@/types';

// ────────────────────────────────────────────────────────────────
// Types for the intermediate parse tree
// ────────────────────────────────────────────────────────────────

interface XmlPoint3D {
  x: number;
  y: number;
  z: number;
}

interface XmlLine {
  type: string;          // original tag value (RIDGE, EAVE, RAKE …)
  points: XmlPoint3D[];
}

interface XmlFace {
  id: string;
  label: string;
  area: number;          // sq ft (0 if not provided)
  pitch: string;         // e.g. "5/12"
  lines: XmlLine[];
  vertices3D: XmlPoint3D[];   // ordered boundary ring (computed)
}

// ────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────

/**
 * Returns true when the supplied string looks like an XML roof report.
 */
export function isXmlRoofReport(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith('<') && !t.startsWith('<?xml')) return false;
  // Look for roof-related element names
  return /(<face[\s/>]|<facet[\s/>]|<roof[\s/>]|<polygon[\s/>]|<measurement[\s/>]|<report[\s/>]|<structure[\s/>])/i.test(t);
}

/**
 * Parse an XML roof report string into a RoofModel.
 */
export function parseXmlRoofReport(
  xmlText: string,
  projectName?: string,
): RoofModel {
  // Use DOMParser (works in browser)
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  // Check for parse errors
  const errNode = doc.querySelector('parsererror');
  if (errNode) {
    throw new Error(`XML parse error: ${errNode.textContent?.slice(0, 200)}`);
  }

  // Detect source
  const source = detectXmlSource(doc);

  // Try multiple extraction strategies in order of specificity
  let faces = extractFacesGAF(doc);
  if (faces.length === 0) faces = extractFacesEagleView(doc);
  if (faces.length === 0) faces = extractFacesGeneric(doc);

  if (faces.length === 0) {
    throw new Error('No roof faces/facets found in the XML. Ensure the file contains <face>, <facet>, or <polygon> elements.');
  }

  // Build ordered vertex rings for each face from line endpoints
  for (const face of faces) {
    if (face.vertices3D.length === 0 && face.lines.length > 0) {
      face.vertices3D = buildVertexRing(face.lines);
    }
  }

  // Convert to RoofFacets
  const totalArea = faces.reduce((s, f) => s + f.area, 0);
  const facets: RoofFacet[] = faces.map((face, idx) =>
    xmlFaceToRoofFacet(face, idx),
  );

  // Extract address if present
  const address = extractXmlAddress(doc) || '';

  // Project name
  const name =
    projectName ||
    extractXmlText(doc, 'projectname,project_name,project-name,name,title,address,location') ||
    'XML Import';

  return {
    id: `rm_xml_${Date.now()}`,
    projectName: name,
    address,
    source,
    totalAreaSqFt: totalArea > 0 ? totalArea : facets.reduce((s, f) => s + f.areaSquareFeet, 0),
    facets,
    createdAt: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────────
// Source detection
// ────────────────────────────────────────────────────────────────

function detectXmlSource(doc: Document): ReportSource {
  const root = doc.documentElement.tagName.toLowerCase();
  const text = doc.documentElement.outerHTML.toLowerCase();

  if (text.includes('quickmeasure') || text.includes('gaf')) return 'gaf_quickmeasure';
  if (text.includes('eagleview')) return 'eagleview';
  if (text.includes('roofr')) return 'roofr';
  if (text.includes('roofgraf')) return 'roofgraf';

  // Fallback based on structure
  if (root === 'report' || root === 'roofmodel' || root === 'measurement') return 'gaf_quickmeasure';
  return 'manual';
}

// ────────────────────────────────────────────────────────────────
// GAF QuickMeasure format
// ────────────────────────────────────────────────────────────────

function extractFacesGAF(doc: Document): XmlFace[] {
  const faces: XmlFace[] = [];

  // GAF uses <face> or <Face> elements
  const faceEls = findElements(doc, 'face');
  if (faceEls.length === 0) return faces;

  for (let i = 0; i < faceEls.length; i++) {
    const el = faceEls[i];
    const id = el.getAttribute('id') || el.getAttribute('name') || el.getAttribute('label') || `F${i + 1}`;

    // Area
    let area = parseFloatAttr(el, 'area,areaSqFt,area_sqft,squarefeet,sqft');
    if (area === 0) {
      const areaEl = findChild(el, 'area,squarefeet');
      if (areaEl) area = parseFloat(areaEl.textContent || '0') || 0;
    }

    // Pitch
    let pitch = el.getAttribute('pitch') || '';
    if (!pitch) {
      const pitchEl = findChild(el, 'pitch,slope');
      if (pitchEl) pitch = pitchEl.textContent?.trim() || '';
    }
    if (!pitch) pitch = '6/12';

    // Lines from <polygon> > <line> or directly under <face>
    const lines: XmlLine[] = [];
    const lineEls = findElements(el, 'line,edge,segment');
    for (const lineEl of lineEls) {
      const lineType = lineEl.getAttribute('type') || lineEl.getAttribute('name') || lineEl.getAttribute('edgetype') || 'UNKNOWN';
      const points = extractPoints(lineEl);
      if (points.length >= 2) {
        lines.push({ type: lineType.toUpperCase(), points });
      }
    }

    // Also try <polygon> wrapper
    if (lines.length === 0) {
      const polyEls = findElements(el, 'polygon,boundary,outline,ring');
      for (const polyEl of polyEls) {
        const lineEls2 = findElements(polyEl, 'line,edge,segment');
        for (const lineEl of lineEls2) {
          const lineType = lineEl.getAttribute('type') || lineEl.getAttribute('name') || lineEl.getAttribute('edgetype') || 'UNKNOWN';
          const points = extractPoints(lineEl);
          if (points.length >= 2) {
            lines.push({ type: lineType.toUpperCase(), points });
          }
        }
        // Also try direct point children of polygon (vertex list)
        if (lines.length === 0) {
          const pts = extractPoints(polyEl);
          if (pts.length >= 3) {
            // Create synthetic lines connecting consecutive vertices
            for (let j = 0; j < pts.length; j++) {
              const a = pts[j];
              const b = pts[(j + 1) % pts.length];
              lines.push({ type: 'UNKNOWN', points: [a, b] });
            }
          }
        }
      }
    }

    // Direct vertex list on face (no lines)
    let verts3D: XmlPoint3D[] = [];
    if (lines.length === 0) {
      verts3D = extractPoints(el);
    }

    faces.push({ id, label: `Facet ${id}`, area, pitch, lines, vertices3D: verts3D });
  }

  return faces;
}

// ────────────────────────────────────────────────────────────────
// EagleView format
// ────────────────────────────────────────────────────────────────

function extractFacesEagleView(doc: Document): XmlFace[] {
  const faces: XmlFace[] = [];

  // EagleView uses <facet> or <section> elements
  const facetEls = findElements(doc, 'facet,section,plane');
  if (facetEls.length === 0) return faces;

  for (let i = 0; i < facetEls.length; i++) {
    const el = facetEls[i];
    const id = el.getAttribute('id') || el.getAttribute('name') || `S${i + 1}`;

    let area = parseFloatAttr(el, 'area,areaSqFt,squarefeet');
    if (area === 0) {
      const areaEl = findChild(el, 'area');
      if (areaEl) area = parseFloat(areaEl.textContent || '0') || 0;
    }

    let pitch = el.getAttribute('pitch') || '';
    if (!pitch) {
      const pitchEl = findChild(el, 'pitch,slope');
      if (pitchEl) pitch = pitchEl.textContent?.trim() || '';
    }
    if (!pitch) pitch = '6/12';

    const lines: XmlLine[] = [];
    const lineEls = findElements(el, 'line,edge,segment,boundary');
    for (const lineEl of lineEls) {
      const lineType = lineEl.getAttribute('type') || lineEl.getAttribute('edgetype') || 'UNKNOWN';
      const points = extractPoints(lineEl);
      if (points.length >= 2) {
        lines.push({ type: lineType.toUpperCase(), points });
      }
    }

    let verts3D: XmlPoint3D[] = [];
    if (lines.length === 0) {
      verts3D = extractPoints(el);
    }

    faces.push({ id, label: `Facet ${id}`, area, pitch, lines, vertices3D: verts3D });
  }

  return faces;
}

// ────────────────────────────────────────────────────────────────
// Generic XML format (tries common patterns)
// ────────────────────────────────────────────────────────────────

function extractFacesGeneric(doc: Document): XmlFace[] {
  const faces: XmlFace[] = [];

  // Try <roof> > <face/facet/section> ...
  const containers = findElements(doc, 'roof,structure,model,building,measurement,report');
  const searchIn = containers.length > 0 ? containers : [doc.documentElement];

  for (const container of searchIn) {
    const faceEls = findElements(container, 'face,facet,section,plane,surface,panel,area');
    for (let i = 0; i < faceEls.length; i++) {
      const el = faceEls[i];
      const id = el.getAttribute('id') || el.getAttribute('name') || `G${i + 1}`;

      let area = parseFloatAttr(el, 'area,areaSqFt,squarefeet,sqft,size');
      if (area === 0) {
        const areaEl = findChild(el, 'area,squarefeet,size');
        if (areaEl) area = parseFloat(areaEl.textContent || '0') || 0;
      }

      let pitch = el.getAttribute('pitch') || el.getAttribute('slope') || '';
      if (!pitch) {
        const pitchEl = findChild(el, 'pitch,slope');
        if (pitchEl) pitch = pitchEl.textContent?.trim() || '';
      }
      if (!pitch) pitch = '6/12';

      const lines: XmlLine[] = [];
      const allLineEls = findElements(el, 'line,edge,segment,side,boundary');
      for (const lineEl of allLineEls) {
        const lineType = lineEl.getAttribute('type') || lineEl.getAttribute('edgetype') || lineEl.getAttribute('name') || 'UNKNOWN';
        const points = extractPoints(lineEl);
        if (points.length >= 2) {
          lines.push({ type: lineType.toUpperCase(), points });
        }
      }

      let verts3D: XmlPoint3D[] = [];
      if (lines.length === 0) {
        verts3D = extractPoints(el);
      }

      if (lines.length > 0 || verts3D.length >= 3 || area > 0) {
        faces.push({ id, label: `Facet ${id}`, area, pitch, lines, vertices3D: verts3D });
      }
    }
  }

  return faces;
}

// ────────────────────────────────────────────────────────────────
// Vertex ring builder (ordered boundary from unordered lines)
// ────────────────────────────────────────────────────────────────

function buildVertexRing(lines: XmlLine[]): XmlPoint3D[] {
  if (lines.length === 0) return [];

  // Collect unique endpoints
  const EPS = 0.01;
  const allPts: XmlPoint3D[] = [];
  const segments: [XmlPoint3D, XmlPoint3D][] = [];

  for (const line of lines) {
    if (line.points.length >= 2) {
      const a = line.points[0];
      const b = line.points[line.points.length - 1];
      segments.push([a, b]);
      addUnique(allPts, a, EPS);
      addUnique(allPts, b, EPS);
    }
  }

  if (allPts.length < 3) {
    // Just flatten all points
    const flat: XmlPoint3D[] = [];
    for (const line of lines) {
      for (const p of line.points) addUnique(flat, p, EPS);
    }
    return flat;
  }

  // Try to chain segments into a ring
  const ring: XmlPoint3D[] = [segments[0][0], segments[0][1]];
  const used = new Set<number>([0]);

  for (let iter = 0; iter < segments.length * 2 && ring.length < allPts.length + 1; iter++) {
    const tail = ring[ring.length - 1];
    let found = false;
    for (let i = 0; i < segments.length; i++) {
      if (used.has(i)) continue;
      const [a, b] = segments[i];
      if (dist3(tail, a) < EPS) {
        ring.push(b);
        used.add(i);
        found = true;
        break;
      }
      if (dist3(tail, b) < EPS) {
        ring.push(a);
        used.add(i);
        found = true;
        break;
      }
    }
    if (!found) break;
  }

  // Close the ring - remove duplicate closing point if present
  if (ring.length > 2 && dist3(ring[0], ring[ring.length - 1]) < EPS) {
    ring.pop();
  }

  return ring;
}

// ────────────────────────────────────────────────────────────────
// Convert XmlFace → RoofFacet
// ────────────────────────────────────────────────────────────────

function xmlFaceToRoofFacet(face: XmlFace, index: number): RoofFacet {
  // Project 3D to 2D (XY top-down)
  const vertices2D: Point2D[] = face.vertices3D.map(p => ({ x: p.x, y: p.y }));

  // If we still have no vertices, create a square from area
  if (vertices2D.length < 3 && face.area > 0) {
    const side = Math.sqrt(face.area);
    const ox = index * (side + 10);
    vertices2D.push(
      { x: ox, y: 0 },
      { x: ox + side, y: 0 },
      { x: ox + side, y: side },
      { x: ox, y: side },
    );
  }

  // Parse pitch
  const pitchMatch = face.pitch.match(/(\d+(?:\.\d+)?)\s*[/:]?\s*12/);
  const pitchRise = pitchMatch ? parseFloat(pitchMatch[1]) : 6;
  const pitchDeg = Math.atan(pitchRise / 12) * (180 / Math.PI);

  // Compute area from vertices if not provided
  let area = face.area;
  if (area <= 0 && vertices2D.length >= 3) {
    area = Math.abs(polygonArea(vertices2D));
  }

  // Slope area
  const slopeArea = area / Math.cos(pitchDeg * (Math.PI / 180));

  // Build edges
  const edges: FacetEdge[] = [];
  const facetId = `f${index}`;

  if (face.lines.length > 0) {
    // Use original lines with their types
    for (let i = 0; i < face.lines.length; i++) {
      const line = face.lines[i];
      const pts = line.points;
      if (pts.length < 2) continue;
      const start: Point2D = { x: pts[0].x, y: pts[0].y };
      const end: Point2D = { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
      const len = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);

      edges.push({
        id: `${facetId}_e${i}`,
        start,
        end,
        lengthFeet: len,
        type: mapXmlEdgeType(line.type),
      });
    }
  } else {
    // Create edges from vertex ring
    for (let i = 0; i < vertices2D.length; i++) {
      const s = vertices2D[i];
      const e = vertices2D[(i + 1) % vertices2D.length];
      const len = Math.sqrt((e.x - s.x) ** 2 + (e.y - s.y) ** 2);
      edges.push({
        id: `${facetId}_e${i}`,
        start: s,
        end: e,
        lengthFeet: len,
        type: i === 0 ? 'eave' : 'rake',  // default assumption
      });
    }
  }

  // If pitch was computed from 3D Z deltas, use that
  const computedPitch = computePitchFrom3D(face.vertices3D);
  const finalPitchRise = computedPitch > 0 ? computedPitch : pitchRise;
  const finalPitchDeg = Math.atan(finalPitchRise / 12) * (180 / Math.PI);

  return {
    id: facetId,
    label: face.label,
    vertices: vertices2D,
    pitchRatio: `${Math.round(finalPitchRise * 10) / 10}/12`,
    pitchDegrees: finalPitchDeg,
    areaSquareFeet: area,
    slopeAreaSquareFeet: area / Math.cos(finalPitchDeg * (Math.PI / 180)),
    edgeTypes: edges,
  };
}

// ────────────────────────────────────────────────────────────────
// Compute pitch from 3D Z coordinates
// ────────────────────────────────────────────────────────────────

function computePitchFrom3D(verts: XmlPoint3D[]): number {
  if (verts.length < 3) return 0;

  // Find the Z range and XY extent
  const zMin = Math.min(...verts.map(v => v.z));
  const zMax = Math.max(...verts.map(v => v.z));
  const rise = zMax - zMin;
  if (rise < 0.01) return 0; // flat

  // Find horizontal run between lowest and highest Z points
  const lowPt = verts.find(v => Math.abs(v.z - zMin) < 0.01)!;
  const highPt = verts.find(v => Math.abs(v.z - zMax) < 0.01)!;
  const run = Math.sqrt((highPt.x - lowPt.x) ** 2 + (highPt.y - lowPt.y) ** 2);

  if (run < 0.01) return 12; // vertical (unlikely)

  // pitch = rise per 12" of run
  return (rise / run) * 12;
}

// ────────────────────────────────────────────────────────────────
// Edge type mapping
// ────────────────────────────────────────────────────────────────

const EDGE_TYPE_MAP: Record<string, EdgeType> = {
  RIDGE: 'ridge',
  HIP: 'hip',
  VALLEY: 'valley',
  EAVE: 'eave',
  RAKE: 'rake',
  SIDEWALL: 'sidewall',
  HEADWALL: 'headwall',
  DRIP_EDGE: 'drip_edge',
  DRIPEDGE: 'drip_edge',
  DRIP: 'drip_edge',
  TRANSITION: 'transition',
  STEPFLASH: 'sidewall',
  STEPFLASHING: 'sidewall',
  STEP_FLASHING: 'sidewall',
  FLASHING: 'sidewall',
  WALL: 'sidewall',
  GUTTER: 'eave',
  BEND: 'transition',
  UNKNOWN: 'eave',
};

function mapXmlEdgeType(xmlType: string): EdgeType {
  return EDGE_TYPE_MAP[xmlType.toUpperCase().replace(/[\s-]/g, '')] || 'eave';
}

// ────────────────────────────────────────────────────────────────
// XML utility helpers
// ────────────────────────────────────────────────────────────────

/**
 * Find elements matching any of the comma-separated tag names
 * (case-insensitive).
 */
function findElements(parent: Element | Document, tagNames: string): Element[] {
  const names = tagNames.split(',').map(n => n.trim().toLowerCase());
  const results: Element[] = [];
  const all = parent instanceof Document
    ? parent.querySelectorAll('*')
    : parent.querySelectorAll('*');

  all.forEach(el => {
    if (names.includes(el.tagName.toLowerCase())) {
      results.push(el);
    }
  });
  return results;
}

/**
 * Find first direct child matching tag names.
 */
function findChild(parent: Element, tagNames: string): Element | null {
  const names = tagNames.split(',').map(n => n.trim().toLowerCase());
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    if (names.includes(child.tagName.toLowerCase())) return child;
  }
  return null;
}

/**
 * Extract 3D points from an element. Looks for:
 * - <point x="" y="" z=""/> children
 * - <vertex x="" y="" z=""/> children
 * - <coord> text (x,y,z) </coord>
 * - Inline attributes (x1,y1,z1,x2,y2,z2)
 */
function extractPoints(el: Element): XmlPoint3D[] {
  const pts: XmlPoint3D[] = [];

  // Look for <point> or <vertex> or <pt> children
  const ptEls = findElements(el, 'point,vertex,pt,coord,node,v');
  for (const ptEl of ptEls) {
    const x = parseFloat(ptEl.getAttribute('x') || ptEl.getAttribute('X') || '0');
    const y = parseFloat(ptEl.getAttribute('y') || ptEl.getAttribute('Y') || '0');
    const z = parseFloat(ptEl.getAttribute('z') || ptEl.getAttribute('Z') || '0');

    // Also try text content like "x,y,z"
    if (isNaN(x) || (x === 0 && y === 0 && z === 0)) {
      const text = ptEl.textContent?.trim() || '';
      const parts = text.split(/[\s,;]+/).map(Number);
      if (parts.length >= 2 && !isNaN(parts[0])) {
        pts.push({ x: parts[0], y: parts[1], z: parts[2] || 0 });
        continue;
      }
    }

    if (!isNaN(x) && !isNaN(y)) {
      pts.push({ x, y, z: isNaN(z) ? 0 : z });
    }
  }

  // Try inline attributes (x1,y1,z1,x2,y2,z2)
  if (pts.length === 0) {
    const x1 = parseFloat(el.getAttribute('x1') || '');
    const y1 = parseFloat(el.getAttribute('y1') || '');
    const x2 = parseFloat(el.getAttribute('x2') || '');
    const y2 = parseFloat(el.getAttribute('y2') || '');
    if (!isNaN(x1) && !isNaN(y1)) {
      const z1 = parseFloat(el.getAttribute('z1') || '0') || 0;
      pts.push({ x: x1, y: y1, z: z1 });
    }
    if (!isNaN(x2) && !isNaN(y2)) {
      const z2 = parseFloat(el.getAttribute('z2') || '0') || 0;
      pts.push({ x: x2, y: y2, z: z2 });
    }
  }

  return pts;
}

function parseFloatAttr(el: Element, attrNames: string): number {
  for (const name of attrNames.split(',')) {
    const val = el.getAttribute(name.trim());
    if (val) {
      const n = parseFloat(val.replace(/[,\s]/g, ''));
      if (!isNaN(n)) return n;
    }
  }
  return 0;
}

function extractXmlText(doc: Document, tagNames: string): string {
  const els = findElements(doc, tagNames);
  for (const el of els) {
    const t = el.textContent?.trim();
    if (t && t.length > 2) return t;
  }
  return '';
}

function extractXmlAddress(doc: Document): string {
  return extractXmlText(doc, 'address,location,street,propertyaddress,property_address,siteaddress');
}

// ────────────────────────────────────────────────────────────────
// Geometry helpers
// ────────────────────────────────────────────────────────────────

function polygonArea(verts: Point2D[]): number {
  let area = 0;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += verts[i].x * verts[j].y;
    area -= verts[j].x * verts[i].y;
  }
  return area / 2;
}

function dist3(a: XmlPoint3D, b: XmlPoint3D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function addUnique(arr: XmlPoint3D[], pt: XmlPoint3D, eps: number): void {
  for (const existing of arr) {
    if (dist3(existing, pt) < eps) return;
  }
  arr.push(pt);
}