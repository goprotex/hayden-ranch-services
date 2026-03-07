// ============================================================
// Comprehensive Fencing Material Catalog & Default Pricing
// ============================================================

export type PostMaterial = 'drill_stem' | 'square_tube';
export type BraceType = 'h_brace' | 'corner_brace' | 'n_brace' | 'double_h';
export type GateSize = '4ft' | '6ft' | '8ft' | '10ft' | '12ft' | '16ft';

// ── Post Material Specifications ──
export interface PostSpec {
  id: PostMaterial;
  label: string;
  diameter: string;
  weightPerFoot: number;
  defaultPricePerFoot: number;
}

export const POST_MATERIALS: PostSpec[] = [
  { id: 'drill_stem', label: 'Drill Stem (2-3/8" OD)', diameter: '2-3/8" OD', weightPerFoot: 4.7, defaultPricePerFoot: 3.50 },
  { id: 'square_tube', label: '2" Square Tube', diameter: '2" x 2" x 14ga', weightPerFoot: 3.2, defaultPricePerFoot: 2.85 },
];

// ── Brace Specifications ──
export interface BraceSpec {
  id: BraceType;
  label: string;
  description: string;
  postsRequired: number;
  railsRequired: number;
  braceWire: boolean;
  concreteBags: number;
  angleThreshold: { min: number; max: number };
}

export const BRACE_SPECS: BraceSpec[] = [
  {
    id: 'h_brace', label: 'H-Brace',
    description: 'Standard H-brace for end posts and slight direction changes (10-25° bends)',
    postsRequired: 2, railsRequired: 1, braceWire: true, concreteBags: 4,
    angleThreshold: { min: 10, max: 25 },
  },
  {
    id: 'corner_brace', label: 'Corner Brace',
    description: 'Full corner brace assembly for significant direction changes (25-120° bends)',
    postsRequired: 3, railsRequired: 2, braceWire: true, concreteBags: 6,
    angleThreshold: { min: 25, max: 120 },
  },
  {
    id: 'n_brace', label: 'N-Brace',
    description: 'N-brace for moderate angles with cross-bracing (15-30° bends)',
    postsRequired: 2, railsRequired: 2, braceWire: true, concreteBags: 4,
    angleThreshold: { min: 15, max: 30 },
  },
  {
    id: 'double_h', label: 'Double H-Brace',
    description: 'Heavy duty double H-brace for high tension lines and gate posts',
    postsRequired: 3, railsRequired: 2, braceWire: true, concreteBags: 6,
    angleThreshold: { min: 0, max: 180 },
  },
];

// ── Gate Specifications ──
export interface GateSpec {
  size: GateSize;
  widthFeet: number;
  label: string;
  type: 'walk' | 'ranch' | 'truck' | 'equipment';
  hardware: GateHardware[];
  defaultPrice: number;
  defaultInstallCost: number;
}

export interface GateHardware {
  name: string;
  quantity: number;
  defaultUnitPrice: number;
}

