import {
  FenceType,
  FenceHeight,
  FenceLine,
  FenceSegment,
  FenceMaterialList,
  LaborEstimate,
  GeoPoint,
  TerrainDifficulty,
  StayTuffProduct,
} from '@/types';

// ── Complete Stay-Tuff Deer-Tuff Fixed Knot catalog ──

export type WireCategory = 'deer' | 'horse' | 'goat' | 'cattle' | 'field' | 'xtreme' | 'xtreme_black';

export interface StayTuffOption {
  id: string;            // matches MaterialPrice id (e.g. 'st_2096_6_330')
  partNo: string;        // ST-880, SZA-250, etc.
  spec: string;          // "2096-6-330"
  category: WireCategory;
  height: number;        // fence height in inches
  horizontalWires: number;
  verticalSpacing: number; // inches
  rollLength: number;    // feet
  weight: number;        // lbs per roll
  description: string;
  whereUsed: string;
  madeToOrder: boolean;
}

export const STAY_TUFF_CATALOG: StayTuffOption[] = [
  // ── Deer Fence ──
  { id: 'st_2096_3_200', partNo: 'ST-882b', spec: '2096-3-200', category: 'deer', height: 96, horizontalWires: 20, verticalSpacing: 3, rollLength: 200, weight: 392, description: '96" Fixed Knot, 3" stays — Deer', whereUsed: 'Breeding & Fawn Pens, high pressure areas', madeToOrder: false },
  { id: 'st_2096_6_330', partNo: 'ST-880', spec: '2096-6-330', category: 'deer', height: 96, horizontalWires: 20, verticalSpacing: 6, rollLength: 330, weight: 408, description: '96" Fixed Knot, 6" stays — Deer', whereUsed: 'Boundary fence, medium-to-high pressure', madeToOrder: false },
  { id: 'st_2096_12_330', partNo: 'ST-881', spec: '2096-12-330', category: 'deer', height: 96, horizontalWires: 20, verticalSpacing: 12, rollLength: 330, weight: 290, description: '96" Fixed Knot, 12" stays — Deer', whereUsed: 'Boundary fence, deer exclusion, low pressure', madeToOrder: false },
  { id: 'st_2096_6_500', partNo: 'ST-884', spec: '2096-6-500', category: 'deer', height: 96, horizontalWires: 20, verticalSpacing: 6, rollLength: 500, weight: 620, description: '96" Fixed Knot, 6" stays — 500\' MTO', whereUsed: 'Boundary fence, long runs', madeToOrder: true },
  { id: 'st_2096_12_660', partNo: 'ST-883', spec: '2096-12-660', category: 'deer', height: 96, horizontalWires: 20, verticalSpacing: 12, rollLength: 660, weight: 580, description: '96" Fixed Knot, 12" stays — 660\' MTO', whereUsed: 'Boundary fence, economy long runs', madeToOrder: true },

  // ── Horse Fence ──
  { id: 'st_1661_3_200', partNo: 'ST-855B', spec: '1661-3-200', category: 'horse', height: 61, horizontalWires: 16, verticalSpacing: 3, rollLength: 200, weight: 286, description: '61" Fixed Knot, 3" stays — Horse', whereUsed: 'Stalls, holding pens, runways', madeToOrder: false },
  { id: 'st_1661_6_330', partNo: 'ST-856', spec: '1661-6-330', category: 'horse', height: 61, horizontalWires: 16, verticalSpacing: 6, rollLength: 330, weight: 303, description: '61" Fixed Knot, 6" stays — Horse', whereUsed: 'Pasture & perimeter fence, low pressure', madeToOrder: false },
  { id: 'st_1748_3_200', partNo: 'ST-782B', spec: '1748-3-200', category: 'horse', height: 48, horizontalWires: 17, verticalSpacing: 3, rollLength: 200, weight: 280, description: '48" Fixed Knot, 3" stays — Horse/Holding', whereUsed: 'Stalls, holding pens, runways', madeToOrder: true },
  { id: 'st_1661_12_330', partNo: 'ST-858', spec: '1661-12-330', category: 'horse', height: 61, horizontalWires: 16, verticalSpacing: 12, rollLength: 330, weight: 221, description: '61" Fixed Knot, 12" stays — Horse', whereUsed: 'Pasture, low pressure', madeToOrder: true },
  { id: 'st_1661_12_660', partNo: 'ST-857', spec: '1661-12-660', category: 'horse', height: 61, horizontalWires: 16, verticalSpacing: 12, rollLength: 660, weight: 441, description: '61" Fixed Knot, 12" stays — 660\' MTO', whereUsed: 'Pasture, long runs', madeToOrder: true },

  // ── Goat Fence ──
  { id: 'st_1348_3_200', partNo: 'ST-832B', spec: '1348-3-200', category: 'goat', height: 48, horizontalWires: 13, verticalSpacing: 3, rollLength: 200, weight: 228, description: '48" Fixed Knot, 3" stays — Goat', whereUsed: 'Pasture, exteriors, kid pens, holding pens', madeToOrder: false },
  { id: 'st_1348_12_330', partNo: 'ST-831', spec: '1348-12-330', category: 'goat', height: 48, horizontalWires: 13, verticalSpacing: 12, rollLength: 330, weight: 178, description: '48" Fixed Knot, 12" stays — Goat', whereUsed: 'Pastures, exterior fences', madeToOrder: false },
  { id: 'st_1348_12_660', partNo: 'ST-833', spec: '1348-12-660', category: 'goat', height: 48, horizontalWires: 13, verticalSpacing: 12, rollLength: 660, weight: 356, description: '48" Fixed Knot, 12" stays — 660\' MTO', whereUsed: 'Pastures, long runs', madeToOrder: true },

  // ── Cattle Fence ──
  { id: 'st_949_6_330', partNo: 'ST-820', spec: '949-6-330', category: 'cattle', height: 49, horizontalWires: 9, verticalSpacing: 6, rollLength: 330, weight: 189, description: '49" Fixed Knot, 6" stays — Cattle', whereUsed: 'Internal & corral fence, high pressure', madeToOrder: false },
  { id: 'st_949_12_330', partNo: 'ST-821', spec: '949-12-330', category: 'cattle', height: 49, horizontalWires: 9, verticalSpacing: 12, rollLength: 330, weight: 134, description: '49" Fixed Knot, 12" stays — Cattle', whereUsed: 'Boundary & pasture fence, low pressure', madeToOrder: false },
  { id: 'st_949_12_660', partNo: 'ST-823', spec: '949-12-660', category: 'cattle', height: 49, horizontalWires: 9, verticalSpacing: 12, rollLength: 660, weight: 267, description: '49" Fixed Knot, 12" stays — 660\' MTO', whereUsed: 'Boundary, long pasture runs', madeToOrder: true },
  { id: 'st_949_3_200', partNo: 'ST-822B', spec: '949-3-200', category: 'cattle', height: 49, horizontalWires: 9, verticalSpacing: 3, rollLength: 200, weight: 200, description: '49" Fixed Knot, 3" stays — Cattle MTO', whereUsed: 'Corrals, high pressure', madeToOrder: true },

  // ── General Field Fence ──
  { id: 'st_735_6_330', partNo: 'ST-800', spec: '735-6-330', category: 'field', height: 35, horizontalWires: 7, verticalSpacing: 6, rollLength: 330, weight: 141, description: '35" Fixed Knot, 6" stays — Field', whereUsed: 'Feral hog exclusion, low pressure', madeToOrder: false },
  { id: 'st_842_6_330', partNo: 'ST-810', spec: '842-6-330', category: 'field', height: 42, horizontalWires: 8, verticalSpacing: 6, rollLength: 330, weight: 165, description: '42" Fixed Knot, 6" stays — Field', whereUsed: 'Hog exclusion, medium-high pressure', madeToOrder: false },
  { id: 'st_842_12_330', partNo: 'ST-811', spec: '842-12-330', category: 'field', height: 42, horizontalWires: 8, verticalSpacing: 12, rollLength: 330, weight: 118, description: '42" Fixed Knot, 12" stays — Field', whereUsed: 'Pasture, interior/cross fence', madeToOrder: false },
  { id: 'st_1348_6_330', partNo: 'ST-830', spec: '1348-6-330', category: 'field', height: 48, horizontalWires: 13, verticalSpacing: 6, rollLength: 330, weight: 244, description: '48" Fixed Knot, 6" stays — Field', whereUsed: 'Predator control, pastures', madeToOrder: false },
  { id: 'st_735_3_200', partNo: 'ST-802B', spec: '735-3-200', category: 'field', height: 35, horizontalWires: 7, verticalSpacing: 3, rollLength: 200, weight: 135, description: '35" Fixed Knot, 3" stays — Field MTO', whereUsed: 'High pressure, small animal control', madeToOrder: true },
  { id: 'st_842_3_200', partNo: 'ST-812B', spec: '842-3-200', category: 'field', height: 42, horizontalWires: 8, verticalSpacing: 3, rollLength: 200, weight: 158, description: '42" Fixed Knot, 3" stays — Field MTO', whereUsed: 'Predator control, high pressure', madeToOrder: true },
  { id: 'st_842_12_660', partNo: 'ST-813', spec: '842-12-660', category: 'field', height: 42, horizontalWires: 8, verticalSpacing: 12, rollLength: 660, weight: 235, description: '42" Fixed Knot, 12" stays — 660\' MTO', whereUsed: 'Long pasture/cross fence runs', madeToOrder: true },

  // ── Fixed Knot Xtreme ──
  { id: 'sza_735_6_330', partNo: 'SZA-250', spec: '735-6-330', category: 'xtreme', height: 35, horizontalWires: 7, verticalSpacing: 6, rollLength: 330, weight: 155, description: '35" Xtreme, 6" stays', whereUsed: 'Hog exclusion, heavy duty', madeToOrder: false },
  { id: 'sza_1348_6_330', partNo: 'SZA-265', spec: '1348-6-330', category: 'xtreme', height: 48, horizontalWires: 13, verticalSpacing: 6, rollLength: 330, weight: 270, description: '48" Xtreme, 6" stays', whereUsed: 'Predator control, heavy duty', madeToOrder: false },
  { id: 'sza_1348_12_330', partNo: 'SZA-266', spec: '1348-12-330', category: 'xtreme', height: 48, horizontalWires: 13, verticalSpacing: 12, rollLength: 330, weight: 195, description: '48" Xtreme, 12" stays', whereUsed: 'Boundary, economy', madeToOrder: false },
  { id: 'sza_1348_12_660', partNo: 'SZA-267', spec: '1348-12-660', category: 'xtreme', height: 48, horizontalWires: 13, verticalSpacing: 12, rollLength: 660, weight: 390, description: '48" Xtreme, 12" stays — 660\'', whereUsed: 'Long runs, economy', madeToOrder: false },
  { id: 'sza_949_6_330', partNo: 'SZA-262', spec: '949-6-330', category: 'xtreme', height: 49, horizontalWires: 9, verticalSpacing: 6, rollLength: 330, weight: 210, description: '49" Xtreme, 6" stays', whereUsed: 'Cattle, heavy duty', madeToOrder: false },
  { id: 'sza_949_12_330', partNo: 'SZA-260', spec: '949-12-330', category: 'xtreme', height: 49, horizontalWires: 9, verticalSpacing: 12, rollLength: 330, weight: 150, description: '49" Xtreme, 12" stays', whereUsed: 'Cattle, economy', madeToOrder: false },
  { id: 'sza_949_12_660', partNo: 'SZA-261', spec: '949-12-660', category: 'xtreme', height: 49, horizontalWires: 9, verticalSpacing: 12, rollLength: 660, weight: 300, description: '49" Xtreme, 12" stays — 660\'', whereUsed: 'Cattle, long runs', madeToOrder: false },
  { id: 'sza_2096_6_330', partNo: 'SZA-270', spec: '2096-6-330', category: 'xtreme', height: 96, horizontalWires: 20, verticalSpacing: 6, rollLength: 330, weight: 450, description: '96" Xtreme, 6" stays', whereUsed: 'Deer, heavy duty boundary', madeToOrder: false },

  // ── Fixed Knot Xtreme Black ──
  { id: 'szab_1348_6_330', partNo: 'SZAB-830', spec: '1348-6-330', category: 'xtreme_black', height: 48, horizontalWires: 13, verticalSpacing: 6, rollLength: 330, weight: 270, description: '48" Xtreme Black, 6" stays', whereUsed: 'Premium aesthetic, predator control', madeToOrder: false },
  { id: 'szab_1775_6_330', partNo: 'SZAB-860', spec: '1775-6-330', category: 'xtreme_black', height: 75, horizontalWires: 17, verticalSpacing: 6, rollLength: 330, weight: 350, description: '75" Xtreme Black, 6" stays', whereUsed: 'Premium horse/deer boundary', madeToOrder: false },
  { id: 'szab_2096_6_330', partNo: 'SZAB-880', spec: '2096-6-330', category: 'xtreme_black', height: 96, horizontalWires: 20, verticalSpacing: 6, rollLength: 330, weight: 460, description: '96" Xtreme Black, 6" stays', whereUsed: 'Premium deer boundary', madeToOrder: false },
];

