import { create } from "zustand";
import type { AppState, Unit, InstallTariffs, EquipmentCategory, ProfitThreshold, PaymentTranche, PaymentExpenseItem } from "./econ-types";
import { defaultAppState, emptyUnit, blankAppState } from "./econ-defaults";
import { suggestPaymentExpenses } from "./econ-calc";
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
  setTariffRow: (section: keyof InstallTariffs, index: number, usdNet: number) => void;
  setProfitThreshold: (category: EquipmentCategory, patch: Partial<ProfitThreshold>) => void;
  setPageVisibility: (patch: Partial<AppState["pageVisibility"]>) => void;
  addTranche: (which: "A" | "B") => void;
  removeTranche: (which: "A" | "B", index: number) => void;
  updateTranche: (which: "A" | "B", index: number, patch: Partial<PaymentTranche>) => void;
  addExpense: (which: "A" | "B", afterTranche: number) => void;
  removeExpense: (which: "A" | "B", index: number) => void;
  updateExpense: (which: "A" | "B", index: number, patch: Partial<PaymentExpenseItem>) => void;
  applySuggestedExpenses: (which: "A" | "B") => void;
  load: () => Promise<void>;
  save: () => Promise<void>;
  reset: () => void;
}

const STATE_ID = "singleton";
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// ახალი ტრანშის ავტომატური ლეიბლისთვის (I, II, III, IV, V, ...) — არსებული
// ტრანშების ("I ტრანში", "II ტრანში"...) სტილის შესანარჩუნებლად.
function toGeorgianOrdinal(n: number): string {
  const romans: [number, string][] = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let num = n, out = "";
  for (const [val, sym] of romans) {
    while (num >= val) { out += sym; num -= val; }
  }
  return out || String(n);
}

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

  addTranche: (which) => {
    set((s) => {
      const key = which === "A" ? "scenarioA" : "scenarioB";
      const sc = s.state.payment[key];
      const n = sc.tranches.length + 1;
      const tranches = [...sc.tranches, { label: `${toGeorgianOrdinal(n)} ტრანში`, pct: 0 }];
      return { state: { ...s.state, payment: { ...s.state.payment, [key]: { ...sc, tranches } } } };
    });
    scheduleSave(get);
  },
  removeTranche: (which, index) => {
    set((s) => {
      const key = which === "A" ? "scenarioA" : "scenarioB";
      const sc = s.state.payment[key];
      const tranches = sc.tranches.filter((_, i) => i !== index);
      // ამ ტრანშზე მიბმული ხარჯებიც ვშლით, დანარჩენების ინდექსებს ვინაცვლებთ
      const expenses = sc.expenses
        .filter((e) => e.afterTranche !== index)
        .map((e) => (e.afterTranche > index ? { ...e, afterTranche: e.afterTranche - 1 } : e));
      return { state: { ...s.state, payment: { ...s.state.payment, [key]: { ...sc, tranches, expenses } } } };
    });
    scheduleSave(get);
  },
  updateTranche: (which, index, patch) => {
    set((s) => {
      const key = which === "A" ? "scenarioA" : "scenarioB";
      const sc = s.state.payment[key];
      const tranches = sc.tranches.map((t, i) => (i === index ? { ...t, ...patch } : t));
      return { state: { ...s.state, payment: { ...s.state.payment, [key]: { ...sc, tranches } } } };
    });
    scheduleSave(get);
  },

  addExpense: (which, afterTranche) => {
    set((s) => {
      const key = which === "A" ? "scenarioA" : "scenarioB";
      const sc = s.state.payment[key];
      const expenses = [...sc.expenses, { label: "ახალი გასავალი", amount: 0, afterTranche }];
      return { state: { ...s.state, payment: { ...s.state.payment, [key]: { ...sc, expenses } } } };
    });
    scheduleSave(get);
  },
  removeExpense: (which, index) => {
    set((s) => {
      const key = which === "A" ? "scenarioA" : "scenarioB";
      const sc = s.state.payment[key];
      const expenses = sc.expenses.filter((_, i) => i !== index);
      return { state: { ...s.state, payment: { ...s.state.payment, [key]: { ...sc, expenses } } } };
    });
    scheduleSave(get);
  },
  updateExpense: (which, index, patch) => {
    set((s) => {
      const key = which === "A" ? "scenarioA" : "scenarioB";
      const sc = s.state.payment[key];
      const expenses = sc.expenses.map((e, i) => (i === index ? { ...e, ...patch } : e));
      return { state: { ...s.state, payment: { ...s.state.payment, [key]: { ...sc, expenses } } } };
    });
    scheduleSave(get);
  },
  applySuggestedExpenses: (which) => {
    set((s) => {
      const key = which === "A" ? "scenarioA" : "scenarioB";
      const sc = s.state.payment[key];
      const expenses = suggestPaymentExpenses(s.state, which);
      return { state: { ...s.state, payment: { ...s.state.payment, [key]: { ...sc, expenses } } } };
    });
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

  setTariffRow: (section, index, usdNet) => {
    set((s) => {
      const rows = s.state.tariffs[section].map((r, i) => (i === index ? { ...r, usdNet } : r));
      return { state: { ...s.state, tariffs: { ...s.state.tariffs, [section]: rows } } };
    });
    scheduleSave(get);
  },
  setProfitThreshold: (category, patch) => {
    set((s) => ({
      state: {
        ...s.state,
        profitThresholds: {
          ...s.state.profitThresholds,
          [category]: { ...s.state.profitThresholds[category], ...patch },
        },
      },
    }));
    scheduleSave(get);
  },
  setPageVisibility: (patch) => {
    set((s) => ({ state: { ...s.state, pageVisibility: { ...s.state.pageVisibility, ...patch } } }));
    scheduleSave(get);
  },

  reset: () => {
    set((s) => ({ state: { ...blankAppState(), pageVisibility: s.state.pageVisibility } }));
    scheduleSave(get);
  },

  load: async () => {
    // ყოველ შესვლაზე სრულიად ცარიელი, შეუვსებელი ფორმა იხსნება — არაფერი
    // (მათ შორის გვერდების ხედვადობის პარამეტრიც) აღარ ნარჩუნდება წინა
    // შესვლიდან. საერთო "ცოცხალი" მდგომარეობა Supabase-დან საერთოდ აღარ იტვირთება.
    set({ state: blankAppState(), loaded: true });
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
