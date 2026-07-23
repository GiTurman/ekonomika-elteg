import { supabase } from "@/integrations/supabase/client";

export interface FieldVisibility {
  fieldKey: string;
  label: string;
  section: string;
  allowedRoles: string[];
}

export async function listFieldVisibility(): Promise<FieldVisibility[]> {
  const { data, error } = await supabase.from("field_visibility").select("*").order("section").order("field_key");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    fieldKey: r.field_key,
    label: r.label,
    section: r.section,
    allowedRoles: r.allowed_roles ?? [],
  }));
}

export async function updateFieldVisibility(fieldKey: string, allowedRoles: string[]): Promise<void> {
  const { error } = await supabase.from("field_visibility").update({ allowed_roles: allowedRoles }).eq("field_key", fieldKey);
  if (error) throw error;
}
