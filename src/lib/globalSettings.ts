import { supabase } from "@/integrations/supabase/client";
import { adminWrite } from "./adminWrite";
import type { AppState } from "./econ-types";

// გლობალური პარამეტრები — „ტარიფები" ტაბზე ფინანსების მიერ დაყენებული
// მნიშვნელობები, რომლებიც ყველა მომხმარებელს (ყველა ბრაუზერს) ერთნაირად
// უნდა მიუვიდეს. ინახება app_settings ცხრილში (id = "global").
//
// • GLOBAL_FINANCE_KEYS — ყოველთვის ფინანსების მიერ: მიმდინარე (დაუმთავრებელ)
//   პროექტზეც ავტომატურად ისმება. არქივიდან გახსნილი პროექტი ინარჩუნებს თავისას.
// • DEFAULT_FINANCE_KEYS — მხოლოდ ახალი პროექტის საწყისი მნიშვნელობა;
//   შემდეგ პროექტში გაყიდვებსაც შეუძლიათ შეცვლა (გარანტიის მოცულობა, დღეები).
// • defaultRates / profitThresholds — ყოველთვის გლობალური (ახალ დანადგარზე ისმება).

export const GLOBAL_FINANCE_KEYS = [
  "equipmentVatRate", "otherVatRate", "incomeTaxRate", "pensionRate", "guaranteeAnnualPct",
] as const;
export const DEFAULT_FINANCE_KEYS = ["guaranteePct", "guaranteeDays"] as const;

type Finance = AppState["finance"];
export type GlobalFinanceKey = (typeof GLOBAL_FINANCE_KEYS)[number];
export type DefaultFinanceKey = (typeof DEFAULT_FINANCE_KEYS)[number];

export interface GlobalSettings {
  defaultRates?: AppState["defaultRates"];
  profitThresholds?: AppState["profitThresholds"];
  finance?: Partial<Pick<Finance, GlobalFinanceKey | DefaultFinanceKey>>;
}

const ROW_ID = "global";

export async function loadGlobalSettings(): Promise<GlobalSettings | null> {
  const { data, error } = await (supabase as any)
    .from("app_settings")
    .select("data")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) throw error;
  return (data?.data as GlobalSettings) ?? null;
}

export async function saveGlobalSettings(g: GlobalSettings): Promise<void> {
  await adminWrite("app_settings", "upsert", { id: ROW_ID, data: g, updated_at: new Date().toISOString() }, null, "id");
}

function pickNums<K extends string>(src: any, keys: readonly K[]): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const k of keys) {
    const v = src?.[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

// მიმდინარე state-იდან გლობალური პარამეტრების ამოღება (პირველადი შევსებისთვის).
export function extractGlobal(s: AppState): GlobalSettings {
  return {
    defaultRates: s.defaultRates,
    profitThresholds: s.profitThresholds,
    finance: { ...pickNums(s.finance, GLOBAL_FINANCE_KEYS), ...pickNums(s.finance, DEFAULT_FINANCE_KEYS) },
  };
}

// mode: "new" — ახალი პროექტი (ყველაფერი + default-ები);
//       "draft" — დაუმთავრებელი პროექტი (გლობალური, default-ების გარეშე);
//       "archive" — არქივიდან გახსნილი (მხოლოდ ფასნამატები/ზღვრები; გადასახადები და
//                   საკომისიო % პროექტისაა და უცვლელი რჩება).
export function applyGlobal(s: AppState, g: GlobalSettings | null, mode: "new" | "draft" | "archive"): AppState {
  if (!g) return s;
  const next: AppState = { ...s };
  if (g.defaultRates) next.defaultRates = { ...s.defaultRates, ...g.defaultRates };
  if (g.profitThresholds) {
    const pt: any = { ...s.profitThresholds };
    for (const [cat, th] of Object.entries(g.profitThresholds)) pt[cat] = { ...(pt[cat] ?? {}), ...(th as any) };
    next.profitThresholds = pt;
  }
  if (mode !== "archive" && g.finance) {
    const patch = {
      ...pickNums(g.finance, GLOBAL_FINANCE_KEYS),
      ...(mode === "new" ? pickNums(g.finance, DEFAULT_FINANCE_KEYS) : {}),
    };
    next.finance = { ...s.finance, ...patch };
  }
  return next;
}
