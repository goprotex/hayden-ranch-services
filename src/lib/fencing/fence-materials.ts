// ============================================================
// Comprehensive Fencing Material Catalog & Default Pricing
// ============================================================

export type PostMaterial = 'drill_stem' | 'square_tube';
export type SquareTubeGauge = '14ga' | '12ga' | '11ga';
export type BraceType = 'h_brace' | 'corner_brace' | 'n_brace' | 'double_h';
export type GateSize = '4ft' | '6ft' | '8ft' | '10ft' | '12ft' | '16ft';

// -- Post Material Specifications --
export interface PostSpec {
  id: PostMaterial;
  label: string;
  diameter: string;
  weightPerFoot: number;
  defaultPricePerFoot: number;
  jointLengthFeet: number;
}

export const POST_MATERIALS: PostSpec[] = [
  { id: 'drill_stem', label: 'Drill Stem (2-3/8" OD)', diameter: '2-3/8" OD',
    weightPerFoot: 4.7, defaultPricePerFoot: 3.50, jointLengthFeet: 31 },
  { id: 'square_tube', label: '2" Square Tube', diameter: '2" x 2"',
    weightPerFoot: 3.2, defaultPricePerFoot: 2.85, jointLengthFeet: 20 },
];

// -- Square tube gauge pricing (per 20 ft joint) --
export interface GaugeOption {
  gauge: SquareTubeGauge;
  label: string;
  pricePerFoot: number;
  pricePerJoint: number;
  wallThickness: string;
}

export const SQUARE_TUBE_GAUGES: GaugeOption[] = [
  { gauge: '14ga', label: '14 Gauge (0.075")', pricePerFoot: 2.85, pricePerJoint: 57, wallThickness: '0.075"' },
  { gauge: '12ga', label: '12 Gauge (0.105")', pricePerFoot: 3.50, pricePerJoint: 70, wallThickness: '0.105"' },
  { gauge: '11ga', label: '11 Gauge (0.120")', pricePerFoot: 4.25, pricePerJoint: 85, wallThickness: '0.120"' },
];

// -- Post length calculator based on wire / fence height --
export interface PostLengthCalc {
  wireHeightInches: number;
  aboveGroundFeet: number;
  belowGroundFeet: number;
  totalLengthFeet: number;
  postsPerDrillStemJoint: number;
  postsPerSquareTubeJoint: number;
}

export function calculatePostLength(wireHeightInches: number): PostLengthCalc {
  const aboveGround = (wireHeightInches + 3) / 12;
  const belowGround = wireHeightInches <= 60 ? 2.5 : wireHeightInches <= 72 ? 3.0 : 3.5;
  const total = Math.ceil((aboveGround + belowGround) * 2) / 2;
  return {
    wireHeightInches,
    aboveGroundFeet: Math.round(aboveGround * 10) / 10,
    belowGroundFeet: belowGround,
    totalLengthFeet: total,
    postsPerDrillStemJoint: Math.floor(31 / total),
    postsPerSquareTubeJoint: Math.floor(20 / total),
  };
}

// -- T-Post sizing based on wire height --
export function recommendedTPostLength(wireHeightInches: number): { lengthFeet: number; label: string; priceId: string } {
  if (wireHeightInches <= 49) return { lengthFeet: 6, label: "6' T-Post", priceId: 't_post_6' };
  if (wireHeightInches <= 60) return { lengthFeet: 7, label: "7' T-Post", priceId: 't_post_7' };
  if (wireHeightInches <= 72) return { lengthFeet: 8, label: "8' T-Post", priceId: 't_post_8' };
  return { lengthFeet: 10, label: "10' T-Post", priceId: 't_post_10' };
}
// -- Brace Specifications --
export interface BraceSpec {
  id: BraceType;
  label: string;
  description: string;
  postsRequired: number;
  railsRequired: number;
  weldedDiagonal: boolean;
  concreteBags: number;
  angleThreshold: { min: number; max: number };
}

export const BRACE_SPECS: BraceSpec[] = [
  { id: 'h_brace', label: 'H-Brace',
    description: 'Standard H-brace for end posts, gate posts, and moderate direction changes (15-75° deviation from straight)',
    postsRequired: 2, railsRequired: 1, weldedDiagonal: true, concreteBags: 4,
    angleThreshold: { min: 15, max: 75 } },
  { id: 'corner_brace', label: 'Corner Brace',
    description: 'Double H-brace assembly (two H-braces sharing a center post) for sharp direction changes (>75° deviation from straight)',
    postsRequired: 3, railsRequired: 2, weldedDiagonal: true, concreteBags: 6,
    angleThreshold: { min: 75, max: 180 } },
  { id: 'n_brace', label: 'N-Brace',
    description: 'N-brace with cross-bracing for moderate angles (15-45° deviation)',
    postsRequired: 2, railsRequired: 2, weldedDiagonal: true, concreteBags: 4,
    angleThreshold: { min: 15, max: 45 } },
  { id: 'double_h', label: 'Double H-Brace',
    description: 'Heavy duty double H-brace for high-tension end posts and large gate openings',
    postsRequired: 3, railsRequired: 2, weldedDiagonal: true, concreteBags: 6,
    angleThreshold: { min: 0, max: 180 } },
];

