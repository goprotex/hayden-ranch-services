import { RoofModel, RoofFacet, ReportSource, Point2D, FacetEdge, EdgeType } from '@/types';

// ============================================================
// PUBLIC API
// ============================================================

/** Auto-detect the report source from extracted PDF text */
export function detectReportSource(text: string): ReportSource {
  const t = text.toLowerCase();
  if (t.includes('roofr') || t.includes('powered by roofr')) return 'roofr';
  if (t.includes('eagleview') || t.includes('eagle view')) return 'eagleview';
  if (t.includes('roofgraf') || t.includes('roof graf')) return 'roofgraf';
  if (t.includes('gaf') || t.includes('quickmeasure') || t.includes('quick measure')) return 'gaf_quickmeasure';
  return 'manual';
}

/**
 * Parse a roof measurement report text and extract a RoofModel.
 * Handles Roofr, EagleView, GAF QuickMeasure, RoofGraf, and generic text.
 */
export function parseRoofReport(
  rawText: string,
  source: ReportSource,
  projectName?: string
): RoofModel {
  // Auto-detect if source is manual but text has brand indicators
  if (source === 'manual') {
    const detected = detectReportSource(rawText);
    if (detected !== 'manual') source = detected;
  }

  switch (source) {
    case 'roofr':
      return parseRoofr(rawText, projectName);
    case 'eagleview':
      return parseEagleView(rawText, projectName);
    case 'gaf_quickmeasure':
      return parseGAFQuickMeasure(rawText, projectName);
    case 'roofgraf':
      return parseRoofGraf(rawText, projectName);
    default:
      return parseGenericReport(rawText, projectName);
  }
}

// ============================================================
// MEASUREMENT PARSING UTILITIES
// ============================================================

/**
 * Parse "162ft 6in" / "162' 6\"" / "162.5 ft" / "162.5" → decimal feet
 */
function parseFeetInches(text: string): number {
  if (!text) return 0;
  text = text.trim();

  // "Xft Yin" or "X' Y\""
  const ftIn = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:ft|feet|')\s*(\d+(?:\.\d+)?)\s*(?:in|inches|"|'')?/i);
  if (ftIn) return parseFloat(ftIn[1].replace(/,/g, '')) + parseFloat(ftIn[2]) / 12;

  // "X ft" (no inches)
  const ftOnly = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:ft|feet|')/i);
  if (ftOnly) return parseFloat(ftOnly[1].replace(/,/g, ''));

  // "X sq ft"
  const sqft = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:sq\.?\s*ft|sqft|sf)/i);
  if (sqft) return parseFloat(sqft[1].replace(/,/g, ''));

  // Plain number
  const num = text.match(/(\d[\d,]*(?:\.\d+)?)/);
  if (num) return parseFloat(num[1].replace(/,/g, ''));

  return 0;
}

function parsePitchRise(text: string): number {
  const m = text.match(/(\d+(?:\.\d+)?)\s*[/:]\s*12/);
  if (m) return parseFloat(m[1]);
  const n = text.match(/(\d+(?:\.\d+)?)/);
  return n ? parseFloat(n[1]) : 6;
}

function pitchToDegrees(rise: number): number {
  return Math.atan(rise / 12) * (180 / Math.PI);
}

// ============================================================
// ROOFR PARSER
// ============================================================

