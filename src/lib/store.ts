import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Project,
  RoofModel,
  CutList,
  PanelProfile,
  PriceEntry,
  Receipt,
  FenceBid,
} from '@/types';
import { DEFAULT_MATERIAL_PRICES, MaterialPrice } from '@/lib/fencing/fence-materials';
import { matchReceiptsToCatalog } from '@/lib/pricing/receipt-matcher';
import { fetchSharedPrices, saveSharedPrices, fetchSharedReceipts, saveSharedReceipts } from '@/lib/pricing/shared-pricing';

// Module-level cooldown timestamp — kept outside Zustand to avoid
// triggering persist serialization cycles. Persisted in localStorage
// so the cooldown survives page reloads.
const _SAVE_TS_KEY = 'hayden-last-price-save';
function getLastPriceSaveAt(): number {
  try { return parseInt(localStorage.getItem(_SAVE_TS_KEY) ?? '0', 10) || 0; } catch { return 0; }
}
function setLastPriceSaveAt(ts: number): void {
  try { localStorage.setItem(_SAVE_TS_KEY, String(ts)); } catch { /* SSR / private browsing */ }
}

interface AppState {
  // Projects
  projects: Project[];
  activeProjectId: string | null;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;

  // Roof models
  roofModels: RoofModel[];
  addRoofModel: (model: RoofModel) => void;

  // Cut lists
  cutLists: CutList[];
  addCutList: (cutList: CutList) => void;

  // Pricing
  receipts: Receipt[];
  priceDatabase: PriceEntry[];
  addReceipt: (receipt: Receipt) => void;
  addPriceEntries: (entries: PriceEntry[]) => void;

  // Fencing
  fenceBids: FenceBid[];
  addFenceBid: (bid: FenceBid) => void;
  deleteFenceBid: (id: string) => void;

  // Material Pricing (custom prices for all fencing materials)
  materialPrices: MaterialPrice[];
  updateMaterialPrice: (id: string, price: number) => void;
  resetMaterialPrices: () => void;
  syncReceiptPrices: () => Promise<{ matched: number; updated: number }>;

  // Shared pricing — persist across all users via server API
  loadSharedPrices: () => Promise<void>;
  saveSharedPricesToServer: () => Promise<boolean>;

  // Shared receipts — persist receipt history across browsers
  loadSharedReceipts: () => Promise<void>;
  saveSharedReceiptsToServer: () => Promise<boolean>;

