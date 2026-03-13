// ============================================================
// Shared Receipts & Price Database API
// GET  → returns receipts + priceDatabase from blob
// POST → saves receipts + priceDatabase for all users
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

const BLOB_NAME = 'shared-receipts.json';
const BLOB_TOKEN = process.env.Price_update_READ_WRITE_TOKEN || '';
const IS_VERCEL = !!BLOB_TOKEN;

// ── Local filesystem fallback (dev only) ──────────────────
async function readLocal() {
  const fs = await import('fs');
  const path = await import('path');
  const filePath = path.join(process.cwd(), 'data', 'shared-receipts.json');
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      return { receipts: data.receipts || [], priceDatabase: data.priceDatabase || [] };
    }
  } catch { /* corrupted or missing */ }
  return { receipts: [], priceDatabase: [] };
}

async function writeLocal(receipts: unknown[], priceDatabase: unknown[]): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');
  const dir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const payload = { receipts, priceDatabase, updatedAt: new Date().toISOString(), version: 1 };
  fs.writeFileSync(path.join(dir, 'shared-receipts.json'), JSON.stringify(payload, null, 2), 'utf-8');
}

// ── Vercel Blob storage (production) ──────────────────────
async function readBlob() {
  const { list, head } = await import('@vercel/blob');
  try {
    const { blobs } = await list({ prefix: BLOB_NAME, limit: 1, token: BLOB_TOKEN });
    if (blobs.length === 0) return { receipts: [], priceDatabase: [] };
    const blobMeta = await head(blobs[0].url, { token: BLOB_TOKEN });
    const res = await fetch(blobMeta.url);
    if (!res.ok) return { receipts: [], priceDatabase: [] };
    const data = await res.json();
    return { receipts: data.receipts || [], priceDatabase: data.priceDatabase || [] };
  } catch (err) {
    console.error('[SharedReceipts] Blob read error:', err);
  }
  return { receipts: [], priceDatabase: [] };
}

async function writeBlob(receipts: unknown[], priceDatabase: unknown[]): Promise<void> {
  const { put } = await import('@vercel/blob');
  const payload = JSON.stringify({ receipts, priceDatabase, updatedAt: new Date().toISOString(), version: 1 });
  await put(BLOB_NAME, payload, { access: 'public', contentType: 'application/json', addRandomSuffix: false, token: BLOB_TOKEN });
}

// ── Route handlers ────────────────────────────────────────
export async function GET() {
  try {
    const data = IS_VERCEL ? await readBlob() : await readLocal();
    return NextResponse.json({
      receipts: data.receipts,
      priceDatabase: data.priceDatabase,
      source: 'shared',
    });
  } catch (err) {
    console.error('Failed to read shared receipts:', err);
    return NextResponse.json({
      receipts: [],
      priceDatabase: [],
      source: 'empty',
    });
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

    if (IS_VERCEL) {
      await writeBlob(receipts, priceDatabase);
    } else {
      await writeLocal(receipts, priceDatabase);
    }

    return NextResponse.json({
      success: true,
      receiptCount: receipts.length,
      priceCount: priceDatabase.length,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to save shared receipts:', err);
    return NextResponse.json(
      { error: 'Failed to save receipts' },
      { status: 500 }
    );
  }
}