// Category display labels
export const WIRE_CATEGORY_LABELS: Record<WireCategory, string> = {
  deer: 'Deer Fence',
  horse: 'Horse Fence',
  goat: 'Goat Fence',
  cattle: 'Cattle Fence',
  field: 'General Field Fence',
  xtreme: 'Fixed Knot Xtreme',
  xtreme_black: 'Fixed Knot Xtreme Black',
};

/** Legacy adapter: convert StayTuffOption to old StayTuffProduct interface */
export function toStayTuffProduct(opt: StayTuffOption): StayTuffProduct {
  return {
    model: opt.spec,
    height: opt.height,
    horizontalWires: opt.horizontalWires,
    verticalSpacing: opt.verticalSpacing,
    description: opt.description,
  };
}

/** Post spacing by terrain difficulty */
const POST_SPACING: Record<TerrainDifficulty, number> = {
  easy: 16.5,       // feet - flat ground
  moderate: 14,     // slight slopes
  difficult: 12,    // steep terrain
  very_difficult: 10, // very steep / rocky
};

/** Line post height above ground by fence height */
const POST_HEIGHT_MAP: Record<FenceHeight, { aboveGround: number; belowGround: number; totalLength: number }> = {
  '4ft': { aboveGround: 4, belowGround: 2.5, totalLength: 6.5 },
  '5ft': { aboveGround: 5, belowGround: 2.5, totalLength: 7.5 },
  '6ft': { aboveGround: 6, belowGround: 3, totalLength: 9 },
  '7ft': { aboveGround: 7, belowGround: 3, totalLength: 10 },
  '8ft': { aboveGround: 8, belowGround: 3.5, totalLength: 11.5 },
};

