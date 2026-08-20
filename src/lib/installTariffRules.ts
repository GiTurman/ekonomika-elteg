import { supabase } from "@/integrations/supabase/client";
import type { EquipmentCategory } from "./econ-types";

export interface TariffRule {
  id: string;
  label: string;
  category: EquipmentCategory;
  mechRate: number;
  elecRate: number;
  mechRateSales: number;
  elecRateSales: number;
  capMin: number | null;
  capMax: number | null;
  floorMin: number | null;
  floorMax: number | null;
  sortOrder: number;
  note: string | null;
}

function rowToRule(r: any): TariffRule {
  return {
    id: r.id,
    label: r.label,
    category: r.category as EquipmentCategory,
    mechRate: Number(r.mech_rate),
    elecRate: Number(r.elec_rate),
    mechRateSales: r.mech_rate_sales == null ? 0 : Number(r.mech_rate_sales),
    elecRateSales: r.elec_rate_sales == null ? 0 : Number(r.elec_rate_sales),
    capMin: r.cap_min === null ? null : Number(r.cap_min),
    capMax: r.cap_max === null ? null : Number(r.cap_max),
    floorMin: r.floor_min === null ? null : Number(r.floor_min),
    floorMax: r.floor_max === null ? null : Number(r.floor_max),
    sortOrder: r.sort_order,
    note: r.note,
  };
}

export async function listTariffRules(): Promise<TariffRule[]> {
  const { data, error } = await supabase.from("install_tariff_rules").select("*").order("sort_order");
  if (error) throw error;
  return (data ?? []).map(rowToRule);
}

export async function updateTariffRule(id: string, patch: Partial<Pick<TariffRule, "label" | "mechRate" | "elecRate" | "mechRateSales" | "elecRateSales" | "capMin" | "capMax" | "floorMin" | "floorMax">>): Promise<void> {
  const row: any = {};
  if (patch.label !== undefined) row.label = patch.label;
  if (patch.mechRate !== undefined) row.mech_rate = patch.mechRate;
  if (patch.elecRate !== undefined) row.elec_rate = patch.elecRate;
  if (patch.mechRateSales !== undefined) row.mech_rate_sales = patch.mechRateSales;
  if (patch.elecRateSales !== undefined) row.elec_rate_sales = patch.elecRateSales;
  if (patch.capMin !== undefined) row.cap_min = patch.capMin;
  if (patch.capMax !== undefined) row.cap_max = patch.capMax;
  if (patch.floorMin !== undefined) row.floor_min = patch.floorMin;
  if (patch.floorMax !== undefined) row.floor_max = patch.floorMax;
  const { error } = await supabase.from("install_tariff_rules").update(row).eq("id", id);
  if (error) throw error;
}

export async function createTariffRule(rule: Omit<TariffRule, "sortOrder"> & { sortOrder?: number }): Promise<void> {
  const { error } = await supabase.from("install_tariff_rules").insert({
    id: rule.id, label: rule.label, category: rule.category,
    mech_rate: rule.mechRate, elec_rate: rule.elecRate,
    mech_rate_sales: rule.mechRateSales ?? 0, elec_rate_sales: rule.elecRateSales ?? 0,
    cap_min: rule.capMin, cap_max: rule.capMax, floor_min: rule.floorMin, floor_max: rule.floorMax,
    sort_order: rule.sortOrder ?? 99, note: rule.note ?? null,
  });
  if (error) throw error;
}

export async function deleteTariffRule(id: string): Promise<void> {
  const { error } = await supabase.from("install_tariff_rules").delete().eq("id", id);
  if (error) throw error;
}

// ლიფტისთვის ტვირთამწეობა+სართულების მიხედვით ავტომატურად პოულობს
// შესაბამის სტანდარტულ ტარიფს (მომხმარებელს არჩევა არ სჭირდება).
export function findMatchingLiftRule(rules: TariffRule[], capacity: number, floors: number): TariffRule | null {
  return rules.find((r) =>
    r.category === "lift" &&
    (r.capMin == null || capacity >= r.capMin) &&
    (r.capMax == null || capacity <= r.capMax) &&
    (r.floorMin == null || floors >= r.floorMin) &&
    (r.floorMax == null || floors <= r.floorMax)
  ) ?? null;
}
