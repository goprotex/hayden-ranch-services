// ============================================================
// Terrain Analysis: Elevation + Soil data for auto-difficulty
// Uses Mapbox Terrain-RGB tiles, UC Davis SoilWeb, and USDA NRCS
// ============================================================

export interface ElevationPoint {
  lng: number;
  lat: number;
  elevation: number; // feet
}

export interface SoilInfo {
  soilType: string | null;
  drainage: string | null;
  hydric: string | null;
  components: { name: string; percent: number; drainage?: string; hydric?: string }[];
  source: string | null;
  // Enriched SDA data (may be null if SDA query failed)
  bedrockDepthIn: number | null;      // depth to bedrock in inches
  restrictionType: string | null;     // e.g. "Lithic bedrock"
  slopeRange: string | null;          // e.g. "1-10%"
  slopeLow: number | null;
  slopeHigh: number | null;
  runoff: string | null;              // e.g. "Medium", "High"
  taxonomy: string | null;            // full taxonomic class
  taxOrder: string | null;            // e.g. "Mollisols"
  texture: string | null;             // e.g. "Very cobbly clay"
  clayPct: number | null;             // clay %
  sandPct: number | null;
  rockFragmentPct: number | null;     // coarse fragment %
  pH: number | null;
  organicMatter: number | null;
}

export interface TerrainAnalysis {
  elevationProfile: ElevationPoint[];
  avgElevation: number;
  minElevation: number;
  maxElevation: number;
  totalElevationChange: number;
  avgSlope: number; // percent
  maxSlope: number;
  soilType: string | null;
  soilInfo: SoilInfo | null;
  soilDifficulty: 'easy' | 'moderate' | 'hard' | 'very_hard';
  suggestedDifficulty: 'easy' | 'moderate' | 'difficult' | 'very_difficult';
  confidence: number; // 0-1
}

/**
 * Fetch elevation for a point using Mapbox Terrain-RGB tiles
 */
export async function getElevation(lng: number, lat: number, token: string): Promise<number> {
  try {
    const zoom = 14;
    const tileX = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
    const latRad = (lat * Math.PI) / 180;
    const tileY = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, zoom));

    const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${zoom}/${tileX}/${tileY}.pngraw?access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return 0;

    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;

    ctx.drawImage(bitmap, 0, 0);

    // Calculate pixel position within tile
    const scale = Math.pow(2, zoom);
    const worldX = ((lng + 180) / 360) * scale;
    const worldY = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * scale;
    const pixelX = Math.floor((worldX - tileX) * 256);
    const pixelY = Math.floor((worldY - tileY) * 256);

    const pixel = ctx.getImageData(
      Math.min(pixelX, 255),
      Math.min(pixelY, 255),
      1, 1
    ).data;

    // Decode Terrain-RGB: elevation = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)
    const elevationMeters = -10000 + ((pixel[0] * 256 * 256 + pixel[1] * 256 + pixel[2]) * 0.1);
    return elevationMeters * 3.28084; // convert to feet
  } catch {
    return 0;
  }
}

/**
 * Get elevations along a fence line (sampling every ~50ft)
 */
export async function getElevationProfile(
  coords: [number, number][],
  token: string,
  sampleInterval: number = 50, // feet
): Promise<ElevationPoint[]> {
  const points: ElevationPoint[] = [];

  for (let i = 0; i < coords.length; i++) {
    const elev = await getElevation(coords[i][0], coords[i][1], token);
    points.push({ lng: coords[i][0], lat: coords[i][1], elevation: elev });

    // Sample between vertices for long segments
    if (i < coords.length - 1) {
      const segLen = haversineDistance(coords[i], coords[i + 1]);
      const numSamples = Math.floor(segLen / sampleInterval);
      for (let j = 1; j < numSamples && j < 10; j++) {
        const t = j / numSamples;
        const lng = coords[i][0] + t * (coords[i + 1][0] - coords[i][0]);
        const lat = coords[i][1] + t * (coords[i + 1][1] - coords[i][1]);
        const elev = await getElevation(lng, lat, token);
        points.push({ lng, lat, elevation: elev });
      }
    }
  }

  return points;
}

/**
 * Query soil type via our server-side proxy (avoids CORS)
 * Returns rich soil info from UC Davis SoilWeb or USDA fallbacks
 */
export async function getSoilType(lng: number, lat: number): Promise<string | null> {
  const info = await getSoilInfo(lng, lat);
  return info?.soilType ?? null;
}

/**
 * Get detailed soil info (type, drainage, hydric, components)
 */