export const GATE_SPECS: GateSpec[] = [
  {
    size: '4ft', widthFeet: 4, label: "4' Walk Gate", type: 'walk',
    hardware: [
      { name: "4' gate frame (welded tube)", quantity: 1, defaultUnitPrice: 85 },
      { name: 'Heavy duty hinges (pair)', quantity: 1, defaultUnitPrice: 35 },
      { name: 'Gate latch', quantity: 1, defaultUnitPrice: 22 },
      { name: "Hinge post (drill stem 8')", quantity: 2, defaultUnitPrice: 30 },
      { name: 'Concrete (80lb bags)', quantity: 4, defaultUnitPrice: 7 },
      { name: 'H-brace assembly', quantity: 2, defaultUnitPrice: 45 },
    ],
    defaultPrice: 420, defaultInstallCost: 250,
  },
  {
    size: '6ft', widthFeet: 6, label: "6' Walk Gate", type: 'walk',
    hardware: [
      { name: "6' gate frame (welded tube)", quantity: 1, defaultUnitPrice: 110 },
      { name: 'Heavy duty hinges (pair)', quantity: 1, defaultUnitPrice: 35 },
      { name: 'Gate latch', quantity: 1, defaultUnitPrice: 22 },
      { name: 'Spring closer', quantity: 1, defaultUnitPrice: 18 },
      { name: "Hinge post (drill stem 8')", quantity: 2, defaultUnitPrice: 30 },
      { name: 'Concrete (80lb bags)', quantity: 4, defaultUnitPrice: 7 },
      { name: 'H-brace assembly', quantity: 2, defaultUnitPrice: 45 },
    ],
    defaultPrice: 520, defaultInstallCost: 300,
  },
  {
    size: '8ft', widthFeet: 8, label: "8' Ranch Gate", type: 'ranch',
    hardware: [
      { name: "8' gate frame (welded tube)", quantity: 1, defaultUnitPrice: 165 },
      { name: 'Heavy duty barrel hinges', quantity: 2, defaultUnitPrice: 28 },
      { name: 'Chain latch set', quantity: 1, defaultUnitPrice: 25 },
      { name: "Hinge post (drill stem 10')", quantity: 2, defaultUnitPrice: 38 },
      { name: 'Concrete (80lb bags)', quantity: 6, defaultUnitPrice: 7 },
      { name: 'H-brace assembly', quantity: 2, defaultUnitPrice: 55 },
    ],
    defaultPrice: 650, defaultInstallCost: 400,
  },
  {
    size: '10ft', widthFeet: 10, label: "10' Ranch Gate", type: 'ranch',
    hardware: [
      { name: "10' gate frame (welded tube)", quantity: 1, defaultUnitPrice: 220 },
      { name: 'Heavy duty barrel hinges', quantity: 2, defaultUnitPrice: 28 },
      { name: 'Chain latch set', quantity: 1, defaultUnitPrice: 25 },
      { name: 'Wheel kit', quantity: 1, defaultUnitPrice: 35 },
      { name: "Hinge post (drill stem 10')", quantity: 2, defaultUnitPrice: 38 },
      { name: 'Concrete (80lb bags)', quantity: 6, defaultUnitPrice: 7 },
      { name: 'Double H-brace assembly', quantity: 2, defaultUnitPrice: 85 },
    ],
    defaultPrice: 850, defaultInstallCost: 500,
  },
  {
    size: '12ft', widthFeet: 12, label: "12' Truck Gate", type: 'truck',
    hardware: [
      { name: "12' gate frame (welded tube)", quantity: 1, defaultUnitPrice: 285 },
      { name: 'Heavy duty barrel hinges', quantity: 3, defaultUnitPrice: 28 },
      { name: 'Chain latch set w/ keeper', quantity: 1, defaultUnitPrice: 30 },
      { name: 'Wheel kit (heavy duty)', quantity: 1, defaultUnitPrice: 45 },
      { name: "Hinge post (drill stem 10')", quantity: 2, defaultUnitPrice: 38 },
      { name: 'Concrete (80lb bags)', quantity: 8, defaultUnitPrice: 7 },
      { name: 'Double H-brace assembly', quantity: 2, defaultUnitPrice: 85 },
    ],
    defaultPrice: 1050, defaultInstallCost: 600,
  },
  {
    size: '16ft', widthFeet: 16, label: "16' Equipment Gate", type: 'equipment',
    hardware: [
      { name: "16' gate frame (cross-braced tube)", quantity: 1, defaultUnitPrice: 420 },
      { name: 'Heavy duty barrel hinges', quantity: 3, defaultUnitPrice: 35 },
      { name: 'Chain latch set w/ keeper', quantity: 1, defaultUnitPrice: 30 },
      { name: 'Heavy duty wheel kit', quantity: 1, defaultUnitPrice: 65 },
      { name: 'Gate stop/catcher', quantity: 1, defaultUnitPrice: 20 },
      { name: "Hinge post (drill stem 10')", quantity: 2, defaultUnitPrice: 45 },
      { name: 'Concrete (80lb bags)', quantity: 10, defaultUnitPrice: 7 },
      { name: 'Double H-brace assembly', quantity: 2, defaultUnitPrice: 100 },
    ],
    defaultPrice: 1450, defaultInstallCost: 800,
  },
];

// ── Default Material Prices ──
export interface MaterialPrice {
  id: string;
  category: string;
  name: string;
  unit: string;
  defaultPrice: number;
  price: number;
}

