import { StayTuffProduct } from '@/types';

// ────────────────────────────────────────────────────────────────────────────
// NOTE: The legacy `calculateFenceMaterials` / `calculateLaborEstimate` /
// `classifyTerrain` / `geoDistanceFeet` / `calculateWireRolls` functions that
// used to live in this file were a dead, second implementation of barbed-wire
// (and other) fence math. They were never called from the UI or PDF — the
// real, fully-featured barbed-wire / wire / pipe math lives in
// `src/app/fencing/page.tsx` (per-foot cost) and
// `src/lib/fencing/fence-bid-pdf.ts` (`calculateSectionMaterials` &
// `calculateLaborEstimate`). Keeping two copies meant two places to keep in
// sync, so this file is now scoped to the catalog + selection helpers only.
// ────────────────────────────────────────────────────────────────────────────

// ── Complete Stay-Tuff Deer-Tuff Fixed Knot catalog ──

export type WireCategory = 'deer' | 'horse' | 'goat' | 'cattle' | 'field' | 'xtreme' | 'xtreme_black';

export interface StayTuffOption {
  id: string;            // matches MaterialPrice id (e.g. 'st_2096_6_330')
  partNo: string;        // ST-880, SZA-250, etc.
  spec: string;          // "2096-6-330"
  category: WireCategory;
  height: number;        // fence height in inches
  horizontalWires: number;
  verticalSpacing: number; // inches
  rollLength: number;    // feet
  weight: number;        // lbs per roll
  description: string;
  whereUsed: string;
  madeToOrder: boolean;
}