// -- BraceRecommendation (returned from determineBraceType) --
export interface BraceRecommendation {
  type: BraceType;
  label: string;
  angleDegrees: number;
  spec: BraceSpec;
}

// -- Gate Specifications --
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
  { size: '4ft', widthFeet: 4, label: "4' Walk Gate", type: 'walk',
    hardware: [
      { name: "4' gate frame (welded tube)", quantity: 1, defaultUnitPrice: 85 },
      { name: 'Heavy duty hinges (pair)', quantity: 1, defaultUnitPrice: 35 },
      { name: 'Gate latch', quantity: 1, defaultUnitPrice: 22 },
      { name: "Hinge post (drill stem 8')", quantity: 2, defaultUnitPrice: 30 },
      { name: 'Concrete (80lb bags)', quantity: 4, defaultUnitPrice: 7 },
      { name: 'H-brace assembly', quantity: 2, defaultUnitPrice: 45 },
    ], defaultPrice: 420, defaultInstallCost: 250 },
  { size: '6ft', widthFeet: 6, label: "6' Walk Gate", type: 'walk',
    hardware: [
      { name: "6' gate frame (welded tube)", quantity: 1, defaultUnitPrice: 110 },
      { name: 'Heavy duty hinges (pair)', quantity: 1, defaultUnitPrice: 35 },
      { name: 'Gate latch', quantity: 1, defaultUnitPrice: 22 },
      { name: 'Spring closer', quantity: 1, defaultUnitPrice: 18 },
      { name: "Hinge post (drill stem 8')", quantity: 2, defaultUnitPrice: 30 },
      { name: 'Concrete (80lb bags)', quantity: 4, defaultUnitPrice: 7 },
      { name: 'H-brace assembly', quantity: 2, defaultUnitPrice: 45 },
    ], defaultPrice: 520, defaultInstallCost: 300 },
  { size: '8ft', widthFeet: 8, label: "8' Ranch Gate", type: 'ranch',
    hardware: [
      { name: "8' gate frame (welded tube)", quantity: 1, defaultUnitPrice: 165 },
      { name: 'Heavy duty barrel hinges', quantity: 2, defaultUnitPrice: 28 },
      { name: 'Chain latch set', quantity: 1, defaultUnitPrice: 25 },
      { name: "Hinge post (drill stem 10')", quantity: 2, defaultUnitPrice: 38 },
      { name: 'Concrete (80lb bags)', quantity: 6, defaultUnitPrice: 7 },
      { name: 'H-brace assembly', quantity: 2, defaultUnitPrice: 55 },
    ], defaultPrice: 650, defaultInstallCost: 400 },
  { size: '10ft', widthFeet: 10, label: "10' Ranch Gate", type: 'ranch',
    hardware: [
      { name: "10' gate frame (welded tube)", quantity: 1, defaultUnitPrice: 220 },
      { name: 'Heavy duty barrel hinges', quantity: 2, defaultUnitPrice: 28 },
      { name: 'Chain latch set', quantity: 1, defaultUnitPrice: 25 },
      { name: 'Wheel kit', quantity: 1, defaultUnitPrice: 35 },
      { name: "Hinge post (drill stem 10')", quantity: 2, defaultUnitPrice: 38 },
      { name: 'Concrete (80lb bags)', quantity: 6, defaultUnitPrice: 7 },
      { name: 'Double H-brace assembly', quantity: 2, defaultUnitPrice: 85 },
    ], defaultPrice: 850, defaultInstallCost: 500 },
  { size: '12ft', widthFeet: 12, label: "12' Truck Gate", type: 'truck',
    hardware: [
      { name: "12' gate frame (welded tube)", quantity: 1, defaultUnitPrice: 285 },
      { name: 'Heavy duty barrel hinges', quantity: 3, defaultUnitPrice: 28 },
      { name: 'Chain latch set w/ keeper', quantity: 1, defaultUnitPrice: 30 },
      { name: 'Wheel kit (heavy duty)', quantity: 1, defaultUnitPrice: 45 },
      { name: "Hinge post (drill stem 10')", quantity: 2, defaultUnitPrice: 38 },
      { name: 'Concrete (80lb bags)', quantity: 8, defaultUnitPrice: 7 },
      { name: 'Double H-brace assembly', quantity: 2, defaultUnitPrice: 85 },
    ], defaultPrice: 1050, defaultInstallCost: 600 },
  { size: '16ft', widthFeet: 16, label: "16' Equipment Gate", type: 'equipment',
    hardware: [
      { name: "16' gate frame (cross-braced tube)", quantity: 1, defaultUnitPrice: 420 },
      { name: 'Heavy duty barrel hinges', quantity: 3, defaultUnitPrice: 35 },
      { name: 'Chain latch set w/ keeper', quantity: 1, defaultUnitPrice: 30 },
      { name: 'Heavy duty wheel kit', quantity: 1, defaultUnitPrice: 65 },
      { name: 'Gate stop/catcher', quantity: 1, defaultUnitPrice: 20 },
      { name: "Hinge post (drill stem 10')", quantity: 2, defaultUnitPrice: 45 },
      { name: 'Concrete (80lb bags)', quantity: 10, defaultUnitPrice: 7 },
      { name: 'Double H-brace assembly', quantity: 2, defaultUnitPrice: 100 },
    ], defaultPrice: 1450, defaultInstallCost: 800 },
];
// -- Material Prices --
// Interface matches store shape: name + price + defaultPrice
export interface MaterialPrice {
  id: string;
  category: string;
  name: string;
  unit: string;
  price: number;
  defaultPrice: number;
}

