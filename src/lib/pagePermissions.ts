import { supabase } from "@/integrations/supabase/client";

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
  const { error } = await supabase.from("page_permissions").update({ allowed_roles: allowedRoles }).eq("page_key", pageKey);
  if (error) throw error;
}
