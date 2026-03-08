// ============================================================
// Receipt → Material Price Matcher
// Fuzzy-matches receipt line items to fencing material price IDs
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
 * Keyword → material price ID mapping.
 * Each rule: array of required keywords (ALL must match) → target ID.
 * The FIRST matching rule wins, so more-specific rules go first.
 */
const MATCH_RULES: { keywords: string[]; id: string; unitConvert?: (entry: PriceEntry) => number }[] = [
  // Drill stem
  { keywords: ['drill', 'stem'], id: 'drill_stem_31' },
  { keywords: ['drill stem'], id: 'drill_stem_31' },

  // Square tube by gauge (specific first)
  { keywords: ['square', 'tube', '11'], id: 'square_tube_20_11ga' },
  { keywords: ['square', 'tube', '11ga'], id: 'square_tube_20_11ga' },
  { keywords: ['sq', 'tube', '11'], id: 'square_tube_20_11ga' },
  { keywords: ['square', 'tube', '12'], id: 'square_tube_20_12ga' },
  { keywords: ['square', 'tube', '12ga'], id: 'square_tube_20_12ga' },
  { keywords: ['sq', 'tube', '12'], id: 'square_tube_20_12ga' },
  { keywords: ['square', 'tube', '14'], id: 'square_tube_20_14ga' },
  { keywords: ['square', 'tube', '14ga'], id: 'square_tube_20_14ga' },
  { keywords: ['sq', 'tube', '14'], id: 'square_tube_20_14ga' },
  { keywords: ['square', 'tube'], id: 'square_tube_20_14ga' }, // default gauge

  // T-Posts by size (specific first)
  { keywords: ['t-post', '10'], id: 't_post_10' },
  { keywords: ['t post', '10'], id: 't_post_10' },
  { keywords: ['tpost', '10'], id: 't_post_10' },
  { keywords: ['t-post', '8'], id: 't_post_8' },
  { keywords: ['t post', '8'], id: 't_post_8' },
  { keywords: ['tpost', '8'], id: 't_post_8' },
  { keywords: ['t-post', '7'], id: 't_post_7' },
  { keywords: ['t post', '7'], id: 't_post_7' },
  { keywords: ['tpost', '7'], id: 't_post_7' },
  { keywords: ['t-post', '6'], id: 't_post_6' },
  { keywords: ['t post', '6'], id: 't_post_6' },
  { keywords: ['tpost', '6'], id: 't_post_6' },

  // Stay-Tuff wire by height
  { keywords: ['stay', 'tuff', '96'], id: 'stay_tuff_96' },
  { keywords: ['stay-tuff', '96'], id: 'stay_tuff_96' },
  { keywords: ['staytuff', '96'], id: 'stay_tuff_96' },
  { keywords: ['stay', 'tuff', '72'], id: 'stay_tuff_72' },
  { keywords: ['stay-tuff', '72'], id: 'stay_tuff_72' },
  { keywords: ['staytuff', '72'], id: 'stay_tuff_72' },
  { keywords: ['stay', 'tuff', '60'], id: 'stay_tuff_60' },
  { keywords: ['stay-tuff', '60'], id: 'stay_tuff_60' },
  { keywords: ['staytuff', '60'], id: 'stay_tuff_60' },
  { keywords: ['stay', 'tuff', '49'], id: 'stay_tuff_49' },
  { keywords: ['stay-tuff', '49'], id: 'stay_tuff_49' },
  { keywords: ['staytuff', '49'], id: 'stay_tuff_49' },

  // Wire types
  { keywords: ['field', 'fence'], id: 'field_fence_roll' },
  { keywords: ['barbed', 'wire'], id: 'barbed_wire' },
  { keywords: ['barb', 'wire'], id: 'barbed_wire' },
  { keywords: ['no', 'climb'], id: 'no_climb_roll' },
  { keywords: ['no-climb'], id: 'no_climb_roll' },
  { keywords: ['horse', 'fence'], id: 'no_climb_roll' },
  { keywords: ['high', 'tensile', 'smooth'], id: 'ht_smooth' },
  { keywords: ['ht', 'smooth'], id: 'ht_smooth' },
  { keywords: ['smooth', 'wire'], id: 'ht_smooth' },

  // Hardware
  { keywords: ['clip'], id: 'clips' },
  { keywords: ['staple'], id: 'clips' },
  { keywords: ['concrete', 'mix'], id: 'concrete_bag' },
  { keywords: ['concrete', 'bag'], id: 'concrete_bag' },
  { keywords: ['concrete', '80'], id: 'concrete_bag' },
  { keywords: ['quikrete'], id: 'concrete_bag' },
  { keywords: ['sakrete'], id: 'concrete_bag' },
  { keywords: ['tensioner'], id: 'tensioner' },
  { keywords: ['inline', 'tension'], id: 'tensioner' },

  // Paint
  { keywords: ['paint', 'post'], id: 'paint_posts' },
  { keywords: ['post', 'paint'], id: 'paint_posts' },
  { keywords: ['paint', 'gate'], id: 'paint_gates' },
  { keywords: ['gate', 'paint'], id: 'paint_gates' },
  { keywords: ['primer', 'gate'], id: 'paint_gates' },
  { keywords: ['paint', 'labor'], id: 'paint_labor' },
];