function parseRoofr(rawText: string, projectName?: string): RoofModel {
  const model = createEmptyModel(projectName || 'Roofr Import', 'roofr');

  // --- Address (line with a zip code + street-like words) ---
  model.address = extractAddress(rawText);

  // --- Facet count ---
  const facetCountMatch = rawText.match(/(\d+)\s*facets?/i);
  const numFacets = facetCountMatch ? parseInt(facetCountMatch[1], 10) : 0;

  // --- Predominant pitch ---
  const pitchMatch = rawText.match(/(?:predominant\s+)?pitch\s*[:\s]*(\d+(?:\.\d+)?)\s*[/:]\s*12/i);
  const defaultPitch = pitchMatch ? parsePitchRise(pitchMatch[0]) : 6;
  const defaultPitchDeg = pitchToDegrees(defaultPitch);

  // --- Total area ---
  model.totalAreaSqFt = extractTotalArea(rawText);

  // --- Edge lengths from measurement legend ---
  const edgeLengths = parseEdgeSummary(rawText);

  // --- Try to parse individual facet data ---
  const parsedFacets = parseDetailedFacets(rawText, defaultPitch, defaultPitchDeg);

  if (parsedFacets.length > 0) {
    model.facets = parsedFacets;
  } else if (numFacets > 0 && model.totalAreaSqFt > 0) {
    model.facets = createDistributedFacets(numFacets, model.totalAreaSqFt, defaultPitch, defaultPitchDeg, edgeLengths);
  } else if (model.totalAreaSqFt > 0) {
    model.facets = createDistributedFacets(2, model.totalAreaSqFt, defaultPitch, defaultPitchDeg, edgeLengths);
  } else if (Object.keys(edgeLengths).length > 0) {
    const est = estimateAreaFromEdges(edgeLengths);
    model.totalAreaSqFt = est;
    model.facets = createDistributedFacets(numFacets || 2, est, defaultPitch, defaultPitchDeg, edgeLengths);
  } else {
    model.facets = createSimpleGable(2000, defaultPitch, defaultPitchDeg);
  }

  attachEdgeLengths(model.facets, edgeLengths);
  if (!model.totalAreaSqFt) model.totalAreaSqFt = model.facets.reduce((s, f) => s + f.areaSquareFeet, 0);
  return model;
}

// ============================================================
// EAGLEVIEW PARSER
// ============================================================

function parseEagleView(rawText: string, projectName?: string): RoofModel {
  const model = createEmptyModel(projectName || 'EagleView Import', 'eagleview');
  model.address = extractAddress(rawText);
  model.totalAreaSqFt = extractTotalArea(rawText);

  const pitchMatch = rawText.match(/(?:predominant\s+)?pitch\s*[:\s]*(\d+(?:\.\d+)?)\s*[/:]\s*12/i);
  const defaultPitch = pitchMatch ? parsePitchRise(pitchMatch[0]) : 6;
  const defaultPitchDeg = pitchToDegrees(defaultPitch);

  const edgeLengths = parseEdgeSummary(rawText);
  const facets = parseDetailedFacets(rawText, defaultPitch, defaultPitchDeg);
  const fc = rawText.match(/(\d+)\s*(?:facets?|planes?|sections?)/i);
  const numFacets = fc ? parseInt(fc[1], 10) : 0;

  if (facets.length > 0) {
    model.facets = facets;
  } else if (model.totalAreaSqFt > 0) {
    model.facets = createDistributedFacets(numFacets || 2, model.totalAreaSqFt, defaultPitch, defaultPitchDeg, edgeLengths);
  } else {
    model.facets = createSimpleGable(2000, defaultPitch, defaultPitchDeg);
  }

  attachEdgeLengths(model.facets, edgeLengths);
  if (!model.totalAreaSqFt) model.totalAreaSqFt = model.facets.reduce((s, f) => s + f.areaSquareFeet, 0);
  return model;
}

// ============================================================
// GAF QUICKMEASURE PARSER
// ============================================================

