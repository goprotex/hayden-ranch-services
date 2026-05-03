// ============================================================
// Comprehensive Fencing Material Catalog & Default Pricing
// ============================================================

export type PostMaterial = 'drill_stem_238' | 'drill_stem_278' | 'round_pipe_250' | 'square_2' | 'square_3' | 'square_4';
export type SquareTubeGauge = '16ga' | '14ga' | '11ga';
export type BraceType = 'h_brace' | 'corner_brace' | 'n_brace' | 'double_h';
export type GateSize = '4ft' | '6ft' | '8ft' | '10ft' | '12ft' | '16ft';
export type BarbedWireType = '2_point' | '4_point';
export type TiePattern = 'every_strand' | 'every_other' | 'four_per_post';

// -- Pipe Fence types --
/** "continuous" = one long top rail welded ACROSS post tops (post tops hidden under rail).
 *  "caps"       = all rails (incl. top) butt-welded BETWEEN posts; post tops stick up & get caps. */
export type PipeTopRailStyle = 'continuous' | 'caps';
/** Painted = sprayed with paint of `pipeFinishColor`. Bare = left raw, will rust naturally. */
export type PipeFinish = 'painted' | 'bare';

// -- Post Material Specifications --
export interface PostSpec {
  id: PostMaterial;
  label: string;
  diameter: string;
  weightPerFoot: number;
  defaultPricePerFoot: number;
  jointLengthFeet: number;
  shape: 'round' | 'square';
  gaugeOptions?: SquareTubeGauge[];
}

export const POST_MATERIALS: PostSpec[] = [
  { id: 'drill_stem_238', label: '2-3/8" Drill Stem', diameter: '2-3/8" OD',
    weightPerFoot: 4.7, defaultPricePerFoot: 3.50, jointLengthFeet: 31, shape: 'round' },
  { id: 'drill_stem_278', label: '2-7/8" Drill Stem', diameter: '2-7/8" OD',
    weightPerFoot: 6.5, defaultPricePerFoot: 4.75, jointLengthFeet: 31, shape: 'round' },
  { id: 'round_pipe_250', label: '2.5" New Round Pipe', diameter: '2.5" OD',
    weightPerFoot: 3.65, defaultPricePerFoot: 3.25, jointLengthFeet: 21, shape: 'round' },
  { id: 'square_2', label: '2" Square Tube', diameter: '2" x 2"',
    weightPerFoot: 3.2, defaultPricePerFoot: 2.85, jointLengthFeet: 20, shape: 'square',
    gaugeOptions: ['16ga', '14ga', '11ga'] },
  { id: 'square_3', label: '3" Square Tube', diameter: '3" x 3"',
    weightPerFoot: 5.4, defaultPricePerFoot: 4.50, jointLengthFeet: 24, shape: 'square',
    gaugeOptions: ['14ga', '11ga'] },
  { id: 'square_4', label: '4" Square Tube', diameter: '4" x 4"',
    weightPerFoot: 7.1, defaultPricePerFoot: 6.25, jointLengthFeet: 24, shape: 'square',
    gaugeOptions: ['14ga', '11ga'] },
];

// -- Square tube gauge pricing (per joint) --
export interface GaugeOption {
  gauge: SquareTubeGauge;
  label: string;
  pricePerFoot: number;
  wallThickness: string;
}

export const SQUARE_TUBE_GAUGES: Record<string, GaugeOption[]> = {
  square_2: [
    { gauge: '16ga', label: '16 Gauge (0.065")', pricePerFoot: 2.40, wallThickness: '0.065"' },
    { gauge: '14ga', label: '14 Gauge (0.075")', pricePerFoot: 2.85, wallThickness: '0.075"' },
    { gauge: '11ga', label: '11 Gauge (0.120")', pricePerFoot: 4.25, wallThickness: '0.120"' },
  ],
  square_3: [
    { gauge: '14ga', label: '14 Gauge (0.075")', pricePerFoot: 4.50, wallThickness: '0.075"' },
    { gauge: '11ga', label: '11 Gauge (0.120")', pricePerFoot: 6.00, wallThickness: '0.120"' },
  ],
  square_4: [
    { gauge: '14ga', label: '14 Gauge (0.075")', pricePerFoot: 6.25, wallThickness: '0.075"' },
    { gauge: '11ga', label: '11 Gauge (0.120")', pricePerFoot: 8.50, wallThickness: '0.120"' },
  ],
};

/** Get available gauge options for a post material */
export function getGaugeOptions(material: PostMaterial): GaugeOption[] {
  return SQUARE_TUBE_GAUGES[material] ?? [];
}

// -- Post length calculator based on wire / fence height --
export interface PostLengthCalc {
  wireHeightInches: number;
  aboveGroundFeet: number;
  belowGroundFeet: number;
  totalLengthFeet: number;
  postsPerJoint: (material: PostMaterial) => number;
}

