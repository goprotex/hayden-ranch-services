import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy for soil data queries.
 * Strategy:
 *   1. UC Davis SoilWeb (fast, reliable) → mukey + muname
 *   2. UC Davis list_components → drainage, hydric, slope details
 *   3. Fallback: USDA SDA REST API
 *   4. Fallback: SSURGO WFS endpoint
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lng, lat } = body;

    if (typeof lng !== 'number' || typeof lat !== 'number') {
      return NextResponse.json({ error: 'Missing lng/lat' }, { status: 400 });
    }

    // 1. Try UC Davis SoilWeb (primary – fast & reliable)
    const ucDavisResult = await queryUCDavisSoilWeb(lng, lat);
    if (ucDavisResult) {
      return NextResponse.json({
        soilType: ucDavisResult.muname,
        mukey: ucDavisResult.mukey,
        musym: ucDavisResult.musym,
        drainage: ucDavisResult.drainage,
        hydric: ucDavisResult.hydric,
        components: ucDavisResult.components,
        source: 'UC_Davis_SoilWeb',
      });
    }

    // 2. Try USDA SDA REST API
    const soilType = await querySDA(lng, lat);
    if (soilType) {
      return NextResponse.json({ soilType, source: 'USDA_SDA' });
    }

    // 3. Try SSURGO WFS endpoint
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

// ─── UC Davis SoilWeb ─────────────────────────────────────────────

interface SoilComponent {
  name: string;
  percent: number;
  drainage?: string;
  hydric?: string;
}

interface UCDavisResult {
  mukey: string;
  muname: string;
  musym: string;
  drainage: string | null;
  hydric: string | null;
  components: SoilComponent[];
}

async function queryUCDavisSoilWeb(lng: number, lat: number): Promise<UCDavisResult | null> {
  try {
    // Step 1: Get mukey from coordinates
    const mapunitUrl = `https://casoilresource.lawr.ucdavis.edu/soil_web/reflector_api/soils.php?what=mapunit&lon=${lng}&lat=${lat}`;

    const controller1 = new AbortController();
    const timeout1 = setTimeout(() => controller1.abort(), 8000);

    const res1 = await fetch(mapunitUrl, { signal: controller1.signal });
    clearTimeout(timeout1);

    if (!res1.ok) return null;

    const text1 = await res1.text();

    // ── Parse the mapunit HTML table ──
    // The data row looks like:
    //   <tr class="record"><td> 32441002 </td><td> tx601 </td><td> 11 </td><td> 373903 </td><td><a ...>373903</a></td></tr>
    // Columns: ogc_fid | areasymbol | Map Symbol (musym) | mukey | Map Unit (link)

    // Extract the data row (class="record"), skip header row (class='heading')
    const recordMatch = text1.match(/<tr\s+class="record"[^>]*>([\s\S]*?)<\/tr>/i);
    if (!recordMatch) {
      console.warn('UC Davis: no record row found in mapunit response');
      return null;
    }

    // Extract all cell values from the record row (strip HTML tags, trim whitespace)
    const cells = [...recordMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(m => m[1].replace(/<[^>]*>/g, '').trim());

    // cells[0]=ogc_fid, cells[1]=areasymbol, cells[2]=musym, cells[3]=mukey, cells[4]=mukey(link text)
    if (cells.length < 4) {
      console.warn('UC Davis: insufficient cells in record row', cells);
      return null;
    }

    const mukey = cells[3];
    const musym = cells[2];

    if (!mukey || !/^\d+$/.test(mukey)) {
      console.warn('UC Davis: invalid mukey parsed:', mukey);
      return null;
    }

    // Step 2: Get component details (soil name, drainage, hydric, etc.)
    const components = await queryUCDavisComponents(mukey);

    return {
      mukey,
      muname: components.muname || `Map unit ${mukey}`,
      musym,
      drainage: components.primaryDrainage,
      hydric: components.primaryHydric,
      components: components.list,
    };
  } catch (err) {
    console.error('UC Davis SoilWeb query failed:', err);
    return null;
  }
}

async function queryUCDavisComponents(mukey: string): Promise<{
  muname: string;
  primaryDrainage: string | null;
  primaryHydric: string | null;
  list: SoilComponent[];
}> {
  try {
    const url = `https://casoilresource.lawr.ucdavis.edu/soil_web/list_components.php?mukey=${mukey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return { muname: '', primaryDrainage: null, primaryHydric: null, list: [] };

    const html = await res.text();

    // ── Extract map unit name ──
    // Appears as: <div style="font-weight: bold; ...">Eckrant-Rock outcrop association, 1 to 10 percent slopes</div>
    const munameMatch = html.match(/<div[^>]*font-weight:\s*bold[^>]*>([^<]+)<\/div>/i) ||
                         html.match(/<h\d[^>]*>([^<]+)<\/h\d>/i);
    const muname = munameMatch ? munameMatch[1].trim() : '';

    // ── Extract component info ──
    // Each component looks like:
    //   <span style="...font-weight: bold;">Eckrant</span> (58%)
    //   followed by drainage (e.g., "Well drained") and "Hydric: No"
    const components: SoilComponent[] = [];

    // Find all component blocks: bold name span followed by percentage
    const compMatches = [...html.matchAll(/<span[^>]*font-weight:\s*bold[^>]*>([^<]+)<\/span>\s*\((\d+)%\)/gi)];
    for (const match of compMatches) {
      const name = match[1].trim();
      const percent = parseInt(match[2], 10);
      if (name && percent > 0) {
        components.push({ name, percent });
      }
    }

    // If the span pattern didn't work, try plain text pattern
    if (components.length === 0) {
      const plainMatches = [...html.matchAll(/([A-Z][A-Za-z\s-]+?)\s*\((\d+)%\)/g)];
      for (const match of plainMatches) {
        components.push({
          name: match[1].trim(),
          percent: parseInt(match[2], 10),
        });
      }
    }

    // ── Extract drainage info ──
    // Appears as plain text within the component's cell, e.g., "Well drained<br>"
    const drainageMatch = html.match(/(Well drained|Moderately well drained|Somewhat poorly drained|Poorly drained|Very poorly drained|Somewhat excessively drained|Excessively drained)/i);
    const primaryDrainage = drainageMatch ? drainageMatch[1] : null;

    // ── Extract hydric info ──
    // Appears as "Hydric: No" or "Hydric: Yes"
    const hydricMatch = html.match(/Hydric:\s*(Yes|No)/i);
    const primaryHydric = hydricMatch ? hydricMatch[1] : null;

    // Attach drainage/hydric to the first component
    if (components.length > 0 && primaryDrainage) {
      components[0].drainage = primaryDrainage;
    }
    if (components.length > 0 && primaryHydric) {
      components[0].hydric = primaryHydric;
    }

    return { muname, primaryDrainage, primaryHydric, list: components };
  } catch {
    return { muname: '', primaryDrainage: null, primaryHydric: null, list: [] };
  }
}

// ─── USDA SDA REST API ─────────────────────────────────────────────
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
