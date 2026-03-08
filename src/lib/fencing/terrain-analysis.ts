// ============================================================
// Terrain Analysis: Elevation + Soil data for auto-difficulty
// Uses Mapbox Terrain-RGB tiles and USDA NRCS soil data
// ============================================================

export interface ElevationPoint {
  lng: number;
  lat: number;
  elevation: number; // feet
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
 * Falls back to direct USDA query if proxy unavailable
 */
export async function getSoilType(lng: number, lat: number): Promise<string | null> {
  // Try our API proxy first (server-side, no CORS issues)
  try {
    const proxyRes = await fetch('/api/soil', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lng, lat }),
    });
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data?.soilType) return data.soilType;
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
      return data.Table[0][1] || data.Table[0][0] || null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Classify soil difficulty based on soil name
 */
export function classifySoilDifficulty(soilType: string | null): 'easy' | 'moderate' | 'hard' | 'very_hard' {
  if (!soilType) return 'moderate';
  const lower = soilType.toLowerCase();

  // Very hard soils
  if (['limestone', 'caliche', 'bedrock', 'granite', 'sandstone', 'shale'].some(s => lower.includes(s))) {
    return 'very_hard';
  }
  // Hard soils
  if (['clay', 'hardpan', 'rocky', 'rock', 'gravel', 'cobble'].some(s => lower.includes(s))) {
    return 'hard';
  }
  // Easy soils
  if (['sand', 'loam', 'silt', 'alluvial', 'bottomland'].some(s => lower.includes(s))) {
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

  // Get soil type at midpoint
  const midIdx = Math.floor(coords.length / 2);
  const soilType = await getSoilType(coords[midIdx][0], coords[midIdx][1]);
  const soilDifficulty = classifySoilDifficulty(soilType);

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
