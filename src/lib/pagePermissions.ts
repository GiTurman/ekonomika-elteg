import { supabase } from "@/integrations/supabase/client";
import { adminWrite } from "./adminWrite";

export interface PagePermission {
  pageKey: string;
  label: string;
  allowedRoles: string[];
}

export async function listPagePermissions(): Promise<PagePermission[]> {
  const { data, error } = await supabase.from("page_permissions").select("*").order("page_key");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    pageKey: r.page_key,
    label: r.label,
    allowedRoles: r.allowed_roles ?? [],
  }));
}

export async function updatePagePermission(pageKey: string, allowedRoles: string[]): Promise<void> {
  await adminWrite("page_permissions", "update", { allowed_roles: allowedRoles }, pageKey);
}

// upsert — ისეთი გვერდისთვის, რომლის row-ც შესაძლოა ჯერ არ არსებობდეს ბაზაში
// (მაგ. ახლად დამატებული "analytics_working"). თუ არ არსებობს — ქმნის, თუ არსებობს — ანახლებს.
export async function upsertPagePermission(pageKey: string, label: string, allowedRoles: string[]): Promise<void> {
  await adminWrite("page_permissions", "upsert", { page_key: pageKey, label, allowed_roles: allowedRoles }, null, "page_key");
}
