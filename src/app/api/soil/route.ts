import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy for USDA NRCS Soil Data Access (SDA) API
 * Avoids CORS issues by making the request server-side.
 * Also uses the alternate SSURGO WFS endpoint as fallback.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lng, lat } = body;

    if (typeof lng !== 'number' || typeof lat !== 'number') {
      return NextResponse.json({ error: 'Missing lng/lat' }, { status: 400 });
    }

    // Try primary: USDA SDA REST API
    const soilType = await querySDA(lng, lat);
    if (soilType) {
      return NextResponse.json({ soilType, source: 'USDA_SDA' });
    }

    // Try fallback: SSURGO WFS endpoint
    const fallbackSoil = await querySSURGO_WFS(lng, lat);
    if (fallbackSoil) {
      return NextResponse.json({ soilType: fallbackSoil, source: 'SSURGO_WFS' });
    }

    return NextResponse.json({ soilType: null, source: null });
  } catch (err) {
    console.error('Soil API error:', err);
    return NextResponse.json({ error: 'Soil query failed' }, { status: 500 });
  }
}

/**
 * Primary: USDA Soil Data Access tabular query
 */
async function querySDA(lng: number, lat: number): Promise<string | null> {
  const url = 'https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest';
  const query = `SELECT TOP 1 musym, muname FROM mapunit 
    INNER JOIN component ON mapunit.mukey = component.mukey 
    WHERE mukey IN (
      SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84(
        'POINT(${lng} ${lat})'
      )
    )`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, format: 'JSON' }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        if (attempt < 2) { await delay(1000 * (attempt + 1)); continue; }
        return null;
      }

      const data = await res.json();
      if (data?.Table && data.Table.length > 0) {
        // Table[0][1] = muname (soil name), Table[0][0] = musym (symbol)
        return data.Table[0][1] || data.Table[0][0] || null;
      }
      return null;
    } catch (err) {
      if (attempt < 2) { await delay(1000 * (attempt + 1)); continue; }
      console.error('SDA query failed after retries:', err);
      return null;
    }
  }
  return null;
}

/**
 * Fallback: SSURGO Web Feature Service spatial query
 */
async function querySSURGO_WFS(lng: number, lat: number): Promise<string | null> {
  try {
    // Use the NRCS Soil Survey Area WFS endpoint
    const bbox = `${lng - 0.001},${lat - 0.001},${lng + 0.001},${lat + 0.001}`;
    const url = `https://sdmdataaccess.sc.egov.usda.gov/Spatial/SDMWGS84Geographic.wfs?Service=WFS&Version=1.1.0&Request=GetFeature&Typename=MapunitPoly&BBOX=${bbox}&outputFormat=application/json&MaxFeatures=1`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    if (data?.features?.[0]?.properties) {
      const props = data.features[0].properties;
      return props.muname || props.musym || null;
    }
    return null;
  } catch {
    return null;
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
