import {
  FenceType,
  FenceHeight,
  FenceLine,
  FenceSegment,
  FenceMaterialList,
  LaborEstimate,
  GeoPoint,
  TerrainDifficulty,
  StayTuffOption,
} from '@/types';

/** Stay Tuff product options */
export const STAY_TUFF_OPTIONS: StayTuffOption[] = [
  { model: '12.5/49/6', height: 49, horizontalWires: 9, verticalSpacing: 6, description: '49" Fixed Knot, 6" stays - Cattle/Horse' },
  { model: '12.5/60/6', height: 60, horizontalWires: 11, verticalSpacing: 6, description: '60" Fixed Knot, 6" stays - Cattle/Horse' },
  { model: '14/72/6', height: 72, horizontalWires: 13, verticalSpacing: 6, description: '72" Fixed Knot, 6" stays - Deer/Elk' },
  { model: '12.5/49/3', height: 49, horizontalWires: 13, verticalSpacing: 3, description: '49" Fixed Knot, 3" stays - Sheep/Goat' },
  { model: '12.5/60/3', height: 60, horizontalWires: 17, verticalSpacing: 3, description: '60" Fixed Knot, 3" stays - Sheep/Goat' },
  { model: '15/96/6', height: 96, horizontalWires: 17, verticalSpacing: 6, description: '96" Fixed Knot, 6" stays - Elk/Game' },
];

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
    feetPerRoll = 330; // standard Stay Tuff roll
    type = `Stay Tuff ${stayTuffOption.model} (${stayTuffOption.description})`;
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
