import { supabase } from "@/integrations/supabase/client";
import { adminWrite } from "./adminWrite";
// sales_plans ცხრილი ჯერ არ არის გენერირებულ ტიპებში — cast, რომ TS არ დაბლოკოს.
const db = supabase as any;

// გეგმის ჭრილი: საერთო (მარჟა), კლემანი (ქარხნული ფასი), ჰიტაჩი (ქარხნული ფასი)
export type PlanScope = "overall" | "kleemann" | "hitachi";

export const PLAN_SCOPE_LABEL: Record<PlanScope, string> = {
  overall: "საერთო (მარჟა)",
  kleemann: "კლემანი (ქარხნული ფასი)",
  hitachi: "ჰიტაჩი (ქარხნული ფასი)",
};

export interface SalesPlan {
  id: string;
  year: number;
  quarter: number;        // 1-4
  salesPersonId: string;  // app_users.id (sales)
  scope: PlanScope;
  planUsd: number;
}

function rowToPlan(r: any): SalesPlan {
  return {
    id: r.id, year: r.year, quarter: r.quarter,
    salesPersonId: r.sales_person_id, scope: r.scope, planUsd: Number(r.plan_usd) || 0,
  };
}

export async function listSalesPlans(): Promise<SalesPlan[]> {
  const { data, error } = await db.from("sales_plans").select("*").order("year", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToPlan);
}

// upsert — ერთი უჯრა (წელი+კვარტალი+გამყიდველი+ჭრილი უნიკალურია).
export async function setSalesPlan(
  year: number, quarter: number, salesPersonId: string, scope: PlanScope, planUsd: number
): Promise<void> {
  await adminWrite("sales_plans", "upsert",
    { year, quarter, sales_person_id: salesPersonId, scope, plan_usd: planUsd },
    null, "year,quarter,sales_person_id,scope");
}

export async function deleteSalesPlan(id: string): Promise<void> {
  await adminWrite("sales_plans", "delete", {}, id);
}