function parseGAFQuickMeasure(rawText: string, projectName?: string): RoofModel {
  const model = createEmptyModel(projectName || 'GAF QuickMeasure Import', 'gaf_quickmeasure');
  model.address = extractAddress(rawText);
  model.totalAreaSqFt = extractTotalArea(rawText);

  const pitchMatch = rawText.match(/(?:predominant\s+)?pitch\s*[:\s]*(\d+(?:\.\d+)?)\s*[/:]\s*12/i);
  const defaultPitch = pitchMatch ? parsePitchRise(pitchMatch[0]) : 6;
  const defaultPitchDeg = pitchToDegrees(defaultPitch);
  const edgeLengths = parseEdgeSummary(rawText);
  const facets = parseDetailedFacets(rawText, defaultPitch, defaultPitchDeg);
  const fc = rawText.match(/(\d+)\s*(?:facets?|planes?)/i);

  if (facets.length > 0) model.facets = facets;
  else if (model.totalAreaSqFt > 0) model.facets = createDistributedFacets(fc ? parseInt(fc[1]) : 2, model.totalAreaSqFt, defaultPitch, defaultPitchDeg, edgeLengths);
  else model.facets = createSimpleGable(2000, defaultPitch, defaultPitchDeg);

  attachEdgeLengths(model.facets, edgeLengths);
  if (!model.totalAreaSqFt) model.totalAreaSqFt = model.facets.reduce((s, f) => s + f.areaSquareFeet, 0);
  return model;
}

// ============================================================
// ROOFGRAF PARSER
// ============================================================

function parseRoofGraf(rawText: string, projectName?: string): RoofModel {
  const model = createEmptyModel(projectName || 'RoofGraf Import', 'roofgraf');
  model.address = extractAddress(rawText);
  model.totalAreaSqFt = extractTotalArea(rawText);

  const pitchMatch = rawText.match(/(?:predominant\s+)?pitch\s*[:\s]*(\d+(?:\.\d+)?)\s*[/:]\s*12/i);
  const defaultPitch = pitchMatch ? parsePitchRise(pitchMatch[0]) : 6;
  const defaultPitchDeg = pitchToDegrees(defaultPitch);
  const edgeLengths = parseEdgeSummary(rawText);
  const facets = parseDetailedFacets(rawText, defaultPitch, defaultPitchDeg);
  const fc = rawText.match(/(\d+)\s*(?:facets?|planes?)/i);

  if (facets.length > 0) model.facets = facets;
  else if (model.totalAreaSqFt > 0) model.facets = createDistributedFacets(fc ? parseInt(fc[1]) : 2, model.totalAreaSqFt, defaultPitch, defaultPitchDeg, edgeLengths);
  else model.facets = createSimpleGable(2000, defaultPitch, defaultPitchDeg);

  attachEdgeLengths(model.facets, edgeLengths);
  if (!model.totalAreaSqFt) model.totalAreaSqFt = model.facets.reduce((s, f) => s + f.areaSquareFeet, 0);
  return model;
}

// ============================================================
// GENERIC PARSER
// ============================================================

function parseGenericReport(rawText: string, projectName?: string): RoofModel {
  const model = createEmptyModel(projectName || 'Manual Import', 'manual');
  model.address = extractAddress(rawText);
  model.totalAreaSqFt = extractTotalArea(rawText);

  const pitchMatch = rawText.match(/(\d+(?:\.\d+)?)\s*[/:]\s*12/);
  const pitch = pitchMatch ? parseFloat(pitchMatch[1]) : 6;
  const pitchDeg = pitchToDegrees(pitch);
  const edgeLengths = parseEdgeSummary(rawText);
  const facets = parseDetailedFacets(rawText, pitch, pitchDeg);

  if (facets.length > 0) {
    model.facets = facets;
  } else if (model.totalAreaSqFt > 0) {
    model.facets = createDistributedFacets(2, model.totalAreaSqFt, pitch, pitchDeg, edgeLengths);
  } else if (Object.keys(edgeLengths).length > 0) {
    const est = estimateAreaFromEdges(edgeLengths);
    model.totalAreaSqFt = est;
    model.facets = createDistributedFacets(2, est, pitch, pitchDeg, edgeLengths);
  } else {
    model.facets = createSimpleGable(2000, pitch, pitchDeg);
  }

  attachEdgeLengths(model.facets, edgeLengths);
  if (!model.totalAreaSqFt) model.totalAreaSqFt = model.facets.reduce((s, f) => s + f.areaSquareFeet, 0);
  return model;
}

