// ============================================================
// Shared Pricing — Client-side API helpers
// Fetch & save material prices to the server so all users
// share the same receipt-updated pricing.
// ============================================================

import { MaterialPrice } from '@/lib/fencing/fence-materials';
import { Receipt, PriceEntry } from '@/types';

const API_URL = '/api/material-prices';
const RECEIPTS_API_URL = '/api/shared-receipts';

/**
 * Fetch the shared material prices from the server.
 * Returns the prices array, or null if the fetch fails.
 */
export async function fetchSharedPrices(): Promise<{ prices: MaterialPrice[]; source: string } | null> {
  try {
    const res = await fetch(API_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data.prices) && data.prices.length > 0) {
      return { prices: data.prices as MaterialPrice[], source: data.source || 'unknown' };
    }
    return null;
  } catch {
    console.warn('[SharedPricing] Failed to fetch shared prices — using local store');
    return null;
  }
}

/**
 * Save the current material prices to the server.
 * Returns true on success, false on failure.
 */
export async function saveSharedPrices(prices: MaterialPrice[]): Promise<boolean> {
  try {
    console.log('[SharedPricing] Saving', prices.length, 'prices to server...');
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prices }),
    });
    if (!res.ok) {
      console.warn('[SharedPricing] Failed to save shared prices:', res.status, await res.text());
      return false;
    }
    console.log('[SharedPricing] Prices saved successfully');
    return true;
  } catch (err) {
    console.warn('[SharedPricing] Failed to save shared prices — network error', err);
    return false;
  }
}

// ── Receipt & PriceDatabase sync ──────────────────────────

export async function fetchSharedReceipts(): Promise<{ receipts: Receipt[]; priceDatabase: PriceEntry[] } | null> {
  try {
    const res = await fetch(RECEIPTS_API_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data.receipts)) {
      return {
        receipts: data.receipts as Receipt[],
        priceDatabase: (data.priceDatabase ?? []) as PriceEntry[],
      };
    }
    return null;
  } catch {
    console.warn('[SharedPricing] Failed to fetch shared receipts');
    return null;
  }
}

export async function saveSharedReceipts(receipts: Receipt[], priceDatabase: PriceEntry[]): Promise<boolean> {
  try {
    console.log('[SharedPricing] Saving', receipts.length, 'receipts +', priceDatabase.length, 'price entries to server...');
    const res = await fetch(RECEIPTS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receipts, priceDatabase }),
    });
    if (!res.ok) {
      console.warn('[SharedPricing] Failed to save shared receipts:', res.status);
      return false;
    }
    console.log('[SharedPricing] Receipts saved successfully');
    return true;
  } catch (err) {
    console.warn('[SharedPricing] Failed to save shared receipts — network error', err);
    return false;
  }
}