/**
 * Try to match a receipt PriceEntry to a material price ID.
 * Returns the match or null if no confident match found.
 */
export function matchReceiptToMaterial(
  entry: PriceEntry,
  materialPrices: MaterialPrice[],
): ReceiptMatch | null {
  const desc = entry.description.toLowerCase();

  // Try rule-based matching first (high confidence)
  for (const rule of MATCH_RULES) {
    const allMatch = rule.keywords.every(kw => desc.includes(kw));
    if (allMatch) {
      // Verify the ID exists in the price list
      const exists = materialPrices.some(m => m.id === rule.id);
      if (!exists) continue;

      const price = rule.unitConvert ? rule.unitConvert(entry) : entry.unitPrice;
      if (price <= 0) continue;

      return {
        id: rule.id,
        newPrice: Math.round(price * 100) / 100,
        confidence: 0.9,
        entryId: entry.id,
      };
    }
  }

  // Fallback: fuzzy match description against material price names
  let bestScore = 0;
  let bestMatch: MaterialPrice | null = null;
  const descWords = desc.split(/[\s\/\-,()]+/).filter(w => w.length > 2);

  for (const mp of materialPrices) {
    const nameWords = mp.name.toLowerCase().split(/[\s\/\-,()"+]+/).filter(w => w.length > 2);
    let matchCount = 0;
    for (const dw of descWords) {
      if (nameWords.some(nw => nw.includes(dw) || dw.includes(nw))) {
        matchCount++;
      }
    }
    const score = descWords.length > 0 ? matchCount / Math.max(descWords.length, nameWords.length) : 0;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = mp;
    }
  }

  if (bestMatch && bestScore >= 0.4 && entry.unitPrice > 0) {
    return {
      id: bestMatch.id,
      newPrice: Math.round(entry.unitPrice * 100) / 100,
      confidence: Math.min(bestScore, 0.8),
      entryId: entry.id,
    };
  }

  return null;
}

/**
 * Match ALL receipt entries against material prices and return a summary.
 */
export function matchAllReceipts(
  priceDatabase: PriceEntry[],
  materialPrices: MaterialPrice[],
): { matches: ReceiptMatch[]; unmatched: PriceEntry[] } {
  const matches: ReceiptMatch[] = [];
  const unmatched: PriceEntry[] = [];
  // Track best match per material ID (newest receipt = most recent price)
  const bestByMaterialId = new Map<string, ReceiptMatch>();

  for (const entry of priceDatabase) {
    const match = matchReceiptToMaterial(entry, materialPrices);
    if (match) {
      matches.push(match);
      // Keep the most recent (last in array = most recent upload)
      bestByMaterialId.set(match.id, match);
    } else {
      unmatched.push(entry);
    }
  }

  return { matches: Array.from(bestByMaterialId.values()), unmatched };
}
