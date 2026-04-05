// ============================================================
// Shared Receipts & Price Database API
// GET  → returns receipts + priceDatabase
// POST → saves receipts + priceDatabase
//
// Uses Supabase in production (reliable, no CDN caching).
// Falls back to local filesystem in development.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { IS_SUPABASE, getSupabase } from '@/lib/supabase/client';

const SETTINGS_KEY = 'shared-receipts';

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
  fs.writeFileSync(path.join(dir, 'shared-receipts.json'), JSON.stringify(payload, null, 2), 'utf-8');
}

// ── Supabase storage (production) ─────────────────────────
async function readSupabase(): Promise<SharedReceiptsPayload | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .single();

  if (error || !data) return null;
  const payload = data.value as SharedReceiptsPayload;
  if (!Array.isArray(payload?.receipts)) return null;
  return payload;
}

async function writeSupabase(payload: SharedReceiptsPayload): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from('app_settings')
    .upsert({ key: SETTINGS_KEY, value: payload });
  if (error) throw error;
}

// ── Route handlers ────────────────────────────────────────
export async function GET() {
  try {
    const data = IS_SUPABASE ? await readSupabase() : await readLocal();
    if (data) {
      return NextResponse.json({
        receipts: data.receipts,
        priceDatabase: data.priceDatabase,
        updatedAt: data.updatedAt,
      });
    }
    return NextResponse.json({ receipts: [], priceDatabase: [] });
  } catch (err) {
    console.error('[shared-receipts] GET failed:', err);
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

    if (IS_SUPABASE) {
      await writeSupabase(payload);
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
    console.error('[shared-receipts] POST failed:', err);
    return NextResponse.json({ error: 'Failed to save receipts' }, { status: 500 });
  }
}