  // UI state
  selectedPanelProfile: PanelProfile;
  selectedGauge: number;
  setSelectedPanelProfile: (profile: PanelProfile) => void;
  setSelectedGauge: (gauge: number) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Projects
      projects: [],
      activeProjectId: null,
      addProject: (project) =>
        set((state) => ({ projects: [...state.projects, project] })),
      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
          ),
        })),
      deleteProject: (id) =>
        set((state) => ({ projects: state.projects.filter(p => p.id !== id) })),
      setActiveProject: (id) => set({ activeProjectId: id }),

      // Roof models
      roofModels: [],
      addRoofModel: (model) =>
        set((state) => ({ roofModels: [...state.roofModels, model] })),

      // Cut lists
      cutLists: [],
      addCutList: (cutList) =>
        set((state) => ({ cutLists: [...state.cutLists, cutList] })),

      // Pricing
      receipts: [],
      priceDatabase: [],
      addReceipt: (receipt) => {
        set((state) => ({ receipts: [...state.receipts, receipt] }));
        // Auto-save to server so all users see the new receipt
        setTimeout(() => {
          const { receipts, priceDatabase } = get();
          saveSharedReceipts(receipts, priceDatabase).catch(console.warn);
        }, 500);
      },
      addPriceEntries: (entries) => {
        set((state) => ({
          priceDatabase: [...state.priceDatabase, ...entries],
        }));
        // Auto-save to server so all users share the updated price database
        setTimeout(() => {
          const { receipts, priceDatabase } = get();
          saveSharedReceipts(receipts, priceDatabase).catch(console.warn);
        }, 500);
      },

      // Fencing
      fenceBids: [],
      addFenceBid: (bid) =>
        set((state) => ({ fenceBids: [...state.fenceBids, bid] })),
      deleteFenceBid: (id) =>
        set((state) => ({ fenceBids: state.fenceBids.filter(b => b.id !== id) })),

      // Material Pricing
      materialPrices: [...DEFAULT_MATERIAL_PRICES],
      updateMaterialPrice: (id, price) =>
        set((state) => ({
          materialPrices: state.materialPrices.map(m =>
            m.id === id ? { ...m, price } : m
          ),
        })),
      resetMaterialPrices: () =>
        set({ materialPrices: [...DEFAULT_MATERIAL_PRICES] }),
      syncReceiptPrices: async () => {
        // Block polling for the duration of the sync + save so the 30s interval
        // cannot fetch stale server data and overwrite prices mid-flight.
        setLastPriceSaveAt(Date.now());
        const state = get();
        const { matches } = await matchReceiptsToCatalog(state.priceDatabase, state.materialPrices);
        let matched = matches.length;
        let updated = 0;
        if (matches.length > 0) {
          set((s) => {
            const newPrices = [...s.materialPrices];
            for (const match of matches) {
              const idx = newPrices.findIndex(m => m.id === match.id);
              if (idx >= 0 && newPrices[idx].price !== match.newPrice) {
                newPrices[idx] = { ...newPrices[idx], price: match.newPrice };
                updated++;
              }
            }
            return { materialPrices: newPrices };
          });
        }
        return { matched, updated };
      },

      // Shared pricing — persist to server so all users get the same prices
      loadSharedPrices: async () => {
        // Skip loading if we just saved (cooldown prevents stale server data
        // from overwriting freshly-synced receipt prices)
        if (Date.now() - getLastPriceSaveAt() < 60_000) return;

        const result = await fetchSharedPrices();
        // Only overwrite local state with actually-saved server data,
        // never with defaults (which would erase receipt-synced prices)
        if (result && result.source === 'saved') {
          set((state) => {
            const serverMap = new Map(result.prices.map(p => [p.id, p]));
            // Smart merge: prefer whichever price is non-default.
            // If the server save failed, server will have default prices while local
            // has receipt-synced prices — we must NOT let the server defaults win.
            const mergedPrices = state.materialPrices.map(local => {
              const server = serverMap.get(local.id);
              if (!server) return local;
              const localIsCustom = local.price !== local.defaultPrice;
              const serverIsCustom = server.price !== server.defaultPrice;
              if (serverIsCustom) return server; // real receipt price on server → adopt it
              if (localIsCustom) return local;   // local has receipt price, server has default → keep local
              return server;                     // both default → use server
            });
            const serverIds = new Set(result.prices.map(p => p.id));
            const localOnly = state.materialPrices.filter(p => !serverIds.has(p.id));
            return { materialPrices: [...mergedPrices, ...localOnly] };
          });
        }
      },
      saveSharedPricesToServer: async (): Promise<boolean> => {
        // Set cooldown optimistically before the async write so any polling
        // that fires while the request is in-flight is blocked.
        setLastPriceSaveAt(Date.now());
        const prices = get().materialPrices;
        const ok = await saveSharedPrices(prices);
        if (!ok) {
          // Save failed — schedule a retry in 10s so the server eventually
          // catches up without blocking the UI.
          setTimeout(() => {
            const current = get().materialPrices;
            setLastPriceSaveAt(Date.now()); // extend cooldown for the retry window
            saveSharedPrices(current).catch(console.warn);
          }, 10_000);
        }
        return ok;
      },

      // Shared receipts — persist receipt history to server
      loadSharedReceipts: async () => {
        const data = await fetchSharedReceipts();
        if (data && data.receipts.length > 0) {
          set((state) => {
            // Merge: server receipts win, keep any local-only by id
            const serverIds = new Set(data.receipts.map(r => r.id));
            const localOnly = state.receipts.filter(r => !serverIds.has(r.id));
            const mergedReceipts = [...data.receipts, ...localOnly];

            const serverPriceIds = new Set(data.priceDatabase.map(p => p.id));
            const localOnlyPrices = state.priceDatabase.filter(p => !serverPriceIds.has(p.id));
            const mergedPriceDb = [...data.priceDatabase, ...localOnlyPrices];

            return { receipts: mergedReceipts, priceDatabase: mergedPriceDb };
          });
        }
      },
      saveSharedReceiptsToServer: async (): Promise<boolean> => {
        const { receipts, priceDatabase } = get();
        return saveSharedReceipts(receipts, priceDatabase);
      },

      // UI state
      selectedPanelProfile: 'standing_seam_snap_lock_16',
      selectedGauge: 26,
      setSelectedPanelProfile: (profile) =>
        set({ selectedPanelProfile: profile }),
      setSelectedGauge: (gauge) => set({ selectedGauge: gauge }),
    }),
    {
      name: 'hayden-ranch-store',
      version: 2,
      onRehydrateStorage: () => {
        return (state, error) => {
          // After hydrating from localStorage, always fetch latest from server
          // so every browser gets up-to-date data
          if (!error && state) {
            state.loadSharedPrices();
            state.loadSharedReceipts();
          }
        };
      },
      merge: (persistedState, currentState) => {
        const persisted = (persistedState || {}) as Partial<AppState>;
        const merged = { ...currentState, ...persisted } as AppState;
        // Ensure all default material prices exist (handles schema additions)
        if (merged.materialPrices) {
          const existingIds = new Set(merged.materialPrices.map(m => m.id));
          const missing = DEFAULT_MATERIAL_PRICES.filter(d => !existingIds.has(d.id));
          if (missing.length > 0) {
            merged.materialPrices = [...merged.materialPrices, ...missing];
          }
        } else {
          merged.materialPrices = [...DEFAULT_MATERIAL_PRICES];
        }
        return merged;
      },
    }
  )
);