/**
 * Calculate fence materials from drawn fence lines.
 */
export function calculateFenceMaterials(
  fenceLines: FenceLine[],
  fenceType: FenceType,
  fenceHeight: FenceHeight,
  stayTuffOption?: StayTuffOption
): FenceMaterialList {
  const totalLength = fenceLines.reduce((sum, line) => sum + line.totalLengthFeet, 0);
  const segments = fenceLines.flatMap((line) => line.segments);

  // Count corners (where fence lines change direction significantly)
  const cornerCount = countCorners(fenceLines);

  // Average terrain difficulty
  const avgDifficulty = getAverageDifficulty(segments);
  const postSpacing = POST_SPACING[avgDifficulty];
  const postSpec = POST_HEIGHT_MAP[fenceHeight];

  // Line posts (between corners)
  const linePostCount = Math.ceil(totalLength / postSpacing) - cornerCount;

  // T-posts (between line posts, typically every other space)
  const tPostCount = Math.floor(linePostCount * 0.5);
  const adjustedLinePostCount = linePostCount - tPostCount;

  // Bracing assemblies (at corners and ends)
  const bracingCount = cornerCount + (fenceLines.length * 2); // each line has 2 ends

  // Wire rolls
  const wireRolls = calculateWireRolls(totalLength, fenceType, stayTuffOption);

  // Barbed wire (usually 1-2 strands on top)
  const barbedStrands = fenceType === 'barbed_wire' ? 4 : (fenceHeight >= '6ft' ? 2 : 1);
  const barbedWireTotal = totalLength * barbedStrands;

  // Concrete for corner & brace posts
  const concreteBags = (cornerCount + bracingCount) * 2; // 2 bags per set post

  return {
    cornerPosts: {
      quantity: cornerCount,
      lengthFeet: postSpec.totalLength + 0.5, // slightly taller for corners
      type: `${getPostDiameter(fenceType)} wood corner post`,
    },
    linePosts: {
      quantity: adjustedLinePostCount,
      lengthFeet: postSpec.totalLength,
      spacingFeet: postSpacing,
      type: `${getPostDiameter(fenceType)} wood line post`,
    },
    tPosts: {
      quantity: tPostCount,
      lengthFeet: postSpec.aboveGround + 1.5, // 1.5ft driven in
      spacingFeet: postSpacing,
    },
    bracingAssemblies: {
      quantity: bracingCount,
      type: getBracingType(fenceType),
    },
    gateAssemblies: [],
    wire: {
      rolls: wireRolls.rolls,
      feetPerRoll: wireRolls.feetPerRoll,
      totalFeet: wireRolls.totalFeet,
      type: wireRolls.type,
    },
    barbedWire: {
      rolls: Math.ceil(barbedWireTotal / 1320), // 1320 ft per roll (quarter mile)
      strands: barbedStrands,
      totalFeet: barbedWireTotal,
    },
    clips: {
      quantity: adjustedLinePostCount * 5 + tPostCount * 5,
      type: 'fence clips',
    },
    staples: {
      pounds: Math.ceil(adjustedLinePostCount * 0.25), // ~0.25 lbs per post
    },
    concrete: {
      bags: concreteBags,
      poundsPerBag: 80,
    },
    tensioners: {
      quantity: Math.ceil(totalLength / 660) * 2, // every ~660 ft, top & bottom
    },
    extras: [],
  };
}

