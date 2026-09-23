import { create } from "zustand";
import type { AppState, Unit, InstallTariffs, EquipmentCategory, ProfitThreshold, PaymentTranche, PaymentExpenseItem } from "./econ-types";
import { defaultAppState, emptyUnit, blankAppState, normalizeAppState } from "./econ-defaults";
import { suggestPaymentExpenses } from "./econ-calc";

interface StoreShape {
  state: AppState;
  loaded: boolean;
  saving: boolean;
  currentUserId: string | null;
  // არქივიდან გახსნილი ჩანაწერის ID — "დასრულება და შენახვა" ამ ჩანაწერს
  // გადააწერს (თარიღი უცვლელი). null = ახალი პროექტი (ახალ ჩანაწერად შეინახება).
  loadedArchiveId: string | null;
  setLoadedArchiveId: (id: string | null) => void;
  setState: (updater: (s: AppState) => AppState) => void;
  updateProject: (patch: Partial<AppState["project"]>) => void;
  updateFinance: (patch: Partial<AppState["finance"]>) => void;
  updateDefaultRates: (patch: Partial<AppState["defaultRates"]>) => void;
  setBrandMarkup: (brand: string, pct: number) => void;
  updatePayment: (patch: Partial<AppState["payment"]>) => void;
  setManualCell: (col: "finalOffer" | "factual", lineKey: string, value: number | null) => void;
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
  load: (userId: string) => Promise<void>;
  save: () => Promise<void>;
  reset: () => void;
}


// ბრაუზერში ლოკალურად შენახული "დაუმთავრებელი ნამუშევარი" — მომხმარებლის
// ID-ზეა მიბმული, რომ refresh-ისას არაფერი არ იკარგებოდეს, მაგრამ სხვა
// მომხმარებელმა (განსხვავებული კოდით) არასდროს ნახოს ვინმეს დაუმთავრებელი
// მუშაობა. ინახება ცალკე Supabase-ის საერთო "ცოცხალი" მდგომარეობისგან.
function draftKey(userId: string) {
  return `elteg-draft-${userId}`;
}
function loadDraft(userId: string): AppState | null {
  try {
    const raw = window.localStorage.getItem(draftKey(userId));
    return raw ? normalizeAppState(JSON.parse(raw)) : null;
  } catch (e) {
    console.error("[econ-store] draft load failed", e);
    return null;
  }
}
function saveDraft(userId: string | null, state: AppState) {
  if (!userId) return;
  try {
    window.localStorage.setItem(draftKey(userId), JSON.stringify(state));
  } catch (e) {
    console.error("[econ-store] draft save failed", e);
  }
}
function clearDraft(userId: string | null) {
  if (!userId) return;
  window.localStorage.removeItem(draftKey(userId));
}