export const DEFAULT_MATERIAL_PRICES: MaterialPrice[] = [
  // Posts - drill stem (31ft joints)
  { id: 'drill_stem_31', category: 'Posts', name: "Drill Stem (2-3/8\" OD) \u2014 31' joint", unit: 'joint', price: 110, defaultPrice: 110 },
  // Posts - square tube (20ft joints) by gauge
  { id: 'square_tube_20_14ga', category: 'Posts', name: "2\" Square Tube 14ga \u2014 20' joint", unit: 'joint', price: 57, defaultPrice: 57 },
  { id: 'square_tube_20_12ga', category: 'Posts', name: "2\" Square Tube 12ga \u2014 20' joint", unit: 'joint', price: 70, defaultPrice: 70 },
  { id: 'square_tube_20_11ga', category: 'Posts', name: "2\" Square Tube 11ga \u2014 20' joint", unit: 'joint', price: 85, defaultPrice: 85 },
  // T-Posts
  { id: 't_post_6', category: 'Posts', name: "T-Post 6' (1.33 lb/ft)", unit: 'each', price: 9.50, defaultPrice: 9.50 },
  { id: 't_post_7', category: 'Posts', name: "T-Post 7' (1.33 lb/ft)", unit: 'each', price: 11.00, defaultPrice: 11.00 },
  { id: 't_post_8', category: 'Posts', name: "T-Post 8' (1.33 lb/ft)", unit: 'each', price: 13.00, defaultPrice: 13.00 },
  { id: 't_post_10', category: 'Posts', name: "T-Post 10' (1.33 lb/ft)", unit: 'each', price: 17.00, defaultPrice: 17.00 },
  // Wire - Stay-Tuff by product height
  { id: 'stay_tuff_49', category: 'Wire', name: "Stay-Tuff 49\" (330' roll)", unit: 'roll', price: 385, defaultPrice: 385 },
  { id: 'stay_tuff_60', category: 'Wire', name: "Stay-Tuff 60\" (330' roll)", unit: 'roll', price: 450, defaultPrice: 450 },
  { id: 'stay_tuff_72', category: 'Wire', name: "Stay-Tuff 72\" (330' roll)", unit: 'roll', price: 525, defaultPrice: 525 },
  { id: 'stay_tuff_96', category: 'Wire', name: "Stay-Tuff 96\" (330' roll)", unit: 'roll', price: 685, defaultPrice: 685 },
  // Wire - Other
  { id: 'field_fence_roll', category: 'Wire', name: "Field Fence (330' roll)", unit: 'roll', price: 180, defaultPrice: 180 },
  { id: 'barbed_wire', category: 'Wire', name: "Barbed Wire (1320' roll)", unit: 'roll', price: 95, defaultPrice: 95 },
  { id: 'no_climb_roll', category: 'Wire', name: "No-Climb Horse Fence (200' roll)", unit: 'roll', price: 320, defaultPrice: 320 },
  { id: 'ht_smooth', category: 'Wire', name: "High Tensile Smooth (4000' roll)", unit: 'roll', price: 110, defaultPrice: 110 },
  // Brace & Hardware
  { id: 'clips', category: 'Hardware', name: 'Fence Clips/Staples (box of 500)', unit: 'box', price: 45, defaultPrice: 45 },
  { id: 'concrete_bag', category: 'Hardware', name: 'Concrete Mix (80 lb bag)', unit: 'bag', price: 7, defaultPrice: 7 },
  { id: 'tensioner', category: 'Hardware', name: 'Inline Wire Tensioner', unit: 'each', price: 12, defaultPrice: 12 },
  // Paint & Coatings
  { id: 'paint_posts', category: 'Paint', name: 'Post Paint (covers ~20 posts)', unit: 'gallon', price: 45, defaultPrice: 45 },
  { id: 'paint_gates', category: 'Paint', name: 'Gate Paint / Primer', unit: 'quart', price: 22, defaultPrice: 22 },
  { id: 'paint_labor', category: 'Paint', name: 'Painting Labor', unit: 'per post', price: 8, defaultPrice: 8 },
];

