// ============================================================
// Shared Material Prices API
// GET  → returns the current shared prices (or defaults)
// POST → saves updated prices for all users
//
// Uses @vercel/blob in production for persistent cross-instance
// storage, and local filesystem in development.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_MATERIAL_PRICES, MaterialPrice } from '@/lib/fencing/fence-materials';

const BLOB_NAME = 'shared-prices.json';
const BLOB_TOKEN = process.env.Price_update_READ_WRITE_TOKEN || '';
const IS_VERCEL = !!BLOB_TOKEN;

// ── Local filesystem fallback (dev only) ──────────────────
async function readLocal(): Promise<MaterialPrice[]> {
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
  return [...DEFAULT_MATERIAL_PRICES];
}

async function writeLocal(prices: MaterialPrice[]): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');
  const dir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const payload = { prices, updatedAt: new Date().toISOString(), version: 1 };
  fs.writeFileSync(path.join(dir, 'shared-prices.json'), JSON.stringify(payload, null, 2), 'utf-8');
}

// ── Vercel Blob storage (production) ──────────────────────
async function readBlob(): Promise<MaterialPrice[]> {
  const { list, head } = await import('@vercel/blob');
  try {
    // Find the blob by listing with prefix
    const { blobs } = await list({ prefix: BLOB_NAME, limit: 1, token: BLOB_TOKEN });
    if (blobs.length === 0) return [...DEFAULT_MATERIAL_PRICES];
    const blobMeta = await head(blobs[0].url, { token: BLOB_TOKEN });
    const res = await fetch(blobMeta.url);
    if (!res.ok) return [...DEFAULT_MATERIAL_PRICES];
    const data = await res.json() as { prices: MaterialPrice[] };
    if (Array.isArray(data.prices) && data.prices.length > 0) {
      const savedIds = new Set(data.prices.map(p => p.id));
      const missing = DEFAULT_MATERIAL_PRICES.filter(d => !savedIds.has(d.id));
      return [...data.prices, ...missing];
    }
  } catch (err) {
    console.error('[SharedPricing] Blob read error:', err);
  }
  return [...DEFAULT_MATERIAL_PRICES];
}

async function writeBlob(prices: MaterialPrice[]): Promise<void> {
  const { put } = await import('@vercel/blob');
  const payload = JSON.stringify({ prices, updatedAt: new Date().toISOString(), version: 1 });
  await put(BLOB_NAME, payload, { access: 'public', contentType: 'application/json', addRandomSuffix: false, token: BLOB_TOKEN });
}

// ── Route handlers ────────────────────────────────────────
export async function GET() {
  try {
    const prices = IS_VERCEL ? await readBlob() : await readLocal();
    return NextResponse.json({
      prices,
      count: prices.length,
      source: 'shared',
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

    // Validate each price has required fields
    for (const p of prices) {
      if (!p.id || typeof p.price !== 'number') {
        return NextResponse.json(
          { error: `Invalid price entry: ${JSON.stringify(p)}` },
          { status: 400 }
        );
      }
    }

    if (IS_VERCEL) {
      await writeBlob(prices);
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
    return NextResponse.json(
      { error: 'Failed to save prices' },
      { status: 500 }
    );
  }
}
