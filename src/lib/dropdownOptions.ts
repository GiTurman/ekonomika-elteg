import { supabase } from "@/integrations/supabase/client";
import { adminWrite } from "./adminWrite";

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
  await adminWrite("dropdown_options", "update", { options }, fieldKey);
}
