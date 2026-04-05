// ============================================================
// Shared Material Prices API
// GET  → returns the current shared prices (or defaults)
// POST → saves updated prices for all users
//
// Uses Supabase in production (reliable, no CDN caching).
// Falls back to local filesystem in development.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_MATERIAL_PRICES, MaterialPrice } from '@/lib/fencing/fence-materials';
import { IS_SUPABASE, getSupabase } from '@/lib/supabase/client';

const SETTINGS_KEY = 'material-prices';

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
  const payload = { prices, updatedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, 'shared-prices.json'), JSON.stringify(payload, null, 2), 'utf-8');
}

// ── Supabase storage (production) ─────────────────────────
async function readSupabase(): Promise<MaterialPrice[] | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .single();

  if (error || !data) return null;
  const prices = (data.value as { prices: MaterialPrice[] }).prices;
  if (!Array.isArray(prices) || prices.length === 0) return null;

  // Backfill any catalog items added since the last save
  const savedIds = new Set(prices.map(p => p.id));
  const missing = DEFAULT_MATERIAL_PRICES.filter(d => !savedIds.has(d.id));
  return [...prices, ...missing];
}

async function writeSupabase(prices: MaterialPrice[]): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from('app_settings')
    .upsert({ key: SETTINGS_KEY, value: { prices, updatedAt: new Date().toISOString() } });
  if (error) throw error;
}

// ── Route handlers ────────────────────────────────────────
export async function GET() {
  try {
    const saved = IS_SUPABASE ? await readSupabase() : await readLocal();
    if (saved) {
      return NextResponse.json({ prices: saved, count: saved.length, source: 'saved' });
    }
    return NextResponse.json({
      prices: DEFAULT_MATERIAL_PRICES,
      count: DEFAULT_MATERIAL_PRICES.length,
      source: 'defaults',
    });
  } catch (err) {
    console.error('[material-prices] GET failed:', err);
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
      return NextResponse.json({ error: 'Invalid payload: prices array required' }, { status: 400 });
    }
    for (const p of prices) {
      if (!p.id || typeof p.price !== 'number') {
        return NextResponse.json({ error: `Invalid price entry: ${JSON.stringify(p)}` }, { status: 400 });
      }
    }

    if (IS_SUPABASE) {
      await writeSupabase(prices);
    } else {
      await writeLocal(prices);
    }

    return NextResponse.json({ success: true, count: prices.length, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[material-prices] POST failed:', err);
    return NextResponse.json({ error: 'Failed to save prices' }, { status: 500 });
  }
}
