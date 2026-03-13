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
      addReceipt: (receipt) =>
        set((state) => ({ receipts: [...state.receipts, receipt] })),
      addPriceEntries: (entries) =>
        set((state) => ({
          priceDatabase: [...state.priceDatabase, ...entries],
        })),

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
        const shared = await fetchSharedPrices();
        if (shared && shared.length > 0) {
          set((state) => {
            // Server prices win — merge with any new defaults not on server
            const serverIds = new Set(shared.map(p => p.id));
            const localOnly = state.materialPrices.filter(p => !serverIds.has(p.id));
            return { materialPrices: [...shared, ...localOnly] };
          });
        }
      },
      saveSharedPricesToServer: async (): Promise<boolean> => {
        const prices = get().materialPrices;
        return saveSharedPrices(prices);
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
