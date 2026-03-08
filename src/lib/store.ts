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
import { matchReceiptToMaterial } from '@/lib/pricing/receipt-matcher';

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
  syncReceiptPrices: () => { matched: number; updated: number };

  // UI state
  selectedPanelProfile: PanelProfile;
  selectedGauge: number;
  setSelectedPanelProfile: (profile: PanelProfile) => void;
  setSelectedGauge: (gauge: number) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
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
      syncReceiptPrices: () => {
        let matched = 0;
        let updated = 0;
        set((state) => {
          const newPrices = [...state.materialPrices];
          for (const entry of state.priceDatabase) {
            const match = matchReceiptToMaterial(entry, newPrices);
            if (match) {
              matched++;
              const idx = newPrices.findIndex(m => m.id === match.id);
              if (idx >= 0 && newPrices[idx].price !== match.newPrice) {
                newPrices[idx] = { ...newPrices[idx], price: match.newPrice };
                updated++;
              }
            }
          }
          return { materialPrices: newPrices };
        });
        return { matched, updated };
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
