import { RoofModel, RoofFacet, ReportSource, Point2D, FacetEdge, EdgeType } from '@/types';

/**
 * Parse a roof measurement report text and extract a RoofModel.
 * This handles the common structured text output from EagleView,
 * GAF QuickMeasure, and RoofGraf exports.
 * 
 * In production, you'd also use PDF parsing + AI for more complex reports.
 */
export function parseRoofReport(
  rawText: string,
  source: ReportSource,
  projectName?: string
): RoofModel {
  switch (source) {
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

/**
 * Parse EagleView report format.
 * EagleView reports typically include:
 * - Total roof area
 * - Individual facets with pitch, area, and edge details
 * - Ridge, hip, valley, eave, and rake lengths
 */
function parseEagleView(rawText: string, projectName?: string): RoofModel {
  const model = createEmptyModel(projectName || 'EagleView Import', 'eagleview');

  // Extract address
  const addressMatch = rawText.match(/(?:address|property|location)[:\s]*(.+)/i);
  if (addressMatch) model.address = addressMatch[1].trim();

  // Extract total area
  const totalAreaMatch = rawText.match(/(?:total\s*(?:roof)?\s*area)[:\s]*([\d,]+)\s*(?:sq\.?\s*ft|sf)/i);
  if (totalAreaMatch) model.totalAreaSqFt = parseFloat(totalAreaMatch[1].replace(/,/g, ''));

  // Extract facets
  const facets = extractFacets(rawText);
  if (facets.length > 0) {
    model.facets = facets;
  }

  // If no facets were parsed, create a simple rectangular model from the total area
  if (model.facets.length === 0 && model.totalAreaSqFt > 0) {
    model.facets = createSimpleRectangularFacets(model.totalAreaSqFt);
  }

  return model;
}

/**
 * Parse GAF QuickMeasure format.
 */
function parseGAFQuickMeasure(rawText: string, projectName?: string): RoofModel {
  const model = createEmptyModel(projectName || 'GAF QuickMeasure Import', 'gaf_quickmeasure');

  const addressMatch = rawText.match(/(?:address|property)[:\s]*(.+)/i);
  if (addressMatch) model.address = addressMatch[1].trim();

  const totalAreaMatch = rawText.match(/(?:total\s*(?:roof)?\s*area)[:\s]*([\d,]+)\s*(?:sq\.?\s*ft|sf)/i);
  if (totalAreaMatch) model.totalAreaSqFt = parseFloat(totalAreaMatch[1].replace(/,/g, ''));

  const facets = extractFacets(rawText);
  model.facets = facets.length > 0 ? facets : createSimpleRectangularFacets(model.totalAreaSqFt || 2000);

  return model;
}

/**
 * Parse RoofGraf format.
 */
function parseRoofGraf(rawText: string, projectName?: string): RoofModel {
  const model = createEmptyModel(projectName || 'RoofGraf Import', 'roofgraf');

  const addressMatch = rawText.match(/(?:address|property)[:\s]*(.+)/i);
  if (addressMatch) model.address = addressMatch[1].trim();

  const totalAreaMatch = rawText.match(/(?:total\s*(?:roof)?\s*area)[:\s]*([\d,]+)\s*(?:sq\.?\s*ft|sf)/i);
  if (totalAreaMatch) model.totalAreaSqFt = parseFloat(totalAreaMatch[1].replace(/,/g, ''));

  const facets = extractFacets(rawText);
  model.facets = facets.length > 0 ? facets : createSimpleRectangularFacets(model.totalAreaSqFt || 2000);

  return model;
}

/**
 * Generic parser for unrecognized formats.
 */
function parseGenericReport(rawText: string, projectName?: string): RoofModel {
  const model = createEmptyModel(projectName || 'Manual Import', 'manual');

  // Try to extract any numeric values that look like area
  const areaMatch = rawText.match(/([\d,]+)\s*(?:sq\.?\s*ft|sf|square\s*feet)/i);
  if (areaMatch) model.totalAreaSqFt = parseFloat(areaMatch[1].replace(/,/g, ''));

  model.facets = createSimpleRectangularFacets(model.totalAreaSqFt || 2000);

  return model;
}

// ---- Helpers ----

function createEmptyModel(name: string, source: ReportSource): RoofModel {
  return {
    id: `rm_${Date.now()}`,
    projectName: name,
    address: '',
    source,
    totalAreaSqFt: 0,
    facets: [],
    createdAt: new Date().toISOString(),
  };
}

/**
 * Extract facet data from structured report text.
 * Looks for patterns like:
 *   Facet 1: 450 sq ft, 6/12 pitch
 *   Facet A - Area: 320 SF, Pitch: 4/12
 */
function extractFacets(rawText: string): RoofFacet[] {
  const facets: RoofFacet[] = [];
  const facetPattern = /(?:facet|plane|section|face)\s*[#]?\s*(\w+)[:\s\-].*?([\d,]+)\s*(?:sq\.?\s*ft|sf).*?(\d+)\s*[/]\s*12/gi;

  let match;
  let index = 0;

  while ((match = facetPattern.exec(rawText)) !== null) {
    const label = match[1];
    const area = parseFloat(match[2].replace(/,/g, ''));
    const pitchRise = parseInt(match[3], 10);
    const pitchDegrees = Math.atan(pitchRise / 12) * (180 / Math.PI);

    // Create a rectangular approximation of the facet
    const sideLength = Math.sqrt(area);
    const vertices: Point2D[] = [
      { x: index * (sideLength + 5), y: 0 },
      { x: index * (sideLength + 5) + sideLength, y: 0 },
      { x: index * (sideLength + 5) + sideLength, y: sideLength },
      { x: index * (sideLength + 5), y: sideLength },
    ];

    const edges = createEdgesFromVertices(vertices, `f${index}`);

    facets.push({
      id: `f${index}`,
      label: `Facet ${label}`,
      vertices,
      pitchRatio: `${pitchRise}/12`,
      pitchDegrees,
      areaSquareFeet: area,
      slopeAreaSquareFeet: area / Math.cos(pitchDegrees * (Math.PI / 180)),
      edgeTypes: edges,
    });

    index++;
  }

  // Also try to extract edge lengths from the report
  parseEdgeLengths(rawText, facets);

  return facets;
}

/**
 * Try to parse edge/measurement lengths from the report.
 */
function parseEdgeLengths(rawText: string, facets: RoofFacet[]): void {
  const edgePatterns: { pattern: RegExp; type: EdgeType }[] = [
    { pattern: /ridge[s]?\s*[:\s]*([\d.]+)\s*(?:ft|feet|')/gi, type: 'ridge' },
    { pattern: /hip[s]?\s*[:\s]*([\d.]+)\s*(?:ft|feet|')/gi, type: 'hip' },
    { pattern: /valley[s]?\s*[:\s]*([\d.]+)\s*(?:ft|feet|')/gi, type: 'valley' },
    { pattern: /eave[s]?\s*[:\s]*([\d.]+)\s*(?:ft|feet|')/gi, type: 'eave' },
    { pattern: /rake[s]?\s*[:\s]*([\d.]+)\s*(?:ft|feet|')/gi, type: 'rake' },
  ];

  // If we have at least one facet, attach parsed edges to it
  if (facets.length > 0) {
    for (const { pattern, type } of edgePatterns) {
      let match;
      while ((match = pattern.exec(rawText)) !== null) {
        const length = parseFloat(match[1]);
        if (length > 0) {
          facets[0].edgeTypes.push({
            id: `edge_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            start: { x: 0, y: 0 },
            end: { x: length, y: 0 },
            lengthFeet: length,
            type,
          });
        }
      }
    }
  }
}

/**
 * Create a simple rectangular roof from total area.
 * Assumes a basic gable roof with 2 facets.
 */
function createSimpleRectangularFacets(totalAreaSqFt: number): RoofFacet[] {
  const halfArea = totalAreaSqFt / 2;
  const width = Math.sqrt(halfArea * 1.5);   // wider than deep
  const depth = halfArea / width;

  const facets: RoofFacet[] = [];

  for (let i = 0; i < 2; i++) {
    const offsetY = i * (depth + 2);
    const vertices: Point2D[] = [
      { x: 0, y: offsetY },
      { x: width, y: offsetY },
      { x: width, y: offsetY + depth },
      { x: 0, y: offsetY + depth },
    ];

    const edges = createEdgesFromVertices(vertices, `f${i}`);

    // Assign edge types based on position
    if (edges.length >= 4) {
      edges[0].type = i === 0 ? 'eave' : 'ridge';   // bottom
      edges[1].type = 'rake';                         // right
      edges[2].type = i === 0 ? 'ridge' : 'eave';   // top
      edges[3].type = 'rake';                         // left
    }

    facets.push({
      id: `f${i}`,
      label: `Facet ${i + 1} (${i === 0 ? 'Front' : 'Back'})`,
      vertices,
      pitchRatio: '6/12',
      pitchDegrees: 26.57,
      areaSquareFeet: halfArea,
      slopeAreaSquareFeet: halfArea / Math.cos(26.57 * (Math.PI / 180)),
      edgeTypes: edges,
    });
  }

  return facets;
}

function createEdgesFromVertices(vertices: Point2D[], facetId: string): FacetEdge[] {
  const edges: FacetEdge[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const start = vertices[i];
    const end = vertices[(i + 1) % vertices.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    edges.push({
      id: `${facetId}_e${i}`,
      start,
      end,
      lengthFeet: length,
      type: 'eave', // default, will be overridden
    });
  }
  return edges;
}
