// ============================================================
// Shared Pricing — Client-side API helpers
// Fetch & save material prices to the server so all users
// share the same receipt-updated pricing.
// ============================================================

import { MaterialPrice } from '@/lib/fencing/fence-materials';

const API_URL = '/api/material-prices';

/**
 * Fetch the shared material prices from the server.
 * Returns the prices array, or null if the fetch fails.
 */
export async function fetchSharedPrices(): Promise<MaterialPrice[] | null> {
  try {
    const res = await fetch(API_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data.prices) && data.prices.length > 0) {
      return data.prices as MaterialPrice[];
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
