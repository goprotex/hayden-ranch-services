// ============================================================
// Shared Receipts & Price Database API
// GET  → returns receipts + priceDatabase from blob
// POST → saves receipts + priceDatabase to blob
//
// Uses same storage strategy as material-prices:
// @vercel/blob in production, local filesystem in dev.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

const BLOB_NAME = 'shared-receipts.json';
const BLOB_TOKEN = process.env.Price_update_READ_WRITE_TOKEN || '';
const IS_VERCEL = !!BLOB_TOKEN;

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

// ── Vercel Blob storage (production) ──────────────────────
async function readBlob(): Promise<SharedReceiptsPayload | null> {
  const { list, head } = await import('@vercel/blob');
  try {
    const { blobs } = await list({ prefix: BLOB_NAME, limit: 1, token: BLOB_TOKEN });
    if (blobs.length === 0) return null;
    const blobMeta = await head(blobs[0].url, { token: BLOB_TOKEN });
    const res = await fetch(blobMeta.url);
    if (!res.ok) return null;
    const data = (await res.json()) as SharedReceiptsPayload;
    if (Array.isArray(data.receipts)) return data;
  } catch (err) {
    console.error('[SharedReceipts] Blob read error:', err);
  }
  return null;
}

async function writeBlob(payload: SharedReceiptsPayload): Promise<void> {
  const { put } = await import('@vercel/blob');
  const json = JSON.stringify(payload);
  await put(BLOB_NAME, json, {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    token: BLOB_TOKEN,
  });
}

// ── Route handlers ────────────────────────────────────────
export async function GET() {
  try {
    const data = IS_VERCEL ? await readBlob() : await readLocal();
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

    if (IS_VERCEL) {
      await writeBlob(payload);
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