export const STAY_TUFF_CATALOG: StayTuffOption[] = [
  // ── Deer Fence ──
  { id: 'st_2096_3_200', partNo: 'ST-882b', spec: '2096-3-200', category: 'deer', height: 96, horizontalWires: 20, verticalSpacing: 3, rollLength: 200, weight: 392, description: '96" Fixed Knot, 3" stays — Deer', whereUsed: 'Breeding & Fawn Pens, high pressure areas', madeToOrder: false },
  { id: 'st_2096_6_330', partNo: 'ST-880', spec: '2096-6-330', category: 'deer', height: 96, horizontalWires: 20, verticalSpacing: 6, rollLength: 330, weight: 408, description: '96" Fixed Knot, 6" stays — Deer', whereUsed: 'Boundary fence, medium-to-high pressure', madeToOrder: false },
  { id: 'st_2096_12_330', partNo: 'ST-881', spec: '2096-12-330', category: 'deer', height: 96, horizontalWires: 20, verticalSpacing: 12, rollLength: 330, weight: 290, description: '96" Fixed Knot, 12" stays — Deer', whereUsed: 'Boundary fence, deer exclusion, low pressure', madeToOrder: false },
  { id: 'st_2096_6_500', partNo: 'ST-884', spec: '2096-6-500', category: 'deer', height: 96, horizontalWires: 20, verticalSpacing: 6, rollLength: 500, weight: 620, description: '96" Fixed Knot, 6" stays — 500\' MTO', whereUsed: 'Boundary fence, long runs', madeToOrder: true },
  { id: 'st_2096_12_660', partNo: 'ST-883', spec: '2096-12-660', category: 'deer', height: 96, horizontalWires: 20, verticalSpacing: 12, rollLength: 660, weight: 580, description: '96" Fixed Knot, 12" stays — 660\' MTO', whereUsed: 'Boundary fence, economy long runs', madeToOrder: true },

  // ── Horse Fence ──
  { id: 'st_1661_3_200', partNo: 'ST-855B', spec: '1661-3-200', category: 'horse', height: 61, horizontalWires: 16, verticalSpacing: 3, rollLength: 200, weight: 286, description: '61" Fixed Knot, 3" stays — Horse', whereUsed: 'Stalls, holding pens, runways', madeToOrder: false },
  { id: 'st_1661_6_330', partNo: 'ST-856', spec: '1661-6-330', category: 'horse', height: 61, horizontalWires: 16, verticalSpacing: 6, rollLength: 330, weight: 303, description: '61" Fixed Knot, 6" stays — Horse', whereUsed: 'Pasture & perimeter fence, low pressure', madeToOrder: false },
  { id: 'st_1748_3_200', partNo: 'ST-782B', spec: '1748-3-200', category: 'horse', height: 48, horizontalWires: 17, verticalSpacing: 3, rollLength: 200, weight: 280, description: '48" Fixed Knot, 3" stays — Horse/Holding', whereUsed: 'Stalls, holding pens, runways', madeToOrder: true },
  { id: 'st_1661_12_330', partNo: 'ST-858', spec: '1661-12-330', category: 'horse', height: 61, horizontalWires: 16, verticalSpacing: 12, rollLength: 330, weight: 221, description: '61" Fixed Knot, 12" stays — Horse', whereUsed: 'Pasture, low pressure', madeToOrder: true },
  { id: 'st_1661_12_660', partNo: 'ST-857', spec: '1661-12-660', category: 'horse', height: 61, horizontalWires: 16, verticalSpacing: 12, rollLength: 660, weight: 441, description: '61" Fixed Knot, 12" stays — 660\' MTO', whereUsed: 'Pasture, long runs', madeToOrder: true },

  // ── Goat Fence ──
  { id: 'st_1348_3_200', partNo: 'ST-832B', spec: '1348-3-200', category: 'goat', height: 48, horizontalWires: 13, verticalSpacing: 3, rollLength: 200, weight: 228, description: '48" Fixed Knot, 3" stays — Goat', whereUsed: 'Pasture, exteriors, kid pens, holding pens', madeToOrder: false },
  { id: 'st_1348_12_330', partNo: 'ST-831', spec: '1348-12-330', category: 'goat', height: 48, horizontalWires: 13, verticalSpacing: 12, rollLength: 330, weight: 178, description: '48" Fixed Knot, 12" stays — Goat', whereUsed: 'Pastures, exterior fences', madeToOrder: false },
  { id: 'st_1348_12_660', partNo: 'ST-833', spec: '1348-12-660', category: 'goat', height: 48, horizontalWires: 13, verticalSpacing: 12, rollLength: 660, weight: 356, description: '48" Fixed Knot, 12" stays — 660\' MTO', whereUsed: 'Pastures, long runs', madeToOrder: true },

  // ── Cattle Fence ──
  { id: 'st_949_6_330', partNo: 'ST-820', spec: '949-6-330', category: 'cattle', height: 49, horizontalWires: 9, verticalSpacing: 6, rollLength: 330, weight: 189, description: '49" Fixed Knot, 6" stays — Cattle', whereUsed: 'Internal & corral fence, high pressure', madeToOrder: false },
  { id: 'st_949_12_330', partNo: 'ST-821', spec: '949-12-330', category: 'cattle', height: 49, horizontalWires: 9, verticalSpacing: 12, rollLength: 330, weight: 134, description: '49" Fixed Knot, 12" stays — Cattle', whereUsed: 'Boundary & pasture fence, low pressure', madeToOrder: false },
  { id: 'st_949_12_660', partNo: 'ST-823', spec: '949-12-660', category: 'cattle', height: 49, horizontalWires: 9, verticalSpacing: 12, rollLength: 660, weight: 267, description: '49" Fixed Knot, 12" stays — 660\' MTO', whereUsed: 'Boundary, long pasture runs', madeToOrder: true },
  { id: 'st_949_3_200', partNo: 'ST-822B', spec: '949-3-200', category: 'cattle', height: 49, horizontalWires: 9, verticalSpacing: 3, rollLength: 200, weight: 200, description: '49" Fixed Knot, 3" stays — Cattle MTO', whereUsed: 'Corrals, high pressure', madeToOrder: true },

  // ── General Field Fence ──
  { id: 'st_735_6_330', partNo: 'ST-800', spec: '735-6-330', category: 'field', height: 35, horizontalWires: 7, verticalSpacing: 6, rollLength: 330, weight: 141, description: '35" Fixed Knot, 6" stays — Field', whereUsed: 'Feral hog exclusion, low pressure', madeToOrder: false },
  { id: 'st_842_6_330', partNo: 'ST-810', spec: '842-6-330', category: 'field', height: 42, horizontalWires: 8, verticalSpacing: 6, rollLength: 330, weight: 165, description: '42" Fixed Knot, 6" stays — Field', whereUsed: 'Hog exclusion, medium-high pressure', madeToOrder: false },
  { id: 'st_842_12_330', partNo: 'ST-811', spec: '842-12-330', category: 'field', height: 42, horizontalWires: 8, verticalSpacing: 12, rollLength: 330, weight: 118, description: '42" Fixed Knot, 12" stays — Field', whereUsed: 'Pasture, interior/cross fence', madeToOrder: false },
  { id: 'st_1348_6_330', partNo: 'ST-830', spec: '1348-6-330', category: 'field', height: 48, horizontalWires: 13, verticalSpacing: 6, rollLength: 330, weight: 244, description: '48" Fixed Knot, 6" stays — Field', whereUsed: 'Predator control, pastures', madeToOrder: false },
  { id: 'st_735_3_200', partNo: 'ST-802B', spec: '735-3-200', category: 'field', height: 35, horizontalWires: 7, verticalSpacing: 3, rollLength: 200, weight: 135, description: '35" Fixed Knot, 3" stays — Field MTO', whereUsed: 'High pressure, small animal control', madeToOrder: true },
  { id: 'st_842_3_200', partNo: 'ST-812B', spec: '842-3-200', category: 'field', height: 42, horizontalWires: 8, verticalSpacing: 3, rollLength: 200, weight: 158, description: '42" Fixed Knot, 3" stays — Field MTO', whereUsed: 'Predator control, high pressure', madeToOrder: true },
  { id: 'st_842_12_660', partNo: 'ST-813', spec: '842-12-660', category: 'field', height: 42, horizontalWires: 8, verticalSpacing: 12, rollLength: 660, weight: 235, description: '42" Fixed Knot, 12" stays — 660\' MTO', whereUsed: 'Long pasture/cross fence runs', madeToOrder: true },

  // ── Fixed Knot Xtreme ──
  { id: 'sza_735_6_330', partNo: 'SZA-250', spec: '735-6-330', category: 'xtreme', height: 35, horizontalWires: 7, verticalSpacing: 6, rollLength: 330, weight: 155, description: '35" Xtreme, 6" stays', whereUsed: 'Hog exclusion, heavy duty', madeToOrder: false },
  { id: 'sza_1348_6_330', partNo: 'SZA-265', spec: '1348-6-330', category: 'xtreme', height: 48, horizontalWires: 13, verticalSpacing: 6, rollLength: 330, weight: 270, description: '48" Xtreme, 6" stays', whereUsed: 'Predator control, heavy duty', madeToOrder: false },
  { id: 'sza_1348_12_330', partNo: 'SZA-266', spec: '1348-12-330', category: 'xtreme', height: 48, horizontalWires: 13, verticalSpacing: 12, rollLength: 330, weight: 195, description: '48" Xtreme, 12" stays', whereUsed: 'Boundary, economy', madeToOrder: false },
  { id: 'sza_1348_12_660', partNo: 'SZA-267', spec: '1348-12-660', category: 'xtreme', height: 48, horizontalWires: 13, verticalSpacing: 12, rollLength: 660, weight: 390, description: '48" Xtreme, 12" stays — 660\'', whereUsed: 'Long runs, economy', madeToOrder: false },
  { id: 'sza_949_6_330', partNo: 'SZA-262', spec: '949-6-330', category: 'xtreme', height: 49, horizontalWires: 9, verticalSpacing: 6, rollLength: 330, weight: 210, description: '49" Xtreme, 6" stays', whereUsed: 'Cattle, heavy duty', madeToOrder: false },
  { id: 'sza_949_12_330', partNo: 'SZA-260', spec: '949-12-330', category: 'xtreme', height: 49, horizontalWires: 9, verticalSpacing: 12, rollLength: 330, weight: 150, description: '49" Xtreme, 12" stays', whereUsed: 'Cattle, economy', madeToOrder: false },
  { id: 'sza_949_12_660', partNo: 'SZA-261', spec: '949-12-660', category: 'xtreme', height: 49, horizontalWires: 9, verticalSpacing: 12, rollLength: 660, weight: 300, description: '49" Xtreme, 12" stays — 660\'', whereUsed: 'Cattle, long runs', madeToOrder: false },
  { id: 'sza_2096_6_330', partNo: 'SZA-270', spec: '2096-6-330', category: 'xtreme', height: 96, horizontalWires: 20, verticalSpacing: 6, rollLength: 330, weight: 450, description: '96" Xtreme, 6" stays', whereUsed: 'Deer, heavy duty boundary', madeToOrder: false },

  // ── Fixed Knot Xtreme Black ──
  { id: 'szab_1348_6_330', partNo: 'SZAB-830', spec: '1348-6-330', category: 'xtreme_black', height: 48, horizontalWires: 13, verticalSpacing: 6, rollLength: 330, weight: 270, description: '48" Xtreme Black, 6" stays', whereUsed: 'Premium aesthetic, predator control', madeToOrder: false },
  { id: 'szab_1775_6_330', partNo: 'SZAB-860', spec: '1775-6-330', category: 'xtreme_black', height: 75, horizontalWires: 17, verticalSpacing: 6, rollLength: 330, weight: 350, description: '75" Xtreme Black, 6" stays', whereUsed: 'Premium horse/deer boundary', madeToOrder: false },
  { id: 'szab_2096_6_330', partNo: 'SZAB-880', spec: '2096-6-330', category: 'xtreme_black', height: 96, horizontalWires: 20, verticalSpacing: 6, rollLength: 330, weight: 460, description: '96" Xtreme Black, 6" stays', whereUsed: 'Premium deer boundary', madeToOrder: false },
];

