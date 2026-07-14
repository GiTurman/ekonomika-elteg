import { create } from "zustand";
import type { AppState, Unit } from "./econ-types";
import { defaultAppState, emptyUnit, blankAppState } from "./econ-defaults";
import { supabase } from "@/integrations/supabase/client";

interface StoreShape {
  state: AppState;
  loaded: boolean;
  saving: boolean;
  setState: (updater: (s: AppState) => AppState) => void;
  updateProject: (patch: Partial<AppState["project"]>) => void;
  updateFinance: (patch: Partial<AppState["finance"]>) => void;
  updatePayment: (patch: Partial<AppState["payment"]>) => void;
  updateUnit: (id: string, patch: Partial<Unit>) => void;
  addUnit: () => void;
  removeUnit: (id: string) => void;
  load: () => Promise<void>;
  save: () => Promise<void>;
  reset: () => void;
}

const STATE_ID = "singleton";
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useEconStore = create<StoreShape>((set, get) => ({
  state: defaultAppState,
  loaded: false,
  saving: false,

  setState: (updater) => {
    set((s) => ({ state: updater(s.state) }));
    scheduleSave(get);
  },

  updateProject: (patch) => {
    set((s) => ({ state: { ...s.state, project: { ...s.state.project, ...patch } } }));
    scheduleSave(get);
  },
  updateFinance: (patch) => {
    set((s) => ({ state: { ...s.state, finance: { ...s.state.finance, ...patch } } }));
    scheduleSave(get);
  },
  updatePayment: (patch) => {
    set((s) => ({ state: { ...s.state, payment: { ...s.state.payment, ...patch } } }));
    scheduleSave(get);
  },
  updateUnit: (id, patch) => {
    set((s) => ({
      state: {
        ...s.state,
        project: {
          ...s.state.project,
          units: s.state.project.units.map((u) => (u.id === id ? { ...u, ...patch } : u)),
        },
      },
    }));
    scheduleSave(get);
  },
  addUnit: () => {
    set((s) => {
      const units = s.state.project.units;
      const last = units[units.length - 1];
      let nu: Unit;
      if (last) {
        // ახალი დანადგარი = წინას სრული ასლი (id-ის გარდა) — მომხმარებელი
        // ხელით შეცვლის მხოლოდ იმ ველებს, რაც განსხვავებულია.
        const m = last.id.match(/^([A-Za-z]+)(\d+)$/);
        const prefix = m ? m[1] : "L";
        const num = m ? parseInt(m[2], 10) + 1 : units.length + 1;
        nu = { ...last, id: `${prefix}${num}` };
      } else {
        nu = emptyUnit("L1");
      }
      return { state: { ...s.state, project: { ...s.state.project, units: [...units, nu] } } };
    });
    scheduleSave(get);
  },
  removeUnit: (id) => {
    set((s) => ({
      state: {
        ...s.state,
        project: {
          ...s.state.project,
          units: s.state.project.units.filter((u) => u.id !== id),
        },
      },
    }));
    scheduleSave(get);
  },

  reset: () => {
    set({ state: blankAppState() });
    scheduleSave(get);
  },

  load: async () => {
    try {
      const { data, error } = await supabase
        .from("app_state")
        .select("data")
        .eq("id", STATE_ID)
        .maybeSingle();
      if (error) throw error;
      if (data?.data) {
        // Shallow-merge with defaults so new fields default correctly
        const loaded = data.data as Partial<AppState>;
        set({
          state: {
            project: { ...defaultAppState.project, ...(loaded.project ?? {}) },
            finance: { ...defaultAppState.finance, ...(loaded.finance ?? {}) },
            payment: { ...defaultAppState.payment, ...(loaded.payment ?? {}) },
          },
          loaded: true,
        });
      } else {
        set({ loaded: true });
      }
    } catch (e) {
      console.error("[econ-store] load failed", e);
      set({ loaded: true });
    }
  },

  save: async () => {
    const s = get().state;
    set({ saving: true });
    try {
      await supabase.from("app_state").upsert({ id: STATE_ID, data: s as any });
    } catch (e) {
      console.error("[econ-store] save failed", e);
    } finally {
      set({ saving: false });
    }
  },
}));

function scheduleSave(get: () => StoreShape) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => get().save(), 600);
}
