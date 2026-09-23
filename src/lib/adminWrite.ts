import { supabase } from "@/integrations/supabase/client";
import { getStoredUser } from "./access";

// ადმინისტრაციული ჩაწერა (მხოლოდ ფინანსები) — სერვერული ფუნქცია app_admin_write
// ამოწმებს, რომ გამომძახებლის კოდი „ფინანსები" როლს ეკუთვნის. ცხრილებზე
// პირდაპირი INSERT/UPDATE/DELETE ანონიმურად აღარ არის ნებადართული.
export type AdminTable =
  | "app_users" | "app_backups" | "install_tariff_rules" | "page_permissions"
  | "field_permissions" | "field_visibility" | "dropdown_options" | "sales_plans" | "pipeline_projects";

export async function adminWrite(
  table: AdminTable,
  op: "insert" | "update" | "upsert" | "delete",
  row: Record<string, unknown> = {},
  key: string | null = null,
  conflict: string | null = null,
): Promise<void> {
  const code = getStoredUser()?.code ?? "";
  const { error } = await (supabase as any).rpc("app_admin_write", {
    p_code: code, p_table: table, p_op: op, p_row: row, p_key: key, p_conflict: conflict,
  });
  if (error) throw error;
}
