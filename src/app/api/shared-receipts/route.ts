// ============================================================
// Shared Receipts & Price Database API
// GET  → returns receipts + priceDatabase
// POST → saves receipts + priceDatabase
//
// Uses @vercel/kv in production (no CDN caching, always fresh).
// Falls back to local filesystem in development.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

const RECEIPTS_KEY = 'hayden:shared-receipts';
const IS_KV = !!process.env.KV_REST_API_URL;

interface SharedReceiptsPayload {
  receipts: unknown[];
  priceDatabase: unknown[];
  updatedAt: string;
}

// ── Local filesystem fallback (dev only) ──────────────────
async function readLocal(): Promise<SharedReceiptsPayload | null> {
  const fs = await import('fs');
  const path = await import('path');
  const filePath = path.join(process.cwd(), 'data', 'shared-receipts.json');
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw) as SharedReceiptsPayload;
      if (Array.isArray(data.receipts)) return data;
    }
  } catch { /* corrupted or missing */ }
  return null;
}

async function writeLocal(payload: SharedReceiptsPayload): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');
  const dir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'shared-receipts.json'),
    JSON.stringify(payload, null, 2),
    'utf-8'
  );
}

// ── Vercel KV storage (production) ────────────────────────
async function readKV(): Promise<SharedReceiptsPayload | null> {
  const { kv } = await import('@vercel/kv');
  try {
    const data = await kv.get<SharedReceiptsPayload>(RECEIPTS_KEY);
    if (data && Array.isArray(data.receipts)) return data;
  } catch (err) {
    console.error('[SharedReceipts] KV read error:', err);
  }
  return null;
}

async function writeKV(payload: SharedReceiptsPayload): Promise<void> {
  const { kv } = await import('@vercel/kv');
  await kv.set(RECEIPTS_KEY, payload);
}

// ── Route handlers ────────────────────────────────────────
export async function GET() {
  try {
    const data = IS_KV ? await readKV() : await readLocal();
    if (data) {
      return NextResponse.json({
        receipts: data.receipts,
        priceDatabase: data.priceDatabase,
        updatedAt: data.updatedAt,
      });
    }
    return NextResponse.json({ receipts: [], priceDatabase: [] });
  } catch (err) {
    console.error('Failed to read shared receipts:', err);
    return NextResponse.json({ receipts: [], priceDatabase: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { receipts, priceDatabase } = body;

    if (!Array.isArray(receipts) || !Array.isArray(priceDatabase)) {
      return NextResponse.json(
        { error: 'Invalid payload: receipts and priceDatabase arrays required' },
        { status: 400 }
      );
    }

    const payload: SharedReceiptsPayload = {
      receipts,
      priceDatabase,
      updatedAt: new Date().toISOString(),
    };

    if (IS_KV) {
      await writeKV(payload);
    } else {
      await writeLocal(payload);
    }

    return NextResponse.json({
      success: true,
      receiptCount: receipts.length,
      priceCount: priceDatabase.length,
      updatedAt: payload.updatedAt,
    });
  } catch (err) {
    console.error('Failed to save shared receipts:', err);
    return NextResponse.json({ error: 'Failed to save receipts' }, { status: 500 });
  }
}