export function calculatePostLength(wireHeightInches: number): PostLengthCalc {
  const aboveGround = (wireHeightInches + 6) / 12; // fence height + 6" above ground
  const belowGround = wireHeightInches <= 60 ? 2.5 : wireHeightInches <= 72 ? 3.0 : 3.5;
  const total = Math.ceil((aboveGround + belowGround) * 2) / 2;
  return {
    wireHeightInches,
    aboveGroundFeet: Math.round(aboveGround * 10) / 10,
    belowGroundFeet: belowGround,
    totalLengthFeet: total,
    postsPerJoint: (material: PostMaterial) => {
      const spec = POST_MATERIALS.find(p => p.id === material);
      const jointLen = spec?.jointLengthFeet ?? 20;
      return Math.floor(jointLen / total);
    },
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
      { name: "Gate post 4\" vertical (4\" square tube)", quantity: 2, defaultUnitPrice: 45 },
      { name: 'Triple H-brace horizontal (2-3/8" drill stem)', quantity: 6, defaultUnitPrice: 25 },
      { name: 'Concrete (80lb bags)', quantity: 6, defaultUnitPrice: 7 },
    ], defaultPrice: 480, defaultInstallCost: 300 },
  { size: '6ft', widthFeet: 6, label: "6' Walk Gate", type: 'walk',
    hardware: [
      { name: "6' gate frame (welded tube)", quantity: 1, defaultUnitPrice: 110 },
      { name: 'Heavy duty hinges (pair)', quantity: 1, defaultUnitPrice: 35 },
      { name: 'Gate latch', quantity: 1, defaultUnitPrice: 22 },
      { name: 'Spring closer', quantity: 1, defaultUnitPrice: 18 },
      { name: "Gate post 4\" vertical (4\" square tube)", quantity: 2, defaultUnitPrice: 45 },
      { name: 'Triple H-brace horizontal (2-3/8" drill stem)', quantity: 6, defaultUnitPrice: 25 },
      { name: 'Concrete (80lb bags)', quantity: 6, defaultUnitPrice: 7 },
    ], defaultPrice: 580, defaultInstallCost: 350 },
  { size: '8ft', widthFeet: 8, label: "8' Ranch Gate", type: 'ranch',
    hardware: [
      { name: "8' gate frame (welded tube)", quantity: 1, defaultUnitPrice: 165 },
      { name: 'Heavy duty barrel hinges', quantity: 2, defaultUnitPrice: 28 },
      { name: 'Chain latch set', quantity: 1, defaultUnitPrice: 25 },
      { name: "Gate post 4\" vertical (4\" square tube)", quantity: 2, defaultUnitPrice: 55 },
      { name: 'Triple H-brace horizontal (2-3/8" drill stem)', quantity: 6, defaultUnitPrice: 25 },
      { name: 'Concrete (80lb bags)', quantity: 8, defaultUnitPrice: 7 },
    ], defaultPrice: 720, defaultInstallCost: 450 },
  { size: '10ft', widthFeet: 10, label: "10' Ranch Gate", type: 'ranch',
    hardware: [
      { name: "10' gate frame (welded tube)", quantity: 1, defaultUnitPrice: 220 },
      { name: 'Heavy duty barrel hinges', quantity: 2, defaultUnitPrice: 28 },
      { name: 'Chain latch set', quantity: 1, defaultUnitPrice: 25 },
      { name: 'Wheel kit', quantity: 1, defaultUnitPrice: 35 },
      { name: "Gate post 4\" vertical (4\" square tube)", quantity: 2, defaultUnitPrice: 55 },
      { name: 'Triple H-brace horizontal (2-3/8" drill stem)', quantity: 6, defaultUnitPrice: 25 },
      { name: 'Concrete (80lb bags)', quantity: 8, defaultUnitPrice: 7 },
    ], defaultPrice: 920, defaultInstallCost: 550 },
  { size: '12ft', widthFeet: 12, label: "12' Truck Gate", type: 'truck',
    hardware: [
      { name: "12' gate frame (welded tube)", quantity: 1, defaultUnitPrice: 285 },
      { name: 'Heavy duty barrel hinges', quantity: 3, defaultUnitPrice: 28 },
      { name: 'Chain latch set w/ keeper', quantity: 1, defaultUnitPrice: 30 },
      { name: 'Wheel kit (heavy duty)', quantity: 1, defaultUnitPrice: 45 },
      { name: "Gate post 4\" vertical (4\" square tube)", quantity: 2, defaultUnitPrice: 65 },
      { name: 'Triple H-brace horizontal (2-3/8" drill stem)', quantity: 6, defaultUnitPrice: 25 },
      { name: 'Concrete (80lb bags)', quantity: 10, defaultUnitPrice: 7 },
    ], defaultPrice: 1120, defaultInstallCost: 650 },
  { size: '16ft', widthFeet: 16, label: "16' Equipment Gate", type: 'equipment',
    hardware: [
      { name: "16' gate frame (cross-braced tube)", quantity: 1, defaultUnitPrice: 420 },
      { name: 'Heavy duty barrel hinges', quantity: 3, defaultUnitPrice: 35 },
      { name: 'Chain latch set w/ keeper', quantity: 1, defaultUnitPrice: 30 },
      { name: 'Heavy duty wheel kit', quantity: 1, defaultUnitPrice: 65 },
      { name: 'Gate stop/catcher', quantity: 1, defaultUnitPrice: 20 },
      { name: "Gate post 4\" vertical (4\" square tube)", quantity: 2, defaultUnitPrice: 75 },
      { name: 'Triple H-brace horizontal (2-3/8" drill stem)', quantity: 6, defaultUnitPrice: 30 },
      { name: 'Concrete (80lb bags)', quantity: 12, defaultUnitPrice: 7 },
    ], defaultPrice: 1520, defaultInstallCost: 850 },
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
  // Posts — Drill Stem (31ft joints)
  { id: 'drill_stem_238_31', category: 'Posts', name: "Drill Stem 2-3/8\" OD — 31' joint", unit: 'joint', price: 110, defaultPrice: 110 },
  { id: 'drill_stem_278_31', category: 'Posts', name: "Drill Stem 2-7/8\" OD — 31' joint", unit: 'joint', price: 155, defaultPrice: 155 },
  // Posts — Round pipe
  { id: 'round_pipe_250_21', category: 'Posts', name: "2.5\" New Round Pipe — 21' joint", unit: 'joint', price: 72, defaultPrice: 72 },
  // Posts — 2" Square Tube (20ft joints) by gauge
  { id: 'square_2_20_16ga', category: 'Posts', name: "2\" Square Tube 16ga — 20' joint", unit: 'joint', price: 48, defaultPrice: 48 },
  { id: 'square_2_20_14ga', category: 'Posts', name: "2\" Square Tube 14ga — 20' joint", unit: 'joint', price: 57, defaultPrice: 57 },
  { id: 'square_2_20_11ga', category: 'Posts', name: "2\" Square Tube 11ga — 20' joint", unit: 'joint', price: 85, defaultPrice: 85 },
  // Posts — 3" Square Tube (24ft joints)
  { id: 'square_3_24_14ga', category: 'Posts', name: "3\" Square Tube 14ga — 24' joint", unit: 'joint', price: 108, defaultPrice: 108 },
  { id: 'square_3_24_11ga', category: 'Posts', name: "3\" Square Tube 11ga — 24' joint", unit: 'joint', price: 144, defaultPrice: 144 },
  // Posts — 4" Square Tube (24ft joints)
  { id: 'square_4_24_14ga', category: 'Posts', name: "4\" Square Tube 14ga — 24' joint", unit: 'joint', price: 150, defaultPrice: 150 },
  { id: 'square_4_24_11ga', category: 'Posts', name: "4\" Square Tube 11ga — 24' joint", unit: 'joint', price: 204, defaultPrice: 204 },
  // Concrete-filled post/brace upgrade
  { id: 'concrete_fill_post', category: 'Posts', name: 'Concrete Fill — Line Post', unit: 'per post', price: 8, defaultPrice: 8 },
  { id: 'concrete_fill_brace', category: 'Posts', name: 'Concrete Fill — Brace Post', unit: 'per post', price: 12, defaultPrice: 12 },
  // T-Posts
  { id: 't_post_6', category: 'Posts', name: "T-Post 6' (1.33 lb/ft)", unit: 'each', price: 9.50, defaultPrice: 9.50 },
  { id: 't_post_7', category: 'Posts', name: "T-Post 7' (1.33 lb/ft)", unit: 'each', price: 11.00, defaultPrice: 11.00 },
  { id: 't_post_8', category: 'Posts', name: "T-Post 8' (1.33 lb/ft)", unit: 'each', price: 13.00, defaultPrice: 13.00 },
  { id: 't_post_10', category: 'Posts', name: "T-Post 10' (1.33 lb/ft)", unit: 'each', price: 17.00, defaultPrice: 17.00 },

  // ── Stay-Tuff Fixed Knot Wire ──
  // Deer fence
  { id: 'st_2096_3_200', category: 'Wire — Deer', name: 'ST 2096-3-200 (96\", 3\" stay, 200\' roll)', unit: 'roll', price: 620, defaultPrice: 620 },
  { id: 'st_2096_6_330', category: 'Wire — Deer', name: 'ST 2096-6-330 (96\", 6\" stay, 330\' roll)', unit: 'roll', price: 685, defaultPrice: 685 },
  { id: 'st_2096_12_330', category: 'Wire — Deer', name: 'ST 2096-12-330 (96\", 12\" stay, 330\' roll)', unit: 'roll', price: 510, defaultPrice: 510 },
  { id: 'st_2096_6_500', category: 'Wire — Deer', name: 'ST 2096-6-500 (96\", 6\" stay, 500\' MTO)', unit: 'roll', price: 1020, defaultPrice: 1020 },
  { id: 'st_2096_12_660', category: 'Wire — Deer', name: 'ST 2096-12-660 (96\", 12\" stay, 660\' MTO)', unit: 'roll', price: 950, defaultPrice: 950 },
  // Horse fence
  { id: 'st_1661_3_200', category: 'Wire — Horse', name: 'ST 1661-3-200 (61\", 3\" stay, 200\' roll)', unit: 'roll', price: 450, defaultPrice: 450 },
  { id: 'st_1661_6_330', category: 'Wire — Horse', name: 'ST 1661-6-330 (61\", 6\" stay, 330\' roll)', unit: 'roll', price: 480, defaultPrice: 480 },
  { id: 'st_1661_12_330', category: 'Wire — Horse', name: 'ST 1661-12-330 (61\", 12\" stay, 330\' MTO)', unit: 'roll', price: 380, defaultPrice: 380 },
  { id: 'st_1661_12_660', category: 'Wire — Horse', name: 'ST 1661-12-660 (61\", 12\" stay, 660\' MTO)', unit: 'roll', price: 720, defaultPrice: 720 },
  { id: 'st_1748_3_200', category: 'Wire — Horse', name: 'ST 1748-3-200 (48\", 3\" stay, 200\' MTO)', unit: 'roll', price: 430, defaultPrice: 430 },
  // Goat fence
  { id: 'st_1348_3_200', category: 'Wire — Goat', name: 'ST 1348-3-200 (48\", 3\" stay, 200\' roll)', unit: 'roll', price: 370, defaultPrice: 370 },
  { id: 'st_1348_6_330', category: 'Wire — Goat/Field', name: 'ST 1348-6-330 (48\", 6\" stay, 330\' roll)', unit: 'roll', price: 395, defaultPrice: 395 },
  { id: 'st_1348_12_330', category: 'Wire — Goat', name: 'ST 1348-12-330 (48\", 12\" stay, 330\' roll)', unit: 'roll', price: 295, defaultPrice: 295 },
  { id: 'st_1348_12_660', category: 'Wire — Goat', name: 'ST 1348-12-660 (48\", 12\" stay, 660\' MTO)', unit: 'roll', price: 560, defaultPrice: 560 },
  // Cattle fence
  { id: 'st_949_3_200', category: 'Wire — Cattle', name: 'ST 949-3-200 (49\", 3\" stay, 200\' MTO)', unit: 'roll', price: 320, defaultPrice: 320 },
  { id: 'st_949_6_330', category: 'Wire — Cattle', name: 'ST 949-6-330 (49\", 6\" stay, 330\' roll)', unit: 'roll', price: 310, defaultPrice: 310 },
  { id: 'st_949_12_330', category: 'Wire — Cattle', name: 'ST 949-12-330 (49\", 12\" stay, 330\' roll)', unit: 'roll', price: 225, defaultPrice: 225 },
  { id: 'st_949_12_660', category: 'Wire — Cattle', name: 'ST 949-12-660 (49\", 12\" stay, 660\' MTO)', unit: 'roll', price: 425, defaultPrice: 425 },
  // General field fence
  { id: 'st_735_6_330', category: 'Wire — Field', name: 'ST 735-6-330 (35\", 6\" stay, 330\' roll)', unit: 'roll', price: 230, defaultPrice: 230 },
  { id: 'st_735_3_200', category: 'Wire — Field', name: 'ST 735-3-200 (35\", 3\" stay, 200\' MTO)', unit: 'roll', price: 215, defaultPrice: 215 },
  { id: 'st_842_6_330', category: 'Wire — Field', name: 'ST 842-6-330 (42\", 6\" stay, 330\' roll)', unit: 'roll', price: 270, defaultPrice: 270 },
  { id: 'st_842_12_330', category: 'Wire — Field', name: 'ST 842-12-330 (42\", 12\" stay, 330\' roll)', unit: 'roll', price: 195, defaultPrice: 195 },
  { id: 'st_842_3_200', category: 'Wire — Field', name: 'ST 842-3-200 (42\", 3\" stay, 200\' MTO)', unit: 'roll', price: 255, defaultPrice: 255 },
  { id: 'st_842_12_660', category: 'Wire — Field', name: 'ST 842-12-660 (42\", 12\" stay, 660\' MTO)', unit: 'roll', price: 370, defaultPrice: 370 },
  // Fixed Knot Xtreme
  { id: 'sza_735_6_330', category: 'Wire — Xtreme', name: 'Xtreme 735-6-330 (35\", 6\", 330\')', unit: 'roll', price: 265, defaultPrice: 265 },
  { id: 'sza_1348_6_330', category: 'Wire — Xtreme', name: 'Xtreme 1348-6-330 (48\", 6\", 330\')', unit: 'roll', price: 445, defaultPrice: 445 },
  { id: 'sza_1348_12_330', category: 'Wire — Xtreme', name: 'Xtreme 1348-12-330 (48\", 12\", 330\')', unit: 'roll', price: 335, defaultPrice: 335 },
  { id: 'sza_1348_12_660', category: 'Wire — Xtreme', name: 'Xtreme 1348-12-660 (48\", 12\", 660\')', unit: 'roll', price: 635, defaultPrice: 635 },
  { id: 'sza_949_6_330', category: 'Wire — Xtreme', name: 'Xtreme 949-6-330 (49\", 6\", 330\')', unit: 'roll', price: 350, defaultPrice: 350 },
  { id: 'sza_949_12_330', category: 'Wire — Xtreme', name: 'Xtreme 949-12-330 (49\", 12\", 330\')', unit: 'roll', price: 260, defaultPrice: 260 },
  { id: 'sza_949_12_660', category: 'Wire — Xtreme', name: 'Xtreme 949-12-660 (49\", 12\", 660\')', unit: 'roll', price: 490, defaultPrice: 490 },
  { id: 'sza_2096_6_330', category: 'Wire — Xtreme', name: 'Xtreme 2096-6-330 (96\", 6\", 330\')', unit: 'roll', price: 780, defaultPrice: 780 },
  // Fixed Knot Xtreme Black
  { id: 'szab_1348_6_330', category: 'Wire — Xtreme Black', name: 'Xtreme Black 1348-6-330 (48\", 6\", 330\')', unit: 'roll', price: 520, defaultPrice: 520 },
  { id: 'szab_1775_6_330', category: 'Wire — Xtreme Black', name: 'Xtreme Black 1775-6-330 (75\", 6\", 330\')', unit: 'roll', price: 620, defaultPrice: 620 },
  { id: 'szab_2096_6_330', category: 'Wire — Xtreme Black', name: 'Xtreme Black 2096-6-330 (96\", 6\", 330\')', unit: 'roll', price: 820, defaultPrice: 820 },

  // ── Barbed Wire ──
  { id: 'barbed_wire_2pt', category: 'Wire — Barbed', name: '2-Point Barbed Wire (1320\' roll)', unit: 'roll', price: 85, defaultPrice: 85 },
  { id: 'barbed_wire_4pt', category: 'Wire — Barbed', name: '4-Point Barbed Wire (1320\' roll)', unit: 'roll', price: 95, defaultPrice: 95 },
  // Other wire
  { id: 'field_fence_roll', category: 'Wire — Other', name: "Field Fence (330' roll)", unit: 'roll', price: 180, defaultPrice: 180 },
  { id: 'no_climb_roll', category: 'Wire — Other', name: "No-Climb Horse Fence (200' roll)", unit: 'roll', price: 320, defaultPrice: 320 },
  { id: 'ht_smooth', category: 'Wire — Other', name: "High Tensile Smooth (4000' roll)", unit: 'roll', price: 110, defaultPrice: 110 },

  // ── Hardware & Accessories ──
  { id: 'clips', category: 'Hardware', name: 'Fence Clips/Staples (box of 500)', unit: 'box', price: 45, defaultPrice: 45 },
  { id: 'concrete_bag', category: 'Hardware', name: 'Concrete Mix (80 lb bag)', unit: 'bag', price: 7, defaultPrice: 7 },
  { id: 'tensioner', category: 'Hardware', name: 'Inline Wire Tensioner', unit: 'each', price: 6, defaultPrice: 6 },
  { id: 'spring_tension_indicator', category: 'Hardware', name: 'Spring Tension Indicator', unit: 'each', price: 18, defaultPrice: 18 },
  { id: 'post_cap', category: 'Hardware', name: 'Post Cap (prevents rain/rot)', unit: 'each', price: 3.50, defaultPrice: 3.50 },
  { id: 'wire_tie', category: 'Hardware', name: 'Wire Tie (pre-formed)', unit: 'each', price: 0.35, defaultPrice: 0.35 },
  { id: 'crimp_sleeve', category: 'Hardware', name: 'Crimp Sleeves (bag of 100)', unit: 'bag', price: 28, defaultPrice: 28 },
  { id: 'brace_pin', category: 'Hardware', name: 'H-Brace Pin (galvanized)', unit: 'each', price: 8, defaultPrice: 8 },
  { id: 'brace_wire_9ga', category: 'Hardware', name: '9ga Brace Wire (50\' coil)', unit: 'coil', price: 12, defaultPrice: 12 },
  { id: 'corner_insulator', category: 'Hardware', name: 'Corner / End Insulator (HT)', unit: 'each', price: 4.50, defaultPrice: 4.50 },
  { id: 'line_insulator', category: 'Hardware', name: 'Line Post Insulator', unit: 'each', price: 1.25, defaultPrice: 1.25 },
  { id: 'water_gap_cable', category: 'Hardware', name: 'Water Gap Cable Kit', unit: 'each', price: 85, defaultPrice: 85 },
  { id: 'kicker_brace', category: 'Hardware', name: 'Kicker Brace Pipe (cut & welded)', unit: 'each', price: 35, defaultPrice: 35 },
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