/**
 * Estimate labor for a fencing project.
 */
export function calculateLaborEstimate(
  fenceLines: FenceLine[],
  fenceHeight: FenceHeight,
  hourlyRate: number = 45
): LaborEstimate {
  const totalLength = fenceLines.reduce((sum, line) => sum + line.totalLengthFeet, 0);
  const segments = fenceLines.flatMap((line) => line.segments);
  const avgDifficulty = getAverageDifficulty(segments);

  const difficultyMultiplier: Record<TerrainDifficulty, number> = {
    easy: 1.0,
    moderate: 1.3,
    difficult: 1.7,
    very_difficult: 2.2,
  };

  const heightMultiplier: Record<FenceHeight, number> = {
    '4ft': 1.0,
    '5ft': 1.1,
    '6ft': 1.25,
    '7ft': 1.4,
    '8ft': 1.6,
  };

  // Base rate: ~150 ft per day with 3-person crew on flat ground
  const baseFeetPerDay = 150;
  const crewSize = 3;
  const effectiveFeetPerDay = baseFeetPerDay / (difficultyMultiplier[avgDifficulty] * heightMultiplier[fenceHeight]);
  const days = Math.ceil(totalLength / effectiveFeetPerDay);
  const totalHours = days * 8 * crewSize;

  return {
    totalHours,
    crewSize,
    days,
    difficultyMultiplier: difficultyMultiplier[avgDifficulty],
    hourlyRate,
    totalLaborCost: totalHours * hourlyRate,
  };
}

