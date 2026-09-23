import { supabase } from "@/integrations/supabase/client";
import { adminWrite } from "./adminWrite";

export interface FieldPermission {
  fieldKey: string;
  label: string;
  section: string;
  allowedRoles: string[];
}

export async function listFieldPermissions(): Promise<FieldPermission[]> {
  const { data, error } = await supabase.from("field_permissions").select("*").order("section").order("field_key");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    fieldKey: r.field_key,
    label: r.label,
    section: r.section,
    allowedRoles: r.allowed_roles ?? [],
  }));
}

export async function updateFieldPermission(fieldKey: string, allowedRoles: string[]): Promise<void> {
  await adminWrite("field_permissions", "update", { allowed_roles: allowedRoles }, fieldKey);
}