// Category display labels
export const WIRE_CATEGORY_LABELS: Record<WireCategory, string> = {
  deer: 'Deer Fence',
  horse: 'Horse Fence',
  goat: 'Goat Fence',
  cattle: 'Cattle Fence',
  field: 'General Field Fence',
  xtreme: 'Fixed Knot Xtreme',
  xtreme_black: 'Fixed Knot Xtreme Black',
};

// ── Unified fence-selection catalog ──
// One dropdown driving fenceType + (optional) Stay-Tuff product + wireCategory.
export type FenceSelectionId = string;

export interface FenceSelection {
  id: FenceSelectionId;          // dropdown value
  groupLabel: string;            // <optgroup> label
  label: string;                 // option label shown to user
  fenceType:
    | 'stay_tuff_fixed_knot'
    | 'stay_tuff_hinge_joint'
    | 'field_fence'
    | 'barbed_wire'
    | 'no_climb'
    | 'pipe_fence'
    | 't_post_wire';
  stayTuffId?: string;           // present only for Stay-Tuff selections
  wireCategory?: WireCategory;   // present only for Stay-Tuff selections
}

const STAY_TUFF_GROUP_LABEL: Record<WireCategory, string> = {
  cattle: 'Stay-Tuff Cattle Fence',
  deer: 'Stay-Tuff Deer Fence',
  horse: 'Stay-Tuff Horse Fence',
  goat: 'Stay-Tuff Goat Fence',
  field: 'Stay-Tuff General Field Fence',
  xtreme: 'Stay-Tuff Fixed Knot Xtreme',
  xtreme_black: 'Stay-Tuff Fixed Knot Xtreme Black',
};