/** Get the wire price id for a Stay-Tuff product by its product ID */
export function wireRollPriceId(productId: string): string {
  // Direct match if caller passes a material price id (e.g. 'st_2096_6_330')
  const direct = DEFAULT_MATERIAL_PRICES.find(p => p.id === productId);
  if (direct) return productId;
  // Legacy fallback: match by height
  const h = parseInt(productId, 10);
  if (!isNaN(h)) {
    if (h <= 49) return 'st_949_6_330';
    if (h <= 61) return 'st_1661_6_330';
    if (h <= 75) return 'szab_1775_6_330';
    return 'st_2096_6_330';
  }
  return 'st_949_6_330';
}

/** Get the post price id based on material and optional gauge */
export function postJointPriceId(material: PostMaterial, gauge?: SquareTubeGauge): string {
  const spec = POST_MATERIALS.find(p => p.id === material);
  if (!spec) return 'drill_stem_238_31';
  if (spec.shape === 'round') {
    if (material === 'drill_stem_238') return 'drill_stem_238_31';
    if (material === 'drill_stem_278') return 'drill_stem_278_31';
    return 'round_pipe_250_21';
  }
  // Square tube — include gauge
  const g = gauge ?? '14ga';
  const jointLen = spec.jointLengthFeet;
  return `${material}_${jointLen}_${g}`;
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

// ============================================================
// Pipe Fence — configuration & meticulous material calculation
// ============================================================

/**
 * Everything that defines a pipe fence design. Drives both the per-foot cost
 * calculation and the auto-generated section diagram in the PDF.
 */
export interface PipeFenceConfig {
  uprightMaterial: PostMaterial;          // e.g. 'drill_stem_278' (vertical posts)
  uprightGauge?: SquareTubeGauge;         // only used if upright is square
  railMaterial: PostMaterial;             // e.g. 'drill_stem_238' (horizontal rails)
  railGauge?: SquareTubeGauge;            // only used if rail is square
  railCount: number;                      // number of horizontal rails (1-4 typical)
  topRailStyle: PipeTopRailStyle;         // 'continuous' or 'caps'
  finish: PipeFinish;                     // 'painted' or 'bare'
  paintColor?: string;                    // e.g. 'Black' (only used if painted)
  fenceHeightFeet: number;                // overall fence height above ground
  postSpacingFeet: number;                // upright spacing (typ. 8 ft)
}

/** Sensible default pipe-fence design (4-rail, 5 ft, 2-7/8" uprights, 2-3/8" rails, painted black). */
export const DEFAULT_PIPE_FENCE_CONFIG: PipeFenceConfig = {
  uprightMaterial: 'drill_stem_278',
  railMaterial: 'drill_stem_238',
  railCount: 4,
  topRailStyle: 'continuous',
  finish: 'painted',
  paintColor: 'Black',
  fenceHeightFeet: 5,
  postSpacingFeet: 8,
};

/** Result of a pipe-fence material calculation. All quantities are exact, "go-buy-this-much" numbers. */
export interface PipeFenceMaterials {
  // Uprights (vertical posts)
  uprightCount: number;
  uprightCutLengthFeet: number;        // each upright cut to this length (above + below ground, rounded up to nearest 0.5')
  uprightTotalFeet: number;            // total feet of upright pipe needed (count × cutLength)
  uprightJoints: number;               // how many full joints to buy (joint length comes from POST_MATERIALS)
  uprightJointLengthFeet: number;
  uprightWastageFeet: number;          // leftover pipe after cutting all uprights
  uprightJointPriceId: string;
  uprightUnitPrice: number;            // $ per joint (current price)

  // Rails (horizontals)
  railCount: number;
  topRailStyle: PipeTopRailStyle;
  railTotalFeet: number;               // sum of all rail pipe needed (already includes ~5% cut waste)
  railJoints: number;                  // joints to buy
  railJointLengthFeet: number;
  railJointPriceId: string;
  railUnitPrice: number;
  railContinuousFeet: number;          // feet of continuous top rail (0 for caps style)
  railBetweenPostFeet: number;         // feet of cut-between-post rails

  // Caps (only for caps style)
  postCapsNeeded: number;
  postCapUnitPrice: number;

  // Concrete
  concreteBags: number;                // 80 lb bags
  concreteUnitPrice: number;

  // Welds (each rail-to-post connection is one weld; informational, not priced)
  weldsCount: number;

  // Paint (zero if finish === 'bare')
  paintGallons: number;
  paintMaterialCost: number;
  paintLaborCost: number;

  // Cost breakdown
  uprightCost: number;
  railCost: number;
  capCost: number;
  concreteCost: number;
  totalMaterialCost: number;           // uprights + rails + caps + concrete + paint material (NOT paint labor)
  totalCost: number;                   // totalMaterialCost + paintLaborCost
}

/** Outside diameter (or width for square tube) in INCHES for a given post material.
 *  Exported so consumers (e.g. the PDF section diagram) don't have to duplicate
 *  the lookup table. */
export function postOdInches(material: PostMaterial): number {
  switch (material) {
    case 'drill_stem_238': return 2.375;
    case 'drill_stem_278': return 2.875;
    case 'round_pipe_250': return 2.5;
    case 'square_2':       return 2;
    case 'square_3':       return 3;
    case 'square_4':       return 4;
    default:               return 2.375;
  }
}

/**
 * Meticulously calculate every piece of pipe, every cap, every bag of
 * concrete and every gallon of paint needed to build a section of pipe fence.
 *
 * The math, in plain English:
 *   - We need ONE upright (vertical post) at every postSpacingFeet, plus one
 *     extra upright at the very end of the run.
 *   - Every upright is buried: 2.5 ft for fences ≤ 5 ft tall, 3 ft for taller.
 *     We round each cut UP to the nearest 6 inches so the welder isn't
 *     fighting fractional inches in the field.
 *   - Then we figure out how many uprights we can cut from one full joint of
 *     pipe (e.g. a 31' joint of 2-7/8" drill stem yields 4 uprights at 7.5'
 *     each, leaving 1' of scrap), and round the joint count UP.
 *   - Rail math depends on the top-rail style:
 *       * continuous: the TOP rail is one long pipe across all posts, full
 *         linear footage; the remaining (railCount - 1) rails are cut
 *         between posts (postSpacing - postOd inches per piece).
 *       * caps: ALL railCount rails are cut between posts.
 *   - We add 5% cut/waste allowance on rails, then convert to joints.
 *   - Caps style needs one post cap per upright; continuous style needs none
 *     (the rail covers the post tops).
 *   - Welds are informational: each rail end welded to a post = 1 weld.
 *   - Paint is zero gallons if finish === 'bare'. Otherwise we estimate
 *     1 gallon per ~15 uprights + 1 gallon per ~250 rail-feet (pipe has more
 *     surface area than a flat fence, so we don't reuse the woven-fence
 *     20 posts/gallon number).
 */
export function calculatePipeFenceMaterials(
  totalLinearFeet: number,
  cfg: PipeFenceConfig,
  prices?: MaterialPrice[],
): PipeFenceMaterials {
  const list = prices ?? DEFAULT_MATERIAL_PRICES;
  const findPrice = (id: string) => list.find(m => m.id === id)?.price ?? 0;

  // ── Uprights ──
  const uprightCount = Math.max(2, Math.ceil(totalLinearFeet / cfg.postSpacingFeet) + 1);
  const buryFt = cfg.fenceHeightFeet <= 5 ? 2.5 : 3;
  // Round cut length up to nearest 0.5 ft so welders aren't dealing with weird inches.
  const uprightCutLengthFeet = Math.ceil((cfg.fenceHeightFeet + buryFt) * 2) / 2;
  const uprightTotalFeet = uprightCount * uprightCutLengthFeet;

  const uprightSpec = POST_MATERIALS.find(p => p.id === cfg.uprightMaterial) || POST_MATERIALS[0];
  const uprightJointLength = uprightSpec.jointLengthFeet;
  const postsPerJoint = Math.max(1, Math.floor(uprightJointLength / uprightCutLengthFeet));
  const uprightJoints = Math.ceil(uprightCount / postsPerJoint);
  const uprightWastageFeet = (uprightJoints * uprightJointLength) - uprightTotalFeet;
  const uprightJointPriceId = postJointPriceId(cfg.uprightMaterial, cfg.uprightGauge);
  const uprightUnitPrice = findPrice(uprightJointPriceId);

  // ── Rails ──
  const railSpec = POST_MATERIALS.find(p => p.id === cfg.railMaterial) || POST_MATERIALS[0];
  const railJointLength = railSpec.jointLengthFeet;
  const railJointPriceId = postJointPriceId(cfg.railMaterial, cfg.railGauge);
  const railUnitPrice = findPrice(railJointPriceId);

  const railCount = Math.max(1, Math.min(6, Math.round(cfg.railCount)));
  const uprightOdFt = postOdInches(cfg.uprightMaterial) / 12;
  const spans = uprightCount - 1;                          // number of bays between uprights
  // Length of one rail piece between two posts (caps style butts the rail
  // INTO the gap; continuous-style center rails do the same).
  const cutRailPieceFt = Math.max(0, cfg.postSpacingFeet - uprightOdFt);

  let railContinuousFeet = 0;
  let railBetweenPostFeet = 0;
  if (cfg.topRailStyle === 'continuous') {
    // Top rail spans full run; the rest are cut between posts.
    railContinuousFeet = totalLinearFeet;
    railBetweenPostFeet = (railCount - 1) * spans * cutRailPieceFt;
  } else {
    // All rails are cut between each pair of posts.
    railBetweenPostFeet = railCount * spans * cutRailPieceFt;
  }
  // 5% waste allowance for cuts, mistakes, fitting.
  const railTotalFeet = (railContinuousFeet + railBetweenPostFeet) * 1.05;
  const railJoints = railJointLength > 0 ? Math.ceil(railTotalFeet / railJointLength) : 0;

  // ── Caps ──
  const postCapsNeeded = cfg.topRailStyle === 'caps' ? uprightCount : 0;
  const postCapUnitPrice = findPrice('post_cap');

  // ── Concrete (per-upright; same diameter-based logic as line posts) ──
  const odIn = postOdInches(cfg.uprightMaterial);
  const holeDiamIn = Math.max(odIn * 3, 8);
  const holeRadFt = (holeDiamIn / 2) / 12;
  const postRadFt = (odIn / 2) / 12;
  const postArea = uprightSpec.shape === 'square' ? (odIn / 12) ** 2 : Math.PI * postRadFt ** 2;
  const holeArea = Math.PI * holeRadFt ** 2;
  const concreteCuFtPerPost = (holeArea - postArea) * buryFt;
  const bagsPerPost = Math.max(1, Math.ceil(concreteCuFtPerPost / 0.6));
  const concreteBags = bagsPerPost * uprightCount;
  const concreteUnitPrice = findPrice('concrete_bag');

  // ── Welds (informational) ──
  // Continuous: top rail welded ON TOP of each upright (uprightCount welds) +
  // every center rail butt-welded BETWEEN posts (2 welds per piece × spans).
  // Caps: every rail butt-welded between posts (2 welds per piece × spans × railCount).
  const weldsCount = cfg.topRailStyle === 'continuous'
    ? uprightCount + (railCount - 1) * spans * 2
    : railCount * spans * 2;

  // ── Paint ──
  let paintGallons = 0;
  let paintMaterialCost = 0;
  let paintLaborCost = 0;
  if (cfg.finish === 'painted') {
    const gallonsForPosts = Math.ceil(uprightCount / 15);
    const gallonsForRails = Math.ceil((railContinuousFeet + railBetweenPostFeet) / 250);
    paintGallons = gallonsForPosts + gallonsForRails;
    paintMaterialCost = paintGallons * findPrice('paint_posts');
    // Painting labor: $/post for uprights (existing per-post rate covers a post's worth of work)
    paintLaborCost = uprightCount * findPrice('paint_labor');
  }

  // ── Costs ──
  const uprightCost = uprightJoints * uprightUnitPrice;
  const railCost = railJoints * railUnitPrice;
  const capCost = postCapsNeeded * postCapUnitPrice;
  const concreteCost = concreteBags * concreteUnitPrice;
  const totalMaterialCost = uprightCost + railCost + capCost + concreteCost + paintMaterialCost;
  const totalCost = totalMaterialCost + paintLaborCost;

  return {
    uprightCount,
    uprightCutLengthFeet,
    uprightTotalFeet,
    uprightJoints,
    uprightJointLengthFeet: uprightJointLength,
    uprightWastageFeet: Math.round(uprightWastageFeet * 10) / 10,
    uprightJointPriceId,
    uprightUnitPrice,

    railCount,
    topRailStyle: cfg.topRailStyle,
    railTotalFeet: Math.round(railTotalFeet * 10) / 10,
    railJoints,
    railJointLengthFeet: railJointLength,
    railJointPriceId,
    railUnitPrice,
    railContinuousFeet: Math.round(railContinuousFeet * 10) / 10,
    railBetweenPostFeet: Math.round(railBetweenPostFeet * 10) / 10,

    postCapsNeeded,
    postCapUnitPrice,

    concreteBags,
    concreteUnitPrice,

    weldsCount,

    paintGallons,
    paintMaterialCost: Math.round(paintMaterialCost * 100) / 100,
    paintLaborCost: Math.round(paintLaborCost * 100) / 100,

    uprightCost: Math.round(uprightCost * 100) / 100,
    railCost: Math.round(railCost * 100) / 100,
    capCost: Math.round(capCost * 100) / 100,
    concreteCost: Math.round(concreteCost * 100) / 100,
    totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
  };
}