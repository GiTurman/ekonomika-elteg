import { supabase } from "@/integrations/supabase/client";

export interface DropdownOptions {
  fieldKey: string;
  label: string;
  options: string[];
}

export async function listDropdownOptions(): Promise<DropdownOptions[]> {
  const { data, error } = await supabase.from("dropdown_options").select("*").order("field_key");
  if (error) throw error;
  return (data ?? []).map((r) => ({ fieldKey: r.field_key, label: r.label, options: r.options ?? [] }));
}

export async function updateDropdownOptions(fieldKey: string, options: string[]): Promise<void> {
  const { error } = await supabase.from("dropdown_options").update({ options }).eq("field_key", fieldKey);
  if (error) throw error;
}
