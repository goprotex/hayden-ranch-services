// ============================================================
// Shared Material Prices API
// GET  → returns the current shared prices (or defaults)
// POST → saves updated prices for all users
//
// Uses @vercel/kv in production (no CDN caching, always fresh).
// Falls back to local filesystem in development.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_MATERIAL_PRICES, MaterialPrice } from '@/lib/fencing/fence-materials';

const PRICES_KEY = 'hayden:material-prices';
const IS_KV = !!process.env.KV_REST_API_URL;

// ── Local filesystem fallback (dev only) ──────────────────
async function readLocal(): Promise<MaterialPrice[] | null> {
  const fs = await import('fs');
  const path = await import('path');
  const filePath = path.join(process.cwd(), 'data', 'shared-prices.json');
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw) as { prices: MaterialPrice[] };
      if (Array.isArray(data.prices) && data.prices.length > 0) {
        const savedIds = new Set(data.prices.map(p => p.id));
        const missing = DEFAULT_MATERIAL_PRICES.filter(d => !savedIds.has(d.id));
        return [...data.prices, ...missing];
      }
    }
  } catch { /* corrupted or missing */ }
  return null;
}

async function writeLocal(prices: MaterialPrice[]): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');
  const dir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const payload = { prices, updatedAt: new Date().toISOString(), version: 1 };
  fs.writeFileSync(path.join(dir, 'shared-prices.json'), JSON.stringify(payload, null, 2), 'utf-8');
}

// ── Vercel KV storage (production) ────────────────────────
async function readKV(): Promise<MaterialPrice[] | null> {
  const { kv } = await import('@vercel/kv');
  try {
    const data = await kv.get<{ prices: MaterialPrice[] }>(PRICES_KEY);
    if (data?.prices && Array.isArray(data.prices) && data.prices.length > 0) {
      // Backfill any catalog items added since the last save
      const savedIds = new Set(data.prices.map(p => p.id));
      const missing = DEFAULT_MATERIAL_PRICES.filter(d => !savedIds.has(d.id));
      return [...data.prices, ...missing];
    }
  } catch (err) {
    console.error('[SharedPricing] KV read error:', err);
  }
  return null;
}

async function writeKV(prices: MaterialPrice[]): Promise<void> {
  const { kv } = await import('@vercel/kv');
  await kv.set(PRICES_KEY, { prices, updatedAt: new Date().toISOString(), version: 1 });
}

// ── Route handlers ────────────────────────────────────────
export async function GET() {
  try {
    const saved = IS_KV ? await readKV() : await readLocal();
    if (saved) {
      return NextResponse.json({ prices: saved, count: saved.length, source: 'saved' });
    }
    // No saved prices yet — return defaults so client knows to keep local state
    return NextResponse.json({
      prices: DEFAULT_MATERIAL_PRICES,
      count: DEFAULT_MATERIAL_PRICES.length,
      source: 'defaults',
    });
  } catch (err) {
    console.error('Failed to read shared prices:', err);
    return NextResponse.json({
      prices: DEFAULT_MATERIAL_PRICES,
      count: DEFAULT_MATERIAL_PRICES.length,
      source: 'defaults',
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const prices = body.prices as MaterialPrice[];

    if (!Array.isArray(prices) || prices.length === 0) {
      return NextResponse.json(
        { error: 'Invalid payload: prices array required' },
        { status: 400 }
      );
    }

    for (const p of prices) {
      if (!p.id || typeof p.price !== 'number') {
        return NextResponse.json(
          { error: `Invalid price entry: ${JSON.stringify(p)}` },
          { status: 400 }
        );
      }
    }

    if (IS_KV) {
      await writeKV(prices);
    } else {
      await writeLocal(prices);
    }

    return NextResponse.json({
      success: true,
      count: prices.length,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to save shared prices:', err);
    return NextResponse.json({ error: 'Failed to save prices' }, { status: 500 });
  }
}
