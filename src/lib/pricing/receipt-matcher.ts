// ============================================================
// Receipt → Material Price Matcher
// Uses Claude to match receipt line items to fencing material
// price IDs from the catalog.
// ============================================================

import { PriceEntry } from '@/types';
import { MaterialPrice } from '@/lib/fencing/fence-materials';

export interface ReceiptMatch {
  id: string;          // materialPrice id
  newPrice: number;    // extracted unit price
  confidence: number;  // 0-1
  entryId: string;     // priceDatabase entry id
}

/**
 * Send receipt items to Claude for matching against the material catalog.
 * Returns per-entry matches with confidence scores.
 */
export async function matchReceiptsToCatalog(
  entries: PriceEntry[],
  materialPrices: MaterialPrice[],
): Promise<{ matches: ReceiptMatch[]; unmatched: PriceEntry[] }> {
  if (entries.length === 0) return { matches: [], unmatched: [] };

  const items = entries
    .filter(e => e.unitPrice > 0)
    .map(e => ({ id: e.id, description: e.description, unitPrice: e.unitPrice }));

  const catalog = materialPrices.map(m => ({
    id: m.id, name: m.name, unit: m.unit, category: m.category,
  }));

  try {
    const res = await fetch('/api/match-materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, catalog }),
    });

    if (!res.ok) throw new Error(`API ${res.status}`);

    const data = await res.json();
    const apiMatches: { entryId: string; materialId: string; unitPrice: number; confidence: number }[] = data.matches || [];

    const matchedEntryIds = new Set<string>();
    const bestByMaterialId = new Map<string, ReceiptMatch>();

    for (const m of apiMatches) {
      matchedEntryIds.add(m.entryId);
      const match: ReceiptMatch = {
        id: m.materialId,
        newPrice: m.unitPrice,
        confidence: m.confidence,
        entryId: m.entryId,
      };
      // Keep latest match per material (last in array = most recent upload)
      bestByMaterialId.set(m.materialId, match);
    }

    const unmatched = entries.filter(e => !matchedEntryIds.has(e.id));
    return { matches: Array.from(bestByMaterialId.values()), unmatched };
  } catch (err) {
    console.error('Claude material matching failed, returning empty:', err);
    return { matches: [], unmatched: entries };
  }
}

/**
 * Match ALL receipt entries against material prices via Claude.
 */
export async function matchAllReceipts(
  priceDatabase: PriceEntry[],
  materialPrices: MaterialPrice[],
): Promise<{ matches: ReceiptMatch[]; unmatched: PriceEntry[] }> {
  return matchReceiptsToCatalog(priceDatabase, materialPrices);
}