/**
 * Determine terrain difficulty from elevation change and slope.
 */
export function classifyTerrain(
  elevationChangeFeet: number,
  segmentLengthFeet: number,
  soilType?: string
): TerrainDifficulty {
  const slopePercent = Math.abs(elevationChangeFeet / segmentLengthFeet) * 100;

  let baseDifficulty: TerrainDifficulty;
  if (slopePercent < 5) baseDifficulty = 'easy';
  else if (slopePercent < 15) baseDifficulty = 'moderate';
  else if (slopePercent < 30) baseDifficulty = 'difficult';
  else baseDifficulty = 'very_difficult';

  // Adjust for soil type
  if (soilType) {
    const hardSoils = ['rock', 'caliche', 'hardpan', 'clay'];
    if (hardSoils.some((s) => soilType.toLowerCase().includes(s))) {
      const levels: TerrainDifficulty[] = ['easy', 'moderate', 'difficult', 'very_difficult'];
      const idx = levels.indexOf(baseDifficulty);
      baseDifficulty = levels[Math.min(idx + 1, 3)];
    }
  }

  return baseDifficulty;
}

/**
 * Calculate the distance between two geographic points in feet.
 */
export function geoDistanceFeet(a: GeoPoint, b: GeoPoint): number {
  const R = 20902231; // Earth's radius in feet
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));

  return R * c;
}