/**
 * Build the unified ordered list of every selectable fence option.
 * Stay-Tuff options first (grouped by category), then other wire fences,
 * then specialty (Pipe, Barbed Wire only).
 */
export const FENCE_SELECTIONS: FenceSelection[] = [
  // Stay-Tuff (Fixed Knot) — grouped per WireCategory in display order
  ...(['cattle', 'deer', 'horse', 'goat', 'field', 'xtreme', 'xtreme_black'] as WireCategory[]).flatMap(
    (cat) =>
      STAY_TUFF_CATALOG.filter((p) => p.category === cat).map<FenceSelection>((p) => ({
        id: `staytuff:${p.id}`,
        groupLabel: STAY_TUFF_GROUP_LABEL[cat],
        label: `${p.partNo} — ${p.spec} (${p.description})${p.madeToOrder ? ' [MTO]' : ''}`,
        fenceType: 'stay_tuff_fixed_knot',
        stayTuffId: p.id,
        wireCategory: cat,
      })),
  ),
  // Other wire fences
  { id: 'field_fence', groupLabel: 'Other Wire Fences', label: 'Field Fence', fenceType: 'field_fence' },
  { id: 'no_climb', groupLabel: 'Other Wire Fences', label: 'No-Climb Horse Fence', fenceType: 'no_climb' },
  { id: 't_post_wire', groupLabel: 'Other Wire Fences', label: 'T-Post & Wire', fenceType: 't_post_wire' },
  // Specialty
  { id: 'pipe_fence', groupLabel: 'Specialty', label: 'Pipe Fence', fenceType: 'pipe_fence' },
  { id: 'barbed_wire', groupLabel: 'Specialty', label: 'Barbed Wire Only', fenceType: 'barbed_wire' },
];

/** Find a selection by its dropdown id. */
export function getFenceSelection(id: FenceSelectionId): FenceSelection | undefined {
  return FENCE_SELECTIONS.find((s) => s.id === id);
}

/**
 * Reverse lookup: given a fence type and (optional) stay-tuff id, find the matching
 * selection id. Used to back-fill selection state from saved drafts.
 */
export function selectionIdFor(fenceType: string, stayTuffId?: string): FenceSelectionId {
  if (fenceType.startsWith('stay_tuff') && stayTuffId) {
    const found = FENCE_SELECTIONS.find((s) => s.stayTuffId === stayTuffId);
    if (found) return found.id;
  }
  const found = FENCE_SELECTIONS.find((s) => s.fenceType === fenceType && !s.stayTuffId);
  return found?.id ?? FENCE_SELECTIONS[0].id;
}

/** Legacy adapter: convert StayTuffOption to old StayTuffProduct interface */
export function toStayTuffProduct(opt: StayTuffOption): StayTuffProduct {
  return {
    model: opt.spec,
    height: opt.height,
    horizontalWires: opt.horizontalWires,
    verticalSpacing: opt.verticalSpacing,
    description: opt.description,
  };
}

