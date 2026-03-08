// ============================================================
// Shared Material Prices API
// GET  → returns the current shared prices (or defaults)
// POST → saves updated prices for all users
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { DEFAULT_MATERIAL_PRICES, MaterialPrice } from '@/lib/fencing/fence-materials';

/**
 * Resolve the path to the shared prices JSON file.
 * - Local dev: `data/shared-prices.json` in the project root (persistent)
 * - Vercel/serverless: `/tmp/shared-prices.json` (per-instance, but allows writes)
 */
function getStoragePath(): string {
  const projectPath = path.join(process.cwd(), 'data', 'shared-prices.json');
  try {
    // Ensure `data/` directory exists
    const dir = path.dirname(projectPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Test writability by touching the directory
    fs.accessSync(dir, fs.constants.W_OK);
    return projectPath;
  } catch {
    // Filesystem is read-only (Vercel) — use /tmp
    return path.join('/tmp', 'shared-prices.json');
  }
}

function readSharedPrices(): MaterialPrice[] {
  const storagePath = getStoragePath();
  try {
    if (fs.existsSync(storagePath)) {
      const raw = fs.readFileSync(storagePath, 'utf-8');
      const data = JSON.parse(raw) as { prices: MaterialPrice[]; updatedAt: string };
      if (Array.isArray(data.prices) && data.prices.length > 0) {
        // Merge with defaults to pick up any new materials added since last save
        const savedIds = new Set(data.prices.map(p => p.id));
        const missing = DEFAULT_MATERIAL_PRICES.filter(d => !savedIds.has(d.id));
        return [...data.prices, ...missing];
      }
    }
  } catch {
    // File doesn't exist or is corrupted — return defaults
  }
  return [...DEFAULT_MATERIAL_PRICES];
}

function writeSharedPrices(prices: MaterialPrice[]): void {
  const storagePath = getStoragePath();
  const dir = path.dirname(storagePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const payload = {
    prices,
    updatedAt: new Date().toISOString(),
    version: 1,
  };
  fs.writeFileSync(storagePath, JSON.stringify(payload, null, 2), 'utf-8');
}

export async function GET() {
  try {
    const prices = readSharedPrices();
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

    writeSharedPrices(prices);

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