// ---- Internal helpers ----

function countCorners(fenceLines: FenceLine[]): number {
  let corners = 0;
  for (const line of fenceLines) {
    if (line.points.length > 2) {
      corners += line.points.length - 2; // each intermediate point is a corner
    }
  }
  return Math.max(corners, 2); // minimum 2 corners (end posts)
}

function getAverageDifficulty(segments: FenceSegment[]): TerrainDifficulty {
  if (segments.length === 0) return 'moderate';

  const levels: TerrainDifficulty[] = ['easy', 'moderate', 'difficult', 'very_difficult'];
  const avg =
    segments.reduce((sum, seg) => sum + levels.indexOf(seg.terrainDifficulty), 0) /
    segments.length;

  return levels[Math.round(avg)];
}

function getPostDiameter(fenceType: FenceType): string {
  switch (fenceType) {
    case 'pipe_fence':
      return '2-7/8" pipe';
    case 'stay_tuff_fixed_knot':
    case 'stay_tuff_hinge_joint':
      return '5-6" treated';
    default:
      return '4-5" treated';
  }
}

function getBracingType(fenceType: FenceType): string {
  if (fenceType.startsWith('stay_tuff')) {
    return 'H-brace with steel brace pin & 9ga wire';
  }
  return 'H-brace assembly';
}

function calculateWireRolls(
  totalLengthFeet: number,
  fenceType: FenceType,
  stayTuffOption?: StayTuffOption
): { rolls: number; feetPerRoll: number; totalFeet: number; type: string } {
  let feetPerRoll: number;
  let type: string;

  if (fenceType.startsWith('stay_tuff') && stayTuffOption) {
    feetPerRoll = stayTuffOption.rollLength;
    type = `Stay Tuff ${stayTuffOption.spec} (${stayTuffOption.description})`;
  } else if (fenceType === 'field_fence') {
    feetPerRoll = 330;
    type = 'Field fence wire';
  } else if (fenceType === 'no_climb') {
    feetPerRoll = 200;
    type = 'No-climb horse fence';
  } else if (fenceType === 'barbed_wire') {
    feetPerRoll = 1320;
    type = '12.5ga barbed wire';
  } else {
    feetPerRoll = 330;
    type = 'Woven wire fence';
  }

  const rolls = Math.ceil(totalLengthFeet / feetPerRoll);

  return {
    rolls,
    feetPerRoll,
    totalFeet: totalLengthFeet,
    type,
  };
}