// ============================================================
// SHARED EXTRACTION HELPERS
// ============================================================

function createEmptyModel(name: string, source: ReportSource): RoofModel {
  return {
    id: `rm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    projectName: name,
    address: '',
    source,
    totalAreaSqFt: 0,
    facets: [],
    createdAt: new Date().toISOString(),
  };
}

/** Find an address in the text (line with street + zip code) */
function extractAddress(rawText: string): string {
  // Try labeled address first
  const labeled = rawText.match(
    /(?:property\s*(?:address)?|address|location|site)[:\s]+([^\n]+?\d{5}(?:-\d{4})?)/im
  );
  if (labeled) return labeled[1].trim();

  // Try any line with a zip code and street-like words
  const lines = rawText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      /\b\d{5}(?:-\d{4})?\b/.test(trimmed) &&
      /\b(?:st|street|ave|avenue|blvd|dr|drive|rd|road|ln|lane|way|ct|hwy|highway|pkwy|north|south|east|west|n\.|s\.|e\.|w\.)\b/i.test(trimmed) &&
      trimmed.length < 200
    ) {
      return trimmed;
    }
  }
  return '';
}

/** Extract total roof area from various formats */
function extractTotalArea(rawText: string): number {
  // "Total Roof Area: 2,450 sq ft"
  const sqftMatch = rawText.match(
    /(?:total\s*(?:roof\s*)?area|roof\s*area|total\s*area)[:\s]*([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*ft|sf|square\s*feet)/i
  );
  if (sqftMatch) return parseFloat(sqftMatch[1].replace(/,/g, ''));

  // "25.5 squares"
  const sqMatch = rawText.match(
    /(?:total\s*(?:roof\s*)?area|total)[:\s]*([\d,]+(?:\.\d+)?)\s*squares?/i
  );
  if (sqMatch) return parseFloat(sqMatch[1].replace(/,/g, '')) * 100;

  // Standalone area mention
  const anyArea = rawText.match(/([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*ft|sf|square\s*feet)/i);
  if (anyArea) return parseFloat(anyArea[1].replace(/,/g, ''));

  return 0;
}

/**
 * Parse edge lengths summary.
 * Handles "Eaves: 162ft 6in", "Ridge: 35.5 ft", "Valleys 28ft 2in", tabular layouts
 */
function parseEdgeSummary(rawText: string): Record<string, number> {
  const edges: Record<string, number> = {};

  const patterns: { regex: RegExp; key: string }[] = [
    { regex: /eaves?\s*[:\s]+(\d[\d,]*(?:\.\d+)?\s*(?:ft|feet|')[^,\n]*)/gi, key: 'eave' },
    { regex: /valleys?\s*[:\s]+(\d[\d,]*(?:\.\d+)?\s*(?:ft|feet|')[^,\n]*)/gi, key: 'valley' },
    { regex: /hips?\s*[:\s]+(\d[\d,]*(?:\.\d+)?\s*(?:ft|feet|')[^,\n]*)/gi, key: 'hip' },
    { regex: /ridges?\s*[:\s]+(\d[\d,]*(?:\.\d+)?\s*(?:ft|feet|')[^,\n]*)/gi, key: 'ridge' },
    { regex: /rakes?\s*[:\s]+(\d[\d,]*(?:\.\d+)?\s*(?:ft|feet|')[^,\n]*)/gi, key: 'rake' },
    { regex: /(?:wall|side\s*wall)\s*(?:flashing)?\s*[:\s]+(\d[\d,]*(?:\.\d+)?\s*(?:ft|feet|')[^,\n]*)/gi, key: 'sidewall' },
    { regex: /step\s*(?:flashing)?\s*[:\s]+(\d[\d,]*(?:\.\d+)?\s*(?:ft|feet|')[^,\n]*)/gi, key: 'headwall' },
    { regex: /transitions?\s*[:\s]+(\d[\d,]*(?:\.\d+)?\s*(?:ft|feet|')[^,\n]*)/gi, key: 'transition' },
    { regex: /drip\s*edge\s*[:\s]+(\d[\d,]*(?:\.\d+)?\s*(?:ft|feet|')[^,\n]*)/gi, key: 'drip_edge' },
  ];

  for (const { regex, key } of patterns) {
    let m;
    while ((m = regex.exec(rawText)) !== null) {
      const val = parseFeetInches(m[1]);
      if (val > 0) edges[key] = (edges[key] || 0) + val;
    }
  }

  // Fall back: try plain numbers on labelled lines ("Ridge  35.5")
  if (Object.keys(edges).length === 0) {
    const plain: { regex: RegExp; key: string }[] = [
      { regex: /eaves?\s*[:\s]+([\d,]+(?:\.\d+)?)\s*$/gim, key: 'eave' },
      { regex: /valleys?\s*[:\s]+([\d,]+(?:\.\d+)?)\s*$/gim, key: 'valley' },
      { regex: /hips?\s*[:\s]+([\d,]+(?:\.\d+)?)\s*$/gim, key: 'hip' },
      { regex: /ridges?\s*[:\s]+([\d,]+(?:\.\d+)?)\s*$/gim, key: 'ridge' },
      { regex: /rakes?\s*[:\s]+([\d,]+(?:\.\d+)?)\s*$/gim, key: 'rake' },
    ];
    for (const { regex, key } of plain) {
      let m;
      while ((m = regex.exec(rawText)) !== null) {
        const v = parseFloat(m[1].replace(/,/g, ''));
        if (v > 0) edges[key] = (edges[key] || 0) + v;
      }
    }
  }

  return edges;
}

/**
 * Parse individual facets from report text.
 * Handles "Facet 1: 450 sq ft, 6/12 pitch" and table layouts.
 */
function parseDetailedFacets(rawText: string, defaultPitch: number, defaultPitchDeg: number): RoofFacet[] {
  const facets: RoofFacet[] = [];
  let idx = 0;

  // Pattern A: "Facet 1: 450 sq ft, 6/12 pitch" (single line)
  const singleLine = /(?:facet|plane|section|face)\s*[#]?\s*(\w+)\s*[:\s\-]+.*?([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*ft|sf)[\s,].*?(\d+(?:\.\d+)?)\s*[/:]\s*12/gi;
  let m;
  while ((m = singleLine.exec(rawText)) !== null) {
    const area = parseFloat(m[2].replace(/,/g, ''));
    const pitch = parseFloat(m[3]);
    if (area > 10) {
      facets.push(buildFacet(idx, m[1], area, pitch));
      idx++;
    }
  }

  // Pattern B: "Facet X" followed by area/pitch on nearby lines
  if (facets.length === 0) {
    const blockPat = /(?:facet|plane|section)\s*[#]?\s*(\w+)[^\n]*((?:\n[^\n]*){1,6})/gi;
    while ((m = blockPat.exec(rawText)) !== null) {
      const block = m[0];
      const areaM = block.match(/([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*ft|sf)/i);
      const pitchM = block.match(/(\d+(?:\.\d+)?)\s*[/:]\s*12/);
      const area = areaM ? parseFloat(areaM[1].replace(/,/g, '')) : 0;
      const pitch = pitchM ? parseFloat(pitchM[1]) : defaultPitch;
      if (area > 10) {
        facets.push(buildFacet(idx, m[1], area, pitch));
        idx++;
      }
    }
  }

  // Pattern C: Table rows "1   450   6/12"
  if (facets.length === 0) {
    const tableRow = /(?:^|\n)\s*(\d+)\s+([\d,]+(?:\.\d+)?)\s+(?:sq\.?\s*ft\s+)?(\d+(?:\.\d+)?)\s*[/:]\s*12/gm;
    while ((m = tableRow.exec(rawText)) !== null) {
      const area = parseFloat(m[2].replace(/,/g, ''));
      const pitch = parseFloat(m[3]);
      if (area > 10) {
        facets.push(buildFacet(idx, m[1], area, pitch));
        idx++;
      }
    }
  }

  return facets;
}

function buildFacet(index: number, label: string, area: number, pitchRise: number): RoofFacet {
  const pDeg = pitchToDegrees(pitchRise);
  const side = Math.sqrt(area);
  const ox = index * (side + 10);
  const vertices: Point2D[] = [
    { x: ox, y: 0 },
    { x: ox + side, y: 0 },
    { x: ox + side, y: side },
    { x: ox, y: side },
  ];
  return {
    id: `f${index}`,
    label: `Facet ${label}`,
    vertices,
    pitchRatio: `${pitchRise}/12`,
    pitchDegrees: pDeg,
    areaSquareFeet: area,
    slopeAreaSquareFeet: area / Math.cos(pDeg * (Math.PI / 180)),
    edgeTypes: createEdgesFromVertices(vertices, `f${index}`),
  };
}

// ============================================================
// FACET GENERATION HELPERS
// ============================================================

function createDistributedFacets(
  count: number,
  totalArea: number,
  pitch: number,
  pitchDeg: number,
  edgeLengths: Record<string, number>
): RoofFacet[] {
  const facets: RoofFacet[] = [];
  const perFacet = totalArea / Math.max(count, 1);
  const hasHips = (edgeLengths['hip'] || 0) > 0;
  const style = count === 4 && hasHips ? 'hip' : count === 2 ? 'gable' : 'grid';

  if (style === 'gable') {
    const ridge = edgeLengths['ridge'] || Math.sqrt(perFacet * 1.5);
    const rake = edgeLengths['rake'] ? edgeLengths['rake'] / 2 : perFacet / ridge;
    for (let i = 0; i < 2; i++) {
      const oy = i * (rake + 5);
      const verts: Point2D[] = [
        { x: 0, y: oy }, { x: ridge, y: oy },
        { x: ridge, y: oy + rake }, { x: 0, y: oy + rake },
      ];
      const edges = createEdgesFromVertices(verts, `f${i}`);
      if (edges.length >= 4) {
        edges[0].type = i === 0 ? 'eave' : 'ridge';
        edges[1].type = 'rake';
        edges[2].type = i === 0 ? 'ridge' : 'eave';
        edges[3].type = 'rake';
      }
      facets.push({
        id: `f${i}`,
        label: `Facet ${i + 1} (${i === 0 ? 'Front' : 'Back'})`,
        vertices: verts,
        pitchRatio: `${pitch}/12`,
        pitchDegrees: pitchDeg,
        areaSquareFeet: perFacet,
        slopeAreaSquareFeet: perFacet / Math.cos(pitchDeg * (Math.PI / 180)),
        edgeTypes: edges,
      });
    }
  } else if (style === 'hip') {
    const ridgeLen = edgeLengths['ridge'] || Math.sqrt(totalArea) * 0.4;
    const eaveLen = edgeLengths['eave'] ? edgeLengths['eave'] / 2 : ridgeLen * 1.5;
    const depth = totalArea / (2 * eaveLen);
    const labels = ['Front', 'Back', 'Left', 'Right'];
    for (let i = 0; i < 4; i++) {
      const main = i < 2;
      const a = main ? perFacet * 1.2 : perFacet * 0.8;
      const w = main ? eaveLen : depth;
      const h = a / w;
      const ox = main ? 0 : eaveLen + 10;
      const oy = (i % 2) * (h + 5);
      const verts: Point2D[] = main
        ? [{ x: ox, y: oy }, { x: ox + w, y: oy }, { x: ox + w - (w - ridgeLen) / 2, y: oy + h }, { x: ox + (w - ridgeLen) / 2, y: oy + h }]
        : [{ x: ox, y: oy }, { x: ox + w, y: oy }, { x: ox + w / 2, y: oy + h }];
      const edges = createEdgesFromVertices(verts, `f${i}`);
      if (main && edges.length >= 4) { edges[0].type = 'eave'; edges[1].type = 'hip'; edges[2].type = 'ridge'; edges[3].type = 'hip'; }
      else if (!main && edges.length >= 3) { edges[0].type = 'eave'; edges[1].type = 'hip'; edges[2].type = 'hip'; }
      facets.push({
        id: `f${i}`, label: `Facet ${i + 1} (${labels[i]})`, vertices: verts,
        pitchRatio: `${pitch}/12`, pitchDegrees: pitchDeg, areaSquareFeet: a,
        slopeAreaSquareFeet: a / Math.cos(pitchDeg * (Math.PI / 180)), edgeTypes: edges,
      });
    }
  } else {
    for (let i = 0; i < count; i++) {
      const s = Math.sqrt(perFacet);
      const col = i % 3, row = Math.floor(i / 3);
      const verts: Point2D[] = [
        { x: col * (s + 10), y: row * (s + 10) },
        { x: col * (s + 10) + s, y: row * (s + 10) },
        { x: col * (s + 10) + s, y: row * (s + 10) + s },
        { x: col * (s + 10), y: row * (s + 10) + s },
      ];
      facets.push({
        id: `f${i}`, label: `Facet ${i + 1}`, vertices: verts,
        pitchRatio: `${pitch}/12`, pitchDegrees: pitchDeg, areaSquareFeet: perFacet,
        slopeAreaSquareFeet: perFacet / Math.cos(pitchDeg * (Math.PI / 180)),
        edgeTypes: createEdgesFromVertices(verts, `f${i}`),
      });
    }
  }
  return facets;
}

function createSimpleGable(totalArea: number, pitch: number = 6, pitchDeg: number = 26.57): RoofFacet[] {
  return createDistributedFacets(2, totalArea, pitch, pitchDeg, {});
}

function estimateAreaFromEdges(e: Record<string, number>): number {
  const eave = e['eave'] || 0, rake = e['rake'] || 0, ridge = e['ridge'] || 0;
  if (eave > 0 && rake > 0) return eave * (rake / 2);
  if (eave > 0 && ridge > 0) return eave * ridge * 0.75;
  if (eave > 0) return eave * eave * 0.3;
  const total = Object.values(e).reduce((s, v) => s + v, 0);
  return total > 0 ? Math.pow(total / 4, 2) : 2000;
}

/** Distribute parsed edge totals across facets proportionally */
function attachEdgeLengths(facets: RoofFacet[], edgeLengths: Record<string, number>): void {
  if (!Object.keys(edgeLengths).length || !facets.length) return;
  const totalArea = facets.reduce((s, f) => s + f.areaSquareFeet, 0);

  for (const [edgeType, totalLength] of Object.entries(edgeLengths)) {
    if (totalLength <= 0) continue;
    const type = edgeType as EdgeType;
    const existing = facets.reduce((s, f) =>
      s + f.edgeTypes.filter(e => e.type === type).reduce((a, e) => a + e.lengthFeet, 0), 0);
    if (existing > 0) continue;

    for (const facet of facets) {
      const len = totalLength * (facet.areaSquareFeet / totalArea);
      if (len > 0) {
        facet.edgeTypes.push({
          id: `${facet.id}_${type}_${Math.random().toString(36).slice(2, 6)}`,
          start: { x: 0, y: 0 }, end: { x: len, y: 0 },
          lengthFeet: len, type,
        });
      }
    }
  }
}

function createEdgesFromVertices(vertices: Point2D[], facetId: string): FacetEdge[] {
  const edges: FacetEdge[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const s = vertices[i], e = vertices[(i + 1) % vertices.length];
    const len = Math.sqrt((e.x - s.x) ** 2 + (e.y - s.y) ** 2);
    edges.push({ id: `${facetId}_e${i}`, start: s, end: e, lengthFeet: len, type: 'eave' });
  }
  return edges;
}