// გახსნილი არქივის ID-ს ცალკე ვინახავთ localStorage-ში, რომ refresh-ის შემდეგაც
// ვიცოდეთ, პროექტი არქივიდანაა გახსნილი (ხელახლა შენახვისას იმავე ჩანაწერს
// გადავაწერთ, ახალს არ შევქმნით).
function archiveIdKey(userId: string) {
  return `elteg-archiveid-${userId}`;
}
function saveArchiveId(userId: string | null, id: string | null) {
  if (!userId) return;
  try {
    if (id) window.localStorage.setItem(archiveIdKey(userId), id);
    else window.localStorage.removeItem(archiveIdKey(userId));
  } catch (e) { console.error("[econ-store] archiveId save failed", e); }
}
function loadArchiveId(userId: string): string | null {
  try { return window.localStorage.getItem(archiveIdKey(userId)); } catch { return null; }
}

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
  currentUserId: null,
  loadedArchiveId: null,
  setLoadedArchiveId: (id) => { saveArchiveId(get().currentUserId, id); set({ loadedArchiveId: id }); },

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
  updateDefaultRates: (patch) => {
    set((s) => ({ state: { ...s.state, defaultRates: { ...s.state.defaultRates, ...patch } } }));
    scheduleSave(get);
  },
  setBrandMarkup: (brand, pct) => {
    set((s) => {
      const brandMarkups = { ...(s.state.defaultRates.brandMarkups ?? {}), [brand]: pct };
      // ამავე ბრენდის არსებულ დანადგარებზეც განვაახლოთ ფასნამატი %.
      const units = s.state.project.units.map((u) => (u.brand === brand ? { ...u, equipmentMarkupPct: pct } : u));
      return { state: { ...s.state, defaultRates: { ...s.state.defaultRates, brandMarkups }, project: { ...s.state.project, units } } };
    });
    scheduleSave(get);
  },
  setManualCell: (col, lineKey, value) => {
    set((s) => {
      const current = { ...(s.state.manualColumns?.[col] ?? {}) };
      // null/NaN ან ცარიელი — ხაზი იშლება (გამოთვლილი თანხა დარჩება placeholder-ად)
      if (value === null || Number.isNaN(value as number)) {
        delete current[lineKey];
      } else {
        current[lineKey] = value as number;
      }
      return {
        state: {
          ...s.state,
          manualColumns: { ...s.state.manualColumns, [col]: current },
        },
      };
    });
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
    set((s) => {
      const dr = s.state.defaultRates;
      // ბრენდის შეცვლისას — ავტომ. ჩაისვას იმ ბრენდის ფასნამატი %
      // (თუ ბრენდზე ცალკე % არ არის, რჩება ზოგადი equipmentMarkupPct).
      let effPatch = patch;
      if (patch.brand !== undefined && dr?.brandMarkups) {
        const bm = dr.brandMarkups[patch.brand];
        if (bm !== undefined) effPatch = { ...patch, equipmentMarkupPct: bm };
      }
      return {
        state: {
          ...s.state,
          project: {
            ...s.state.project,
            units: s.state.project.units.map((u) => (u.id === id ? { ...u, ...effPatch } : u)),
          },
        },
      };
    });
    scheduleSave(get);
  },
  addUnit: () => {
    set((s) => {
      const units = s.state.project.units;
      const last = units[units.length - 1];
      // ფასნამატები (დანადგ./მონტ.) და სავალუტო რისკი — ყოველთვის "ტარიფები"
      // ტაბიდან (defaultRates), ყველა ახალ დანადგარზე, არა წინადან.
      const dr = s.state.defaultRates ?? { equipmentMarkupPct: 0.03, installMarkupPct: 0.50, contingencyPct: 0.03, overheadPct: 0, fxRiskPct: 0.02 };
      let nu: Unit;
      if (last) {
        // ახალი დანადგარი = წინას ასლი (id-ის გარდა) — ტექნიკური/ხარჯების
        // ველები მემკვიდრეობით, მაგრამ ფასნამატები ტარიფებიდან თავიდან ისმება.
        const m = last.id.match(/^([A-Za-z]+)(\d+)$/);
        const prefix = m ? m[1] : "L";
        const num = m ? parseInt(m[2], 10) + 1 : units.length + 1;
        nu = { ...last, id: `${prefix}${num}`,
          equipmentMarkupPct: dr.equipmentMarkupPct,
          installMarkupPct: dr.installMarkupPct,
          contingencyPct: dr.contingencyPct ?? last.contingencyPct,
          overheadPct: dr.overheadPct ?? 0,
          fxRiskPct: dr.fxRiskPct,
        };
      } else {
        // პირველი დანადგარი — "ტარიფები" ტაბზე დაყენებული სტანდარტული
        // განაკვეთებით იწყება (ფასნამატი დანადგ./მონტ., სავალუტო რისკი).
        // სანიმუშო თანხები ($18,180 ქარხნული ფასი და ა.შ.) აღარ გადმოდის —
        // ფინანსური ველები ნულიდან იწყება, მონტაჟი ტარიფიდან ისმება (ProjectDataSheet).
        nu = { ...emptyUnit("L1"),
          brand: "", model: "",
          floors: 0, factoryPrice: 0, materials: 0, grounding: 0, otherCost: 0, scaffolding: 0,
          equipmentMarkupPct: dr.equipmentMarkupPct,
          installMarkupPct: dr.installMarkupPct,
          contingencyPct: dr.contingencyPct ?? 0.03,
          overheadPct: dr.overheadPct ?? 0,
          fxRiskPct: dr.fxRiskPct,
        };
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
    const userId = get().currentUserId;
    clearDraft(userId);
    saveArchiveId(userId, null);
    set((s) => ({ state: { ...blankAppState(), pageVisibility: s.state.pageVisibility }, loadedArchiveId: null }));
    scheduleSave(get);
  },

  load: async (userId: string) => {
    set({ currentUserId: userId });
    // Refresh-ისას (იმავე ბრაუზერში, იმავე მომხმარებლის მიერ) აღდგება ლოკალურად
    // შენახული დაუმთავრებელი ნამუშევარი — არაფერი არ იკარგება. სხვა კოდით
    // შესვლისას (ან პირველად ამ ბრაუზერში) დრაფტი არ არსებობს და ცარიელი
    // ფორმა იხსნება — საერთო Supabase-ის "ცოცხალი" მდგომარეობა არასდროს იტვირთება,
    // რომ სხვის დაუმთავრებელ ნამუშევარს არასდროს ხედავდე.
    const draft = loadDraft(userId);
    set({ state: draft ? migrateSavedState(draft) : blankAppState(), loaded: true, loadedArchiveId: draft ? loadArchiveId(userId) : null });
  },

  // საერთო app_state ჩანაწერში აღარ ვწერთ: მას ყველა მომხმარებელი ერთმანეთს
  // უწერდა და არავინ კითხულობდა. დაუმთავრებელი ნამუშევარი ბრაუზერის დრაფტშია,
  // საბოლოო — არქივში („დასრულება და შენახვა").
  save: async () => {
    saveDraft(get().currentUserId, get().state);
  },
}));

function migrateSavedState(s: AppState): AppState {
  // ძველ state-ში კვების ერთი გლობალური განაკვეთი (mealPerDay) per-group ველებში გადავიტანოთ,
  // რომ input-ებიც და გამოთვლაც თანხმდებოდეს. Idempotent.
  const f = s?.finance as any;
  if (f && f.mealMechanics === undefined && typeof f.mealPerDay === "number") {
    f.mealMechanics = f.mealPerDay;
    f.mealElectricians = f.mealPerDay;
    f.mealAdmin = f.mealPerDay;
  }
  return s;
}

function scheduleSave(get: () => StoreShape) {
  // ლოკალური დრაფტი მყისიერად (და უფასოდ) ინახება — refresh-ისას არაფერი არ
  // დაიკარგება, თუნდაც Supabase-ის შენახვა ჯერ არ დასრულებულიყოს.
  const s = get();
  saveDraft(s.currentUserId, s.state);

}