/** Look up a material price by id */
export function getMaterialPrice(id: string, prices?: MaterialPrice[]): number {
  const list = prices ?? DEFAULT_MATERIAL_PRICES;
  const item = list.find((p) => p.id === id);
  return item?.price ?? item?.defaultPrice ?? 0;
}

/** Get the wire price id for a Stay-Tuff product by its height in inches */
export function wireRollPriceId(heightInches: number): string {
  if (heightInches <= 49) return 'stay_tuff_49';
  if (heightInches <= 60) return 'stay_tuff_60';
  if (heightInches <= 72) return 'stay_tuff_72';
  return 'stay_tuff_96';
}

/** Get the post price id based on material and optional gauge */
export function postJointPriceId(material: PostMaterial, gauge?: SquareTubeGauge): string {
  if (material === 'drill_stem') return 'drill_stem_31';
  return `square_tube_20_${gauge ?? '14ga'}`;
}
// -- Utility Functions --

/** Estimate painting cost for posts and gates */
export function estimatePainting(
  postCount: number,
  _braceCount: number,
  gateCount: number,
  prices?: MaterialPrice[],
): { totalCost: number; gallonsNeeded: number; materialCost: number; laborCost: number } {
  const list = prices ?? DEFAULT_MATERIAL_PRICES;
  const postsPerGallon = 20;
  const gallonsNeeded = Math.ceil(postCount / postsPerGallon);
  const materialCost = gallonsNeeded * getMaterialPrice('paint_posts', list)
    + Math.ceil(gateCount * 0.5) * getMaterialPrice('paint_gates', list);
  const laborCost = postCount * getMaterialPrice('paint_labor', list);
  return { totalCost: materialCost + laborCost, gallonsNeeded, materialCost, laborCost };
}

/**
 * Determine the best brace type for a given vertex angle.
 * `angleDegrees` is the INTERIOR angle at the vertex (180° = straight line, 90° = right angle, 0° = U-turn).
 * Deviation from straight = 180 - angleDegrees.
 *
 * Rules (per user's real-world practice):
 * - deviation < 15°  (angle > 165°)  → no brace needed (nearly straight)
 * - deviation 15-75° (angle 105-165°) → H-brace
 * - deviation > 75°  (angle < 105°)  → Corner brace (two H-braces sharing a center post)
 */
export function determineBraceType(
  angleDegrees: number,
  preferredCornerBrace?: BraceType,
  preferredHBrace?: BraceType,
): BraceRecommendation | null {
  const deviation = 180 - angleDegrees;

  // Nearly straight — no brace needed
  if (deviation < 15) return null;

  let spec: BraceSpec;

  if (deviation >= 75) {
    // Sharp bend (>75° from straight) → corner brace (= two H-braces together)
    const preferred = preferredCornerBrace ?? 'corner_brace';
    spec = BRACE_SPECS.find(b => b.id === preferred) ?? BRACE_SPECS.find(b => b.id === 'corner_brace')!;
  } else {
    // Moderate bend (15-75° from straight) → H-brace
    const preferred = preferredHBrace ?? 'h_brace';
    spec = BRACE_SPECS.find(b => b.id === preferred) ?? BRACE_SPECS.find(b => b.id === 'h_brace')!;
  }

  return { type: spec.id, label: spec.label, angleDegrees, spec };
}

/** Calculate the angle (in degrees) at a vertex given three sequential points */
type Coord = { lng: number; lat: number } | [number, number];
function toLngLat(c: Coord): { lng: number; lat: number } {
  return Array.isArray(c) ? { lng: c[0], lat: c[1] } : c;
}

export function calculateVertexAngle(
  prev: Coord,
  vertex: Coord,
  next: Coord,
): number {
  const p = toLngLat(prev), v = toLngLat(vertex), n = toLngLat(next);
  const v1 = { x: p.lng - v.lng, y: p.lat - v.lat };
  const v2 = { x: n.lng - v.lng, y: n.lat - v.lat };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const cross = v1.x * v2.y - v1.y * v2.x;
  const angle = Math.atan2(Math.abs(cross), dot);
  return angle * (180 / Math.PI);
}