export const DEFAULT_MATERIAL_PRICES: MaterialPrice[] = [
  { id: 'drill_stem_8', category: 'Posts', name: "Drill Stem 8' (2-3/8\" OD)", unit: 'each', defaultPrice: 28, price: 28 },
  { id: 'drill_stem_10', category: 'Posts', name: "Drill Stem 10' (2-3/8\" OD)", unit: 'each', defaultPrice: 35, price: 35 },
  { id: 'square_tube_8', category: 'Posts', name: "2\" Square Tube 8'", unit: 'each', defaultPrice: 23, price: 23 },
  { id: 'square_tube_10', category: 'Posts', name: "2\" Square Tube 10'", unit: 'each', defaultPrice: 29, price: 29 },
  { id: 't_post_6', category: 'Posts', name: "T-Post 6' (1.25 lb/ft)", unit: 'each', defaultPrice: 7.50, price: 7.50 },
  { id: 't_post_7', category: 'Posts', name: "T-Post 7' (1.33 lb/ft)", unit: 'each', defaultPrice: 8.50, price: 8.50 },
  { id: 't_post_8', category: 'Posts', name: "T-Post 8' (1.33 lb/ft)", unit: 'each', defaultPrice: 10.00, price: 10.00 },
  { id: 'stay_tuff_roll', category: 'Wire', name: "Stay-Tuff Field Fence (330' roll)", unit: 'roll', defaultPrice: 385, price: 385 },
  { id: 'field_fence_roll', category: 'Wire', name: "Field Fence Wire (330' roll)", unit: 'roll', defaultPrice: 185, price: 185 },
  { id: 'barbed_wire', category: 'Wire', name: "Barbed Wire (1320' roll)", unit: 'roll', defaultPrice: 95, price: 95 },
  { id: 'no_climb_roll', category: 'Wire', name: "No-Climb Horse Fence (200' roll)", unit: 'roll', defaultPrice: 280, price: 280 },
  { id: 'ht_smooth', category: 'Wire', name: "12.5ga HT Smooth Wire (4000' roll)", unit: 'roll', defaultPrice: 110, price: 110 },
  { id: 'brace_wire', category: 'Wire', name: "9ga Brace Wire (100' coil)", unit: 'coil', defaultPrice: 18, price: 18 },
  { id: 'clips_100', category: 'Hardware', name: 'Fence Clips (bag of 100)', unit: 'bag', defaultPrice: 14, price: 14 },
  { id: 'concrete_80', category: 'Hardware', name: 'Concrete 80 lb bag', unit: 'bag', defaultPrice: 7, price: 7 },
  { id: 'tensioner', category: 'Hardware', name: 'Wire Tensioner / Strainer', unit: 'each', defaultPrice: 12, price: 12 },
  { id: 'brace_pin', category: 'Hardware', name: 'Steel Brace Pin', unit: 'each', defaultPrice: 8, price: 8 },
  { id: 'crimp_sleeve', category: 'Hardware', name: 'Crimp Sleeves (bag of 50)', unit: 'bag', defaultPrice: 15, price: 15 },
  { id: 'paint_gallon', category: 'Paint', name: 'Metal Paint / Primer (gallon)', unit: 'gallon', defaultPrice: 45, price: 45 },
  { id: 'paint_labor_post', category: 'Paint', name: 'Paint Labor (per post)', unit: 'each', defaultPrice: 8, price: 8 },
  { id: 'paint_labor_gate', category: 'Paint', name: 'Paint Labor (per gate)', unit: 'each', defaultPrice: 45, price: 45 },
  { id: 'paint_labor_brace', category: 'Paint', name: 'Paint Labor (per brace)', unit: 'each', defaultPrice: 15, price: 15 },
];

// ── Painting Calculator ──
export interface PaintEstimate {
  gallonsNeeded: number;
  laborCost: number;
  materialCost: number;
  totalCost: number;
  details: string;
}

export function estimatePainting(
  linePostCount: number,
  braceCount: number,
  gateCount: number,
  paintPricePerGallon: number = 45,
  paintLaborPerPost: number = 8,
  paintLaborPerBrace: number = 15,
  paintLaborPerGate: number = 45,
): PaintEstimate {
  const postGallons = linePostCount * 0.15;
  const braceGallons = braceCount * 0.3;
  const gateGallons = gateCount * 0.5;
  const totalGallons = Math.ceil(postGallons + braceGallons + gateGallons);
  const materialCost = totalGallons * paintPricePerGallon;
  const laborCost = (linePostCount * paintLaborPerPost) + (braceCount * paintLaborPerBrace) + (gateCount * paintLaborPerGate);
  return {
    gallonsNeeded: totalGallons,
    laborCost,
    materialCost,
    totalCost: materialCost + laborCost,
    details: `Paint: ${totalGallons} gal for ${linePostCount} posts, ${braceCount} braces, ${gateCount} gates`,
  };
}

// ── Angle-Based Brace Determination ──
export interface BraceRecommendation {
  type: BraceType;
  reason: string;
  angleDegrees: number;
}

export function determineBraceType(
  angleDegrees: number,
  preferredCornerBrace: BraceType = 'corner_brace',
  preferredHBrace: BraceType = 'h_brace',
): BraceRecommendation | null {
  const deviation = Math.abs(180 - angleDegrees);
  if (deviation < 10) return null;
  if (deviation >= 10 && deviation < 25) {
    return {
      type: preferredHBrace,
      reason: `Slight bend (${deviation.toFixed(0)}° deviation) - H-brace recommended`,
      angleDegrees: deviation,
    };
  }
  return {
    type: preferredCornerBrace,
    reason: `${deviation >= 60 ? "Major" : "Moderate"} bend (${deviation.toFixed(0)}° deviation) - corner brace required`,
    angleDegrees: deviation,
  };
}

export function calculateVertexAngle(
  prev: [number, number],
  current: [number, number],
  next: [number, number],
): number {
  const v1 = [prev[0] - current[0], prev[1] - current[1]];
  const v2 = [next[0] - current[0], next[1] - current[1]];
  const dot = v1[0] * v2[0] + v1[1] * v2[1];
  const mag1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2);
  const mag2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2);
  if (mag1 === 0 || mag2 === 0) return 180;
  const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}