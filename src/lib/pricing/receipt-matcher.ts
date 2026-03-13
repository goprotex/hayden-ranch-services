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
  // Drill stem by OD (specific first)
  { keywords: ['drill', 'stem', '2-7/8'], id: 'drill_stem_278_31' },
  { keywords: ['drill', 'stem', '278'], id: 'drill_stem_278_31' },
  { keywords: ['drill', 'stem', '2-3/8'], id: 'drill_stem_238_31' },
  { keywords: ['drill', 'stem', '238'], id: 'drill_stem_238_31' },
  { keywords: ['drill', 'stem'], id: 'drill_stem_238_31' },  // default to 2-3/8
  { keywords: ['drill stem'], id: 'drill_stem_238_31' },

  // Round pipe
  { keywords: ['round', 'pipe', '2.5'], id: 'round_pipe_250_21' },
  { keywords: ['round', 'pipe'], id: 'round_pipe_250_21' },

  // Square tube by size + gauge (specific first)
  { keywords: ['4', 'square', '11ga'], id: 'square_4_24_11ga' },
  { keywords: ['4', 'square', '11'], id: 'square_4_24_11ga' },
  { keywords: ['4', 'square', '14ga'], id: 'square_4_24_14ga' },
  { keywords: ['4', 'square', '14'], id: 'square_4_24_14ga' },
  { keywords: ['4', 'square', 'tube'], id: 'square_4_24_14ga' },
  { keywords: ['3', 'square', '11ga'], id: 'square_3_24_11ga' },
  { keywords: ['3', 'square', '11'], id: 'square_3_24_11ga' },
  { keywords: ['3', 'square', '14ga'], id: 'square_3_24_14ga' },
  { keywords: ['3', 'square', '14'], id: 'square_3_24_14ga' },
  { keywords: ['3', 'square', 'tube'], id: 'square_3_24_14ga' },
  { keywords: ['square', 'tube', '11ga'], id: 'square_2_20_11ga' },
  { keywords: ['square', 'tube', '11'], id: 'square_2_20_11ga' },
  { keywords: ['sq', 'tube', '11'], id: 'square_2_20_11ga' },
  { keywords: ['square', 'tube', '12ga'], id: 'square_2_20_14ga' },  // no 12ga — map to 14ga
  { keywords: ['square', 'tube', '14ga'], id: 'square_2_20_14ga' },
  { keywords: ['square', 'tube', '14'], id: 'square_2_20_14ga' },
  { keywords: ['sq', 'tube', '14'], id: 'square_2_20_14ga' },
  { keywords: ['square', 'tube', '16ga'], id: 'square_2_20_16ga' },
  { keywords: ['square', 'tube', '16'], id: 'square_2_20_16ga' },
  { keywords: ['sq', 'tube', '16'], id: 'square_2_20_16ga' },
  { keywords: ['square', 'tube'], id: 'square_2_20_14ga' },  // default

  // T-Posts by size
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
  { keywords: ['t-post'], id: 't_post_7' },  // default
  { keywords: ['t post'], id: 't_post_7' },

  // Stay-Tuff wire — map by model number
  { keywords: ['2096', '3', '200'], id: 'st_2096_3_200' },
  { keywords: ['2096', '6', '330'], id: 'st_2096_6_330' },
  { keywords: ['2096', '12', '330'], id: 'st_2096_12_330' },
  { keywords: ['2096', '6', '500'], id: 'st_2096_6_500' },
  { keywords: ['2096', '12', '660'], id: 'st_2096_12_660' },
  { keywords: ['1661', '3', '200'], id: 'st_1661_3_200' },
  { keywords: ['1661', '6', '330'], id: 'st_1661_6_330' },
  { keywords: ['1661', '12', '330'], id: 'st_1661_12_330' },
  { keywords: ['1661', '12', '660'], id: 'st_1661_12_660' },
  { keywords: ['1348', '3', '200'], id: 'st_1348_3_200' },
  { keywords: ['1348', '6', '330'], id: 'st_1348_6_330' },
  { keywords: ['1348', '12', '330'], id: 'st_1348_12_330' },
  { keywords: ['1348', '12', '660'], id: 'st_1348_12_660' },
  { keywords: ['949', '3', '200'], id: 'st_949_3_200' },
  { keywords: ['949', '6', '330'], id: 'st_949_6_330' },
  { keywords: ['949', '12', '330'], id: 'st_949_12_330' },
  { keywords: ['949', '12', '660'], id: 'st_949_12_660' },
  { keywords: ['735', '6', '330'], id: 'st_735_6_330' },
  { keywords: ['842', '6', '330'], id: 'st_842_6_330' },
  { keywords: ['842', '12', '330'], id: 'st_842_12_330' },
  // Broader Stay-Tuff catches (height-based fallbacks)
  { keywords: ['stay', 'tuff', '96'], id: 'st_2096_6_330' },
  { keywords: ['stay-tuff', '96'], id: 'st_2096_6_330' },
  { keywords: ['staytuff', '96'], id: 'st_2096_6_330' },
  { keywords: ['stay', 'tuff', '72'], id: 'st_1661_6_330' },
  { keywords: ['stay-tuff', '72'], id: 'st_1661_6_330' },
  { keywords: ['stay', 'tuff', '60'], id: 'st_1661_6_330' },
  { keywords: ['stay', 'tuff', '49'], id: 'st_949_6_330' },
  { keywords: ['stay-tuff', '49'], id: 'st_949_6_330' },
  { keywords: ['stay', 'tuff', '48'], id: 'st_1348_6_330' },
  { keywords: ['stay-tuff', '48'], id: 'st_1348_6_330' },
  { keywords: ['stay', 'tuff'], id: 'st_949_6_330' },

  // Xtreme wire
  { keywords: ['xtreme', 'black', '1348'], id: 'szab_1348_6_330' },
  { keywords: ['xtreme', 'black', '1775'], id: 'szab_1775_6_330' },
  { keywords: ['xtreme', 'black', '2096'], id: 'szab_2096_6_330' },
  { keywords: ['xtreme', '1348'], id: 'sza_1348_6_330' },
  { keywords: ['xtreme', '949'], id: 'sza_949_6_330' },
  { keywords: ['xtreme', '2096'], id: 'sza_2096_6_330' },
  { keywords: ['xtreme', '735'], id: 'sza_735_6_330' },

  // Wire types
  { keywords: ['field', 'fence'], id: 'field_fence_roll' },
  { keywords: ['barbed', 'wire', '4'], id: 'barbed_wire_4pt' },
  { keywords: ['barb', 'wire', '4'], id: 'barbed_wire_4pt' },
  { keywords: ['barbed', 'wire'], id: 'barbed_wire_2pt' },
  { keywords: ['barb', 'wire'], id: 'barbed_wire_2pt' },
  { keywords: ['no', 'climb'], id: 'no_climb_roll' },
  { keywords: ['no-climb'], id: 'no_climb_roll' },
  { keywords: ['horse', 'fence'], id: 'no_climb_roll' },
  { keywords: ['high', 'tensile', 'smooth'], id: 'ht_smooth' },
  { keywords: ['ht', 'smooth'], id: 'ht_smooth' },
  { keywords: ['smooth', 'wire'], id: 'ht_smooth' },

  // Hardware
  { keywords: ['clip'], id: 'clips' },
  { keywords: ['staple'], id: 'clips' },
  { keywords: ['wire', 'tie'], id: 'wire_tie' },
  { keywords: ['concrete', 'mix'], id: 'concrete_bag' },
  { keywords: ['concrete', 'bag'], id: 'concrete_bag' },
  { keywords: ['concrete', '80'], id: 'concrete_bag' },
  { keywords: ['quikrete'], id: 'concrete_bag' },
  { keywords: ['sakrete'], id: 'concrete_bag' },
  { keywords: ['tensioner'], id: 'tensioner' },
  { keywords: ['inline', 'tension'], id: 'tensioner' },
  { keywords: ['spring', 'tension', 'indicator'], id: 'spring_tension_indicator' },
  { keywords: ['post', 'cap'], id: 'post_cap' },
  { keywords: ['crimp', 'sleeve'], id: 'crimp_sleeve' },
  { keywords: ['brace', 'pin'], id: 'brace_pin' },
  { keywords: ['brace', 'wire'], id: 'brace_wire_9ga' },
  { keywords: ['corner', 'insulator'], id: 'corner_insulator' },
  { keywords: ['end', 'insulator'], id: 'corner_insulator' },
  { keywords: ['line', 'insulator'], id: 'line_insulator' },
  { keywords: ['water', 'gap'], id: 'water_gap_cable' },
  { keywords: ['kicker', 'brace'], id: 'kicker_brace' },

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
  const descWords = desc.split(/[\s\/\-,()]+/).filter(w => w.length > 1);

  for (const mp of materialPrices) {
    const nameWords = mp.name.toLowerCase().split(/[\s\/\-,()"+]+/).filter(w => w.length > 1);
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

  if (bestMatch && bestScore >= 0.35 && entry.unitPrice > 0) {
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