export async function getSoilInfo(lng: number, lat: number): Promise<SoilInfo | null> {
  // Try our API proxy first (server-side, no CORS issues)
  try {
    const proxyRes = await fetch('/api/soil', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lng, lat }),
    });
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data?.soilType) {
        return {
          soilType: data.soilType,
          drainage: data.drainage || null,
          hydric: data.hydric || null,
          components: data.components || [],
          source: data.source || null,
          // Enriched SDA data
          bedrockDepthIn: data.bedrockDepthIn ?? null,
          restrictionType: data.restrictionType ?? null,
          slopeRange: data.slopeRange ?? null,
          slopeLow: data.slopeLow ?? null,
          slopeHigh: data.slopeHigh ?? null,
          runoff: data.runoff ?? null,
          taxonomy: data.taxonomy ?? null,
          taxOrder: data.taxOrder ?? null,
          texture: data.texture ?? null,
          clayPct: data.clayPct ?? null,
          sandPct: data.sandPct ?? null,
          rockFragmentPct: data.rockFragmentPct ?? null,
          pH: data.pH ?? null,
          organicMatter: data.organicMatter ?? null,
        };
      }
    }
  } catch {
    // Proxy failed, fall through to direct query
  }

  // Fallback: direct USDA SDA query (may hit CORS in browser)
  try {
    const url = `https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest`;
    const query = `SELECT musym, muname FROM mapunit 
      INNER JOIN component ON mapunit.mukey = component.mukey 
      WHERE mukey IN (
        SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84(
          'POINT(${lng} ${lat})'
        )
      ) LIMIT 1`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, format: 'JSON' }),
    });

    if (!res.ok) return null;
    const data = await res.json();

    if (data?.Table && data.Table.length > 0) {
      const soilType = data.Table[0][1] || data.Table[0][0] || null;
      return {
        soilType,
        drainage: null,
        hydric: null,
        components: [],
        source: 'USDA_SDA_Direct',
        bedrockDepthIn: null,
        restrictionType: null,
        slopeRange: null,
        slopeLow: null,
        slopeHigh: null,
        runoff: null,
        taxonomy: null,
        taxOrder: null,
        texture: null,
        clayPct: null,
        sandPct: null,
        rockFragmentPct: null,
        pH: null,
        organicMatter: null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Classify soil difficulty based on soil name, drainage, and enriched SDA data
 */
export function classifySoilDifficulty(
  soilType: string | null,
  drainage?: string | null,
  soilInfo?: SoilInfo | null,
): 'easy' | 'moderate' | 'hard' | 'very_hard' {
  // If we have enriched SDA data, use it for precise classification
  if (soilInfo) {
    let score = 0;

    // Bedrock depth is the #1 factor for fencing difficulty
    if (soilInfo.bedrockDepthIn != null) {
      if (soilInfo.bedrockDepthIn <= 12) score += 40;       // <1 foot — rock drill required
      else if (soilInfo.bedrockDepthIn <= 24) score += 25;  // 1-2 feet — very shallow
      else if (soilInfo.bedrockDepthIn <= 36) score += 10;  // 2-3 feet — tight for a 3' set
    }

    // Rock fragment percentage — cobbles destroy auger bits
    if (soilInfo.rockFragmentPct != null) {
      if (soilInfo.rockFragmentPct >= 40) score += 20;
      else if (soilInfo.rockFragmentPct >= 20) score += 10;
      else if (soilInfo.rockFragmentPct >= 10) score += 5;
    }

    // Clay content — swelling clays shift posts
    if (soilInfo.clayPct != null) {
      if (soilInfo.clayPct >= 50) score += 10;
      else if (soilInfo.clayPct >= 35) score += 5;
    }

    // Slope from USDA
    if (soilInfo.slopeHigh != null) {
      if (soilInfo.slopeHigh >= 30) score += 15;
      else if (soilInfo.slopeHigh >= 15) score += 8;
      else if (soilInfo.slopeHigh >= 8) score += 3;
    }

    // Poor drainage = wet difficult digging
    if (soilInfo.drainage) {
      const d = soilInfo.drainage.toLowerCase();
      if (d.includes('very poorly')) score += 10;
      else if (d.includes('poorly')) score += 7;
    }

    if (score >= 40) return 'very_hard';
    if (score >= 25) return 'hard';
    if (score >= 10) return 'moderate';
    return 'easy';
  }

  // Fallback: text-based classification
  if (!soilType) return 'moderate';
  const lower = soilType.toLowerCase();

  // Very hard soils (rock-based)
  if (['limestone', 'caliche', 'bedrock', 'granite', 'sandstone', 'shale', 'rock outcrop', 'eckrant'].some(s => lower.includes(s))) {
    return 'very_hard';
  }
  // Hard soils (clay, rocky, steep)
  if (['clay', 'hardpan', 'rocky', 'rock', 'gravel', 'cobble', 'brackett', 'comfort'].some(s => lower.includes(s))) {
    return 'hard';
  }
  // Also check slope info embedded in name (e.g. "8 to 30 percent slopes")
  const slopeMatch = lower.match(/(\d+)\s*to\s*(\d+)\s*percent\s*slopes?/);
  if (slopeMatch) {
    const maxSlope = parseInt(slopeMatch[2], 10);
    if (maxSlope >= 30) return 'very_hard';
    if (maxSlope >= 15) return 'hard';
  }

  // Check drainage classification
  if (drainage) {
    const drainLower = drainage.toLowerCase();
    if (drainLower.includes('poorly') || drainLower.includes('very poorly')) {
      return 'hard'; // wet soils = harder to dig
    }
  }

  // Easy soils
  if (['sand', 'loam', 'silt', 'alluvial', 'bottomland', 'purves'].some(s => lower.includes(s))) {
    return 'easy';
  }
  return 'moderate';
}

/**
 * Full terrain analysis for a fence line
 */
export async function analyzeTerrain(
  coords: [number, number][],
  token: string,
): Promise<TerrainAnalysis> {
  // Get elevation profile
  const profile = await getElevationProfile(coords, token);

  const elevations = profile.map(p => p.elevation).filter(e => e > 0);
  const avgElevation = elevations.length > 0 ? elevations.reduce((s, e) => s + e, 0) / elevations.length : 0;
  const minElevation = elevations.length > 0 ? Math.min(...elevations) : 0;
  const maxElevation = elevations.length > 0 ? Math.max(...elevations) : 0;
  const totalElevationChange = maxElevation - minElevation;

  // Calculate slopes between consecutive points
  const slopes: number[] = [];
  for (let i = 1; i < profile.length; i++) {
    const dist = haversineDistance(
      [profile[i - 1].lng, profile[i - 1].lat],
      [profile[i].lng, profile[i].lat]
    );
    if (dist > 0) {
      const elevChange = Math.abs(profile[i].elevation - profile[i - 1].elevation);
      slopes.push((elevChange / dist) * 100);
    }
  }

  const avgSlope = slopes.length > 0 ? slopes.reduce((s, v) => s + v, 0) / slopes.length : 0;
  const maxSlope = slopes.length > 0 ? Math.max(...slopes) : 0;

  // Get soil info at midpoint
  const midIdx = Math.floor(coords.length / 2);
  const soilInfo = await getSoilInfo(coords[midIdx][0], coords[midIdx][1]);
  const soilType = soilInfo?.soilType ?? null;
  const soilDifficulty = classifySoilDifficulty(soilType, soilInfo?.drainage ?? null, soilInfo);

  // Calculate suggested difficulty
  const suggestedDifficulty = calculateSuggestedDifficulty(avgSlope, maxSlope, soilDifficulty, totalElevationChange);

  // Confidence based on data quality
  const confidence = elevations.length > 2 ? 0.8 : elevations.length > 0 ? 0.5 : 0.2;

  return {
    elevationProfile: profile,
    avgElevation,
    minElevation,
    maxElevation,
    totalElevationChange,
    avgSlope,
    maxSlope,
    soilType,
    soilInfo,
    soilDifficulty,
    suggestedDifficulty,
    confidence,
  };
}

function calculateSuggestedDifficulty(
  avgSlope: number,
  maxSlope: number,
  soilDifficulty: string,
  elevationChange: number,
): 'easy' | 'moderate' | 'difficult' | 'very_difficult' {
  let score = 0;

  // Slope scoring (0-40 points)
  if (avgSlope < 5) score += 5;
  else if (avgSlope < 10) score += 15;
  else if (avgSlope < 20) score += 25;
  else score += 40;

  // Max slope scoring (0-20 points)
  if (maxSlope > 30) score += 20;
  else if (maxSlope > 20) score += 12;
  else if (maxSlope > 10) score += 6;

  // Soil scoring (0-25 points)
  if (soilDifficulty === 'very_hard') score += 25;
  else if (soilDifficulty === 'hard') score += 15;
  else if (soilDifficulty === 'moderate') score += 8;

  // Elevation change scoring (0-15 points)
  if (elevationChange > 200) score += 15;
  else if (elevationChange > 100) score += 10;
  else if (elevationChange > 50) score += 5;

  if (score < 15) return 'easy';
  if (score < 35) return 'moderate';
  if (score < 60) return 'difficult';
  return 'very_difficult';
}

function haversineDistance(a: [number, number], b: [number, number]): number {
  const R = 20902231; // Earth radius in feet
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
