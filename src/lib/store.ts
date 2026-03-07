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

      // UI state
      selectedPanelProfile: 'standing_seam_snap_lock_16',
      selectedGauge: 26,
      setSelectedPanelProfile: (profile) =>
        set({ selectedPanelProfile: profile }),
      setSelectedGauge: (gauge) => set({ selectedGauge: gauge }),
    }),
    {
      name: 'hayden-ranch-store',
    }
  )
);